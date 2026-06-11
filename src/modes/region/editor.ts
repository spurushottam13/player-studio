// Region mode editor: the player is stacked regions (top / center / bottom). Each
// region is a vertical list of rows; each row has three alignment lanes
// (start / center / end). Controls drop into lanes; gaps between rows are drop
// targets that create new rows.

import { CONTROL_BY_ID, isFill } from "../../controls";
import type { GridIdentifier } from "../../controls";
import { endDrag, getDraggingId, makeDraggable } from "../../dnd";
import { appendControlBody, appendRemoveButton } from "../../ui/controlbody";
import { el } from "../../ui/dom";
import { createToolbar } from "../../ui/toolbar";
import type { EditorInstance } from "../types";
import { LANES, REGION_NAMES, RegionState } from "./state";
import type { Lane, RegionName, Row } from "./state";
import { buildRegionSpec } from "./spec";

const REGION_LABEL: Record<RegionName, string> = { top: "Top bar", center: "Center", bottom: "Bottom bar" };

export function createRegionEditor(): EditorInstance {
  const state = new RegionState();
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

  panel.append(
    createToolbar({
      theme: state.getTheme(),
      onPrimary: (hex) => state.setTheme({ primary: hex }),
      onSecondary: (hex) => state.setTheme({ secondary: hex }),
      onReset: () => state.resetToDefault(),
      onClear: () => state.clear(),
    }),
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

  const renderControl = (id: GridIdentifier): HTMLElement => {
    const def = CONTROL_BY_ID.get(id);
    const ctrl = el("div", { class: `placed-control ${id}`, title: def?.label ?? id });
    makeDraggable(ctrl, id);
    if (def) appendControlBody(ctrl, def);
    appendRemoveButton(ctrl, (x) => state.remove(x), id);
    return ctrl;
  };

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
      for (const id of row[lane]) laneEl.append(renderControl(id));
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
    for (const region of REGION_NAMES) renderRegion(region);
  };

  const laneIndexAt = (laneEl: HTMLElement, x: number): number => {
    const items = [...laneEl.querySelectorAll<HTMLElement>(":scope > .placed-control")];
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) return i;
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
    if (pending.kind === "lane") {
      state.place(id, { region: pending.region, row: pending.row, lane: pending.lane, index: pending.index });
    } else {
      state.placeInNewRow(id, pending.region, pending.row, pending.region === "center" ? "center" : "start");
    }
    pending = null;
    clearDropFx();
    endDrag();
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

  state.subscribe(render);
  render();

  return {
    id: "region",
    label: "Region",
    element: panel,
    subscribe: (fn) => state.subscribe(fn),
    generateSpec: () => JSON.stringify(buildRegionSpec(state), null, 2),
    has: (id) => state.has(id),
    remove: (id) => state.remove(id),
  };
}
