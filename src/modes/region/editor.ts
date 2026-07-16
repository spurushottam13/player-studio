// Region mode editor: the player is stacked regions (top / center / bottom). Each
// region is a vertical list of rows; each row has three alignment lanes
// (start / center / end). Controls drop into lanes; gaps between rows are drop
// targets that create new rows.

import {
  BG_PADDING_MAX,
  BG_RADIUS_MAX,
  DEFAULT_BG_PADDING_X,
  DEFAULT_BG_PADDING_Y,
  DEFAULT_BG_RADIUS,
  DEFAULT_ICON_BG_PADDING,
  DEFAULT_ICON_BG_RADIUS,
  ICON_BG_PADDING_MAX,
  ICON_BG_RADIUS_MAX,
  ICON_SIZE_MAX,
  ICON_SIZE_MIN,
  PLAYER_PADDING_MAX,
  SPACER_WIDTH_MAX,
  SPACER_WIDTH_MIN,
} from "../../controls";
import type { ControlId } from "../../controls";
import { History } from "../../history";
import { isFill, registry } from "../../registry";
import { endDrag, getDraggingId, makeDraggable } from "../../dnd";
import { appendControlBody, appendRemoveButton } from "../../ui/controlbody";
import { el } from "../../ui/dom";
import { openPopover } from "../../ui/popover";
import { createToolbar } from "../../ui/toolbar";
import type { EditorInstance } from "../types";
import { isCollapsible, LANES, REGION_NAMES, RegionState, VIEWPORTS } from "./state";
import type { Lane, RegionName, Row, Viewport } from "./state";
import { buildRegionSpec } from "./spec";

const REGION_LABEL: Record<RegionName, string> = { top: "Top bar", center: "Center", bottom: "Bottom bar" };

// Horizontal resize via a drag handle on the control's edge. Width is written
// inline during the drag (a registry commit would re-render the canvas and
// destroy the element under the pointer) and committed ONCE on release. The
// control's HTML5 drag is suspended for the gesture (the volume-flyout
// pattern) so dragging the handle never starts an item drag.
function attachResizeHandle(
  ctrl: HTMLElement,
  opts: {
    edge: "left" | "right";
    min: number;
    max: () => number; // measured at drag start (e.g. the row's current width)
    commit: (px: number) => void;
  },
): void {
  const handle = el("div", {
    class: opts.edge === "left" ? "resize-handle resize-handle--left" : "resize-handle",
  });
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctrl.setAttribute("draggable", "false");
    ctrl.classList.add("is-resizing");
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = ctrl.getBoundingClientRect().width;
    const max = opts.max();
    let width = Math.round(startWidth);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const raw = startWidth + (opts.edge === "left" ? -dx : dx);
      width = Math.round(Math.min(Math.max(raw, opts.min), max));
      ctrl.style.width = `${width}px`;
    };
    const done = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", done);
      handle.removeEventListener("pointercancel", done);
      ctrl.classList.remove("is-resizing");
      ctrl.setAttribute("draggable", "true");
      opts.commit(width);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", done);
  });
  ctrl.append(handle);
}

// "#rrggbb" + alpha → "rgba(r, g, b, a)". Backgrounds tint via backgroundColor
// alpha, not element opacity — opacity would fade the handles and remove × too.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Paint a background layer: its shared color+opacity and per-layer radius. The
// geometry (which snaps to the layer's lane) is handled separately by
// positionBackground, because it needs the laid-out lane box.
function paintBackground(bgEl: HTMLElement, color: string, opacity: number, radius: number): void {
  bgEl.style.backgroundColor = hexToRgba(color, opacity);
  bgEl.style.borderRadius = `${radius}px`;
}

// A background snaps HORIZONTALLY to the lane it lives in (its controls' box,
// grown by paddingX) but fills the FULL ROW height vertically (grown by
// paddingY). Offsets are relative to the shared positioned .player-row, which
// is also the lane's offsetParent.
function positionBackground(bgEl: HTMLElement, laneEl: HTMLElement, paddingX: number, paddingY: number): void {
  const rowEl = laneEl.offsetParent as HTMLElement | null; // the positioned .player-row
  const rowH = rowEl ? rowEl.clientHeight : laneEl.offsetHeight;
  bgEl.style.left = `${laneEl.offsetLeft - paddingX}px`;
  bgEl.style.top = `${-paddingY}px`;
  bgEl.style.width = `${laneEl.offsetWidth + 2 * paddingX}px`;
  bgEl.style.height = `${rowH + 2 * paddingY}px`;
}

// A background's padding (per-layer, with defaults). Color/opacity are shared
// (theme), radius is per-layer, both read where needed.
function bgPaddingOf(id: ControlId): { x: number; y: number } {
  const def = registry.get(id);
  return { x: def?.paddingX ?? DEFAULT_BG_PADDING_X, y: def?.paddingY ?? DEFAULT_BG_PADDING_Y };
}

export function createRegionEditor(): EditorInstance {
  const state = new RegionState();
  // Combined undo/redo over layout + registry (see history.ts).
  const history = new History(registry, state);
  const panel = el("section", { class: "stage-panel" });

  const player = el("div", { class: "Player Player--region SHOW-CONTROLS" });
  const topEl = el("div", { class: "region region--top" });
  const centerEl = el("div", { class: "region region--center" });
  const bottomEl = el("div", { class: "region region--bottom" });
  topEl.dataset.region = "top";
  centerEl.dataset.region = "center";
  bottomEl.dataset.region = "bottom";
  player.append(
    topEl,
    el("div", { class: "player-middle" }, [centerEl]),
    el("div", { class: "player-bottom" }, [el("div", { class: "player-scrim" }), bottomEl]),
  );

  // ---- Viewport switcher: each viewport holds its own layout + collapse set.
  // Switching it swaps the active design AND resizes the preview to that width,
  // so a narrow viewport shows the responsive bar the user is authoring for.
  const VIEWPORT_LABEL: Record<Viewport, string> = { default: "Default", "490": "≤490", "300": "≤300", "200": "≤200" };
  const VIEWPORT_PX: Record<Viewport, number> = { default: 640, "490": 490, "300": 300, "200": 200 };
  const vpButtons = new Map<Viewport, HTMLElement>();
  const vpSeg = el("div", { class: "seg" });
  for (const vp of VIEWPORTS) {
    const btn = el("button", { class: "seg-btn", text: VIEWPORT_LABEL[vp] });
    btn.addEventListener("click", () => state.setViewport(vp));
    vpButtons.set(vp, btn);
    vpSeg.append(btn);
  }
  const viewportBar = el("div", { class: "subbar" }, [
    el("span", { class: "subbar-label", text: "Viewport" }),
    vpSeg,
    el("span", { class: "subbar-hint", text: "Each viewport keeps its own layout + collapse set." }),
  ]);

  // The "Collapse in Setting" bin lives in the LEFT palette (see ui/palette.ts);
  // this editor only exposes the collapse capability on its EditorInstance below.

  // Live preview of the shared background color/opacity: repaint each layer
  // directly (keeping its own radius) without a state write, so a slider/color
  // drag is smooth and produces a single undo step on release.
  const previewBackgrounds = (color: string, opacity: number) => {
    for (const bg of player.querySelectorAll<HTMLElement>(".control-bg, .icon-bg")) {
      bg.style.backgroundColor = hexToRgba(color, opacity);
    }
  };

  panel.append(
    createToolbar({
      theme: state.getTheme(),
      onPrimary: (hex) => state.setTheme({ primary: hex }),
      onSecondary: (hex) => state.setTheme({ secondary: hex }),
      onBackground: (hex, opacity) => state.setTheme({ bgColor: hex, bgOpacity: opacity }),
      onBackgroundPreview: previewBackgrounds,
      onPlayerPaddingClick: (anchor) => openPlayerPaddingPopover(anchor),
      onReset: () => state.resetToDefault(),
      onClear: () => state.clear(),
      history,
    }),
    viewportBar,
    el("div", { class: "stage" }, [player]),
  );

  const regionEls: Record<RegionName, HTMLElement> = { top: topEl, center: centerEl, bottom: bottomEl };
  const caret = el("div", { class: "drop-caret" });
  let overEl: HTMLElement | null = null;
  const clearDropFx = () => {
    if (overEl) overEl.classList.remove("drop-over");
    overEl = null;
    caret.remove();
  };

  // Paint (or remove) the per-icon background layer on a live control element.
  // `bg === null` removes it. Color/opacity are the shared theme values.
  const paintIconBgOn = (ctrlEl: HTMLElement, bg: { padding: number; radius: number } | null): void => {
    const existing = ctrlEl.querySelector<HTMLElement>(":scope > .icon-bg");
    if (!bg) {
      existing?.remove();
      ctrlEl.classList.remove("has-icon-bg");
      return;
    }
    const t = state.getTheme();
    const layer = existing ?? el("div", { class: "icon-bg" });
    layer.style.setProperty("--ibg-p", `${bg.padding}px`);
    layer.style.setProperty("--ibg-r", `${bg.radius}px`);
    layer.style.backgroundColor = hexToRgba(t.bgColor, t.bgOpacity);
    if (!existing) ctrlEl.prepend(layer);
    ctrlEl.classList.add("has-icon-bg");
  };

  // Click a placed icon → Size slider + a Background toggle (a circle/badge
  // behind just this icon: Padding + Radius). Previews via direct DOM writes
  // (re-queried by id — the canvas may rebuild while the popover is open);
  // commits once per gesture.
  const openIconSizePopover = (anchor: HTMLElement, id: ControlId): void => {
    openPopover(anchor, (body) => {
      const ctrlEl = () => player.querySelector<HTMLElement>(`.placed-control.${CSS.escape(id)}`);

      // --- Size ---
      const readout = el("span", { class: "popover-value", text: `${registry.sizeOf(id)}px` });
      const range = el("input", { type: "range" });
      range.min = String(ICON_SIZE_MIN);
      range.max = String(ICON_SIZE_MAX);
      range.value = String(registry.sizeOf(id));
      range.addEventListener("input", () => {
        readout.textContent = `${range.value}px`;
        const svg = ctrlEl()?.querySelector("svg");
        svg?.setAttribute("width", range.value);
        svg?.setAttribute("height", range.value);
      });
      range.addEventListener("change", () => registry.setSize(id, Number(range.value)));
      body.append(el("div", { class: "popover-row" }, [el("span", { class: "popover-label", text: "Size" }), range, readout]));

      // --- Background (circle/badge behind this icon) ---
      const cur = registry.iconBgOf(id);
      let padding = cur?.padding ?? DEFAULT_ICON_BG_PADDING;
      let radius = cur?.radius ?? DEFAULT_ICON_BG_RADIUS;
      const toggle = el("input", { type: "checkbox" }) as HTMLInputElement;
      toggle.checked = !!cur;
      const previewBg = () => paintIconBgOn(ctrlEl() ?? el("div"), toggle.checked ? { padding, radius } : null);
      const commitBg = () => (toggle.checked ? registry.setIconBg(id, { padding, radius }) : registry.clearIconBg(id));

      const padRow = sliderRow("Padding", 0, ICON_BG_PADDING_MAX, padding, "px",
        (v) => { padding = v; previewBg(); }, () => commitBg());
      const radRow = sliderRow("Radius", 0, ICON_BG_RADIUS_MAX, radius, "px",
        (v) => { radius = v; previewBg(); }, () => commitBg());
      const refresh = () => { padRow.style.display = radRow.style.display = toggle.checked ? "" : "none"; };
      toggle.addEventListener("change", () => { previewBg(); commitBg(); refresh(); });

      body.append(
        el("div", { class: "popover-row" }, [el("span", { class: "popover-label", text: "Background" }), toggle]),
        padRow,
        radRow,
      );
      refresh();
    });
  };

  // A small labelled range row for a popover.
  const sliderRow = (
    label: string,
    min: number,
    max: number,
    value: number,
    unit: string,
    onInput: (v: number) => void,
    onCommit: (v: number) => void,
  ): HTMLElement => {
    const range = el("input", { type: "range" }) as HTMLInputElement;
    range.min = String(min);
    range.max = String(max);
    range.value = String(value);
    const out = el("span", { class: "popover-value", text: `${value}${unit}` });
    range.addEventListener("input", () => {
      out.textContent = `${range.value}${unit}`;
      onInput(Number(range.value));
    });
    range.addEventListener("change", () => onCommit(Number(range.value)));
    return el("div", { class: "popover-row" }, [el("span", { class: "popover-label", text: label }), range, out]);
  };

  // The lane element a rendered background layer snaps to (same row, its lane).
  const laneElOf = (bgEl: HTMLElement): HTMLElement | null =>
    bgEl.closest(".player-row")?.querySelector<HTMLElement>(`.lane--${bgEl.dataset.lane}`) ?? null;

  // Click a background layer → padding X / padding Y / radius popover. Color and
  // opacity are NOT here — they are the shared toolbar tool. Padding previews by
  // re-snapping the layer to its lane; radius previews by repainting.
  const openBackgroundPopover = (anchor: HTMLElement, id: ControlId): void => {
    const def = registry.get(id);
    const padX0 = def?.paddingX ?? DEFAULT_BG_PADDING_X;
    const padY0 = def?.paddingY ?? DEFAULT_BG_PADDING_Y;
    const radius0 = def?.radius ?? DEFAULT_BG_RADIUS;
    const liveBg = () => player.querySelector<HTMLElement>(`.control-bg.${CSS.escape(id)}`);
    let padX = padX0;
    let padY = padY0;
    openPopover(anchor, (body) => {
      const reposition = () => {
        const bg = liveBg();
        const lane = bg && laneElOf(bg);
        if (bg && lane) positionBackground(bg, lane, padX, padY);
      };
      body.append(
        sliderRow("Padding X", 0, BG_PADDING_MAX, padX0, "px",
          (v) => { padX = v; reposition(); },
          () => registry.updateCustom(id, { paddingX: padX })),
        sliderRow("Padding Y", 0, BG_PADDING_MAX, padY0, "px",
          (v) => { padY = v; reposition(); },
          () => registry.updateCustom(id, { paddingY: padY })),
        sliderRow("Radius", 0, BG_RADIUS_MAX, radius0, "px",
          (v) => { const bg = liveBg(); if (bg) bg.style.borderRadius = `${v}px`; },
          (v) => registry.updateCustom(id, { radius: v })),
      );
    });
  };

  // Click a spacer → width slider popover (like the icon-size popover).
  const openSpacerWidthPopover = (anchor: HTMLElement, id: ControlId): void => {
    const width0 = registry.get(id)?.width ?? SPACER_WIDTH_MIN;
    openPopover(anchor, (body) => {
      body.append(
        sliderRow("Width", SPACER_WIDTH_MIN, SPACER_WIDTH_MAX, width0, "px",
          (v) => {
            const sp = player.querySelector<HTMLElement>(`.placed-control--spacer.${CSS.escape(id)}`);
            if (sp) sp.style.width = `${v}px`;
          },
          (v) => registry.updateCustom(id, { width: v })),
      );
    });
  };

  // Toolbar "Padding" tool → X / Y sliders for the whole .Player container.
  // Preview writes the CSS vars live and re-snaps backgrounds (padding shifts
  // the lanes); commit stores it in the theme.
  const openPlayerPaddingPopover = (anchor: HTMLElement): void => {
    const t = state.getTheme();
    openPopover(anchor, (body) => {
      body.append(
        sliderRow("Padding X", 0, PLAYER_PADDING_MAX, t.playerPadX, "px",
          (v) => { player.style.setProperty("--pad-x", `${v}px`); positionAllBackgrounds(); },
          (v) => state.setTheme({ playerPadX: v })),
        sliderRow("Padding Y", 0, PLAYER_PADDING_MAX, t.playerPadY, "px",
          (v) => { player.style.setProperty("--pad-y", `${v}px`); positionAllBackgrounds(); },
          (v) => state.setTheme({ playerPadY: v })),
      );
    });
  };

  // Open the property popover on a plain click — but not after a drag, and not
  // for clicks on the remove ×, the volume flyout, or a resize handle (the ×
  // stops its own clicks; the volume range only stops pointerdown).
  const wirePropertyClick = (ctrl: HTMLElement, id: ControlId): void => {
    let dragged = false;
    ctrl.addEventListener("pointerdown", () => {
      dragged = false;
    });
    ctrl.addEventListener("dragstart", () => {
      dragged = true;
    });
    ctrl.addEventListener("click", (e) => {
      if (dragged) return;
      if ((e.target as HTMLElement).closest(".control-remove, .volume-flyout, .resize-handle")) return;
      const kind = registry.kindOf(id);
      if (kind === "icon") openIconSizePopover(ctrl, id);
      else if (kind === "background") openBackgroundPopover(ctrl, id);
      else if (kind === "spacer") openSpacerWidthPopover(ctrl, id);
    });
  };

  const renderControl = (id: ControlId): HTMLElement => {
    const def = registry.get(id);
    const ctrl = el("div", { class: `placed-control ${id}`, title: def?.label ?? id });
    makeDraggable(ctrl, id);
    if (def) appendControlBody(ctrl, def);
    // Per-icon background (circle/badge behind the glyph), if the user set one.
    const iconBg = registry.iconBgOf(id);
    if (iconBg) paintIconBgOn(ctrl, iconBg);
    appendRemoveButton(ctrl, (x) => state.remove(x), id);
    if (def?.kind === "spacer") {
      attachResizeHandle(ctrl, {
        edge: "right",
        min: SPACER_WIDTH_MIN,
        max: () => SPACER_WIDTH_MAX,
        commit: (px) => registry.updateCustom(id, { width: px }),
      });
    }
    wirePropertyClick(ctrl, id);
    return ctrl;
  };

  // A background renders as an absolutely-positioned layer on the ROW, behind
  // the lanes (which carry z-index 1). It SNAPS to the box of the lane that
  // holds it (grown by its padding) — so a start-lane background spans exactly
  // its start-lane controls. Color/opacity are the shared theme; only the
  // geometry needs the laid-out lane, done later in positionAllBackgrounds.
  const renderBackground = (id: ControlId, lane: Lane): HTMLElement => {
    const def = registry.get(id);
    const t = state.getTheme();
    const bgEl = el("div", { class: `placed-control control-bg ${id}`, title: def?.label ?? id });
    bgEl.dataset.id = id;
    bgEl.dataset.lane = lane;
    paintBackground(bgEl, t.bgColor, t.bgOpacity, def?.radius ?? DEFAULT_BG_RADIUS);
    makeDraggable(bgEl, id);
    appendRemoveButton(bgEl, (x) => state.remove(x), id);
    wirePropertyClick(bgEl, id);
    return bgEl;
  };

  // After a render, snap every background to its lane's laid-out box. Reads
  // offsets (forces layout) — safe because the regions are already in the DOM.
  const positionAllBackgrounds = () => {
    for (const bgEl of player.querySelectorAll<HTMLElement>(".control-bg")) {
      const laneEl = laneElOf(bgEl);
      if (!laneEl) continue;
      const pad = bgPaddingOf(bgEl.dataset.id ?? "");
      positionBackground(bgEl, laneEl, pad.x, pad.y);
    }
  };

  const isBackground = (id: ControlId) => registry.kindOf(id) === "background";

  const renderRow = (region: RegionName, rowIndex: number, row: Row): HTMLElement => {
    const hasFill = LANES.some((lane) => row[lane].some(isFill));
    const rowEl = el("div", { class: hasFill ? "player-row player-row--fill" : "player-row" });
    for (const lane of LANES) {
      const laneEl = el("div", { class: `lane lane--${lane}` });
      laneEl.dataset.drop = "lane";
      laneEl.dataset.region = region;
      laneEl.dataset.row = String(rowIndex);
      laneEl.dataset.lane = lane;
      if (row[lane].some(isFill)) laneEl.classList.add("lane--has-fill");
      // Backgrounds stay in the lane's state array but render as row layers
      // (positioned to snap to this lane after layout, in positionAllBackgrounds).
      for (const id of row[lane]) {
        if (isBackground(id)) rowEl.append(renderBackground(id, lane));
        else laneEl.append(renderControl(id));
      }
      rowEl.append(laneEl);
    }
    return rowEl;
  };

  const renderGap = (region: RegionName, atRow: number): HTMLElement => {
    const gap = el("div", { class: "row-gap" });
    gap.dataset.drop = "gap";
    gap.dataset.region = region;
    gap.dataset.row = String(atRow);
    return gap;
  };

  const renderRegion = (region: RegionName) => {
    const host = regionEls[region];
    host.replaceChildren();
    const rows = state.rows(region);
    host.append(renderGap(region, 0));
    rows.forEach((row, i) => {
      host.append(renderRow(region, i, row));
      host.append(renderGap(region, i + 1));
    });
    if (rows.length === 0) {
      const empty = el("div", { class: "region-empty", text: `Drop here — ${REGION_LABEL[region]}` });
      empty.dataset.drop = "gap";
      empty.dataset.region = region;
      empty.dataset.row = "0";
      host.append(empty);
    }
  };

  const render = () => {
    const t = state.getTheme();
    player.style.setProperty("--primary", t.primary);
    player.style.setProperty("--secondary", t.secondary);
    player.style.setProperty("--pad-x", `${t.playerPadX}px`);
    player.style.setProperty("--pad-y", `${t.playerPadY}px`);
    const vp = state.getViewport();
    const w = VIEWPORT_PX[vp];
    player.style.width = `${w}px`;
    player.style.height = `${Math.round((w * 9) / 16)}px`;
    for (const [v, btn] of vpButtons) btn.classList.toggle("seg-btn--active", v === vp);
    for (const region of REGION_NAMES) renderRegion(region);
    // Backgrounds snap to their lanes only after the lanes are laid out.
    positionAllBackgrounds();
  };

  const laneIndexAt = (laneEl: HTMLElement, x: number): number => {
    const items = [...laneEl.querySelectorAll<HTMLElement>(":scope > .placed-control:not(.control-bg)")];
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) return i;
    }
    return items.length;
  };

  // laneIndexAt counts the lane's DOM children, but backgrounds live in the
  // state lane array while rendering OUTSIDE the lane (as row layers) — so a
  // DOM index is an index among visible items only. Map it back to a state
  // index by skipping background ids.
  const toStateIndex = (region: RegionName, row: number, lane: Lane, domIndex: number): number => {
    const items = state.rows(region)[row]?.[lane] ?? [];
    let visible = 0;
    for (let i = 0; i < items.length; i++) {
      if (isBackground(items[i])) continue;
      if (visible === domIndex) return i;
      visible++;
    }
    return items.length;
  };

  let pending:
    | { kind: "lane"; region: RegionName; row: number; lane: Lane; index: number }
    | { kind: "gap"; region: RegionName; row: number }
    | null = null;

  player.addEventListener("dragover", (e) => {
    if (!getDraggingId()) return;
    const dropEl = (e.target as HTMLElement).closest<HTMLElement>("[data-drop]");
    if (!dropEl) {
      clearDropFx();
      pending = null;
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (overEl !== dropEl) {
      if (overEl) overEl.classList.remove("drop-over");
      overEl = dropEl;
      overEl.classList.add("drop-over");
    }
    const region = dropEl.dataset.region as RegionName;
    if (dropEl.dataset.drop === "lane") {
      const lane = dropEl.dataset.lane as Lane;
      const row = Number(dropEl.dataset.row);
      const index = laneIndexAt(dropEl, e.clientX);
      const items = dropEl.querySelectorAll<HTMLElement>(":scope > .placed-control");
      dropEl.insertBefore(caret, items[index] ?? null);
      pending = { kind: "lane", region, row, lane, index };
    } else {
      caret.remove();
      pending = { kind: "gap", region, row: Number(dropEl.dataset.row) };
    }
  });

  player.addEventListener("drop", (e) => {
    const id = getDraggingId();
    if (!id || !pending) return;
    e.preventDefault();
    const target = pending;
    pending = null;
    // Clear drop FX and dnd-active BEFORE the re-render: while dragging, lanes
    // are inflated (bigger min-size + padding) to show drop targets, and a
    // background snaps to its lane's box — so it must measure the SETTLED lane,
    // not the inflated one.
    clearDropFx();
    endDrag();
    if (target.kind === "lane") {
      state.place(id, {
        region: target.region,
        row: target.row,
        lane: target.lane,
        index: toStateIndex(target.region, target.row, target.lane, target.index),
      });
    } else {
      state.placeInNewRow(id, target.region, target.row, target.region === "center" ? "center" : "start");
    }
  });

  player.addEventListener("dragleave", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && player.contains(to)) return;
    clearDropFx();
    pending = null;
  });
  document.addEventListener("dragend", () => {
    clearDropFx();
    pending = null;
  });

  // Keyboard undo/redo (Cmd/Ctrl+Z, Shift+… or Ctrl+Y for redo). Ignored while
  // typing in a field so native text undo still works there.
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z") {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    } else if (k === "y") {
      e.preventDefault();
      history.redo();
    }
  });

  state.subscribe(render);
  // Re-render when icons change too (an override / custom-icon edit must update a
  // control that's already on the canvas, not just the palette).
  registry.subscribe(render);
  render();

  return {
    id: "region",
    label: "Region",
    element: panel,
    subscribe: (fn) => state.subscribe(fn),
    generateSpec: () => JSON.stringify(buildRegionSpec(state), null, 2),
    has: (id) => state.has(id),
    remove: (id) => state.remove(id),
    purge: (id) => state.purge(id),
    // Collapse-in-Setting capability — rendered by the left palette.
    collapsible: true,
    managesSetting: true,
    canCollapse: (id) => isCollapsible(id) && !state.isCollapsed(id),
    getCollapsed: () => state.getCollapsed(),
    collapse: (id) => state.collapse(id),
    uncollapse: (id) => state.uncollapse(id),
    isCollapsed: (id) => state.isCollapsed(id),
  };
}
