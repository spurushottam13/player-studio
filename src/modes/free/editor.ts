// Free mode editor: an open canvas. Palette chips drop anywhere (native DnD);
// placed controls are pointer-dragged to move freely and re-anchored on release;
// dragging a control off the canvas deletes it.

import { CONTROL_BY_ID } from "../../controls";
import type { GridIdentifier } from "../../controls";
import { endDrag, getDraggingId } from "../../dnd";
import { appendControlBody, appendRemoveButton } from "../../ui/controlbody";
import { el } from "../../ui/dom";
import { createToolbar } from "../../ui/toolbar";
import type { EditorInstance } from "../types";
import { deriveAnchorX, deriveAnchorY, FreeState } from "./state";
import type { Placement } from "./state";
import { buildFreeSpec } from "./spec";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const tx = (a: Placement["anchorX"]) => (a === "left" ? "0" : a === "center" ? "-50%" : "-100%");
const ty = (a: Placement["anchorY"]) => (a === "top" ? "0" : a === "center" ? "-50%" : "-100%");

function applyAnchor(ctrl: HTMLElement, p: Placement): void {
  ctrl.style.left = `${p.x * 100}%`;
  ctrl.style.top = `${p.y * 100}%`;
  ctrl.style.transform = `translate(${tx(p.anchorX)}, ${ty(p.anchorY)})`;
  if (typeof p.width === "number") ctrl.style.width = `${p.width * 100}%`;
}

export function createFreeEditor(): EditorInstance {
  const state = new FreeState();
  const panel = el("section", { class: "stage-panel" });

  const player = el("div", { class: "Player Player--free SHOW-CONTROLS" });
  const scrim = el("div", { class: "player-scrim" });
  const canvas = el("div", { class: "player-canvas" });
  player.append(scrim, canvas);

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

  const makeMovable = (ctrl: HTMLElement, id: GridIdentifier) => {
    ctrl.setAttribute("draggable", "false");
    ctrl.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".control-remove")) return;
      e.preventDefault();
      ctrl.setPointerCapture(e.pointerId);
      ctrl.classList.add("is-moving");

      const box = ctrl.getBoundingClientRect();
      const w = box.width;
      const h = box.height;
      const grabDX = e.clientX - box.left;
      const grabDY = e.clientY - box.top;

      const onMove = (ev: PointerEvent) => {
        const c = canvas.getBoundingClientRect();
        const cx = clamp01((ev.clientX - grabDX + w / 2 - c.left) / c.width);
        const cy = clamp01((ev.clientY - grabDY + h / 2 - c.top) / c.height);
        ctrl.style.left = `${cx * 100}%`;
        ctrl.style.top = `${cy * 100}%`;
        ctrl.style.transform = "translate(-50%, -50%)";
      };

      const onUp = (ev: PointerEvent) => {
        ctrl.releasePointerCapture(ev.pointerId);
        ctrl.removeEventListener("pointermove", onMove);
        ctrl.removeEventListener("pointerup", onUp);
        ctrl.classList.remove("is-moving");

        const c = canvas.getBoundingClientRect();
        if (ev.clientX < c.left || ev.clientX > c.right || ev.clientY < c.top || ev.clientY > c.bottom) {
          state.remove(id);
          return;
        }
        const rect = ctrl.getBoundingClientRect();
        const centerX = (rect.left + rect.width / 2 - c.left) / c.width;
        const centerY = (rect.top + rect.height / 2 - c.top) / c.height;
        const anchorX = deriveAnchorX(centerX);
        const anchorY = deriveAnchorY(centerY);
        const ax = anchorX === "left" ? rect.left : anchorX === "right" ? rect.right : rect.left + rect.width / 2;
        const ay = anchorY === "top" ? rect.top : anchorY === "bottom" ? rect.bottom : rect.top + rect.height / 2;
        state.place(id, { x: clamp01((ax - c.left) / c.width), y: clamp01((ay - c.top) / c.height), anchorX, anchorY });
      };

      ctrl.addEventListener("pointermove", onMove);
      ctrl.addEventListener("pointerup", onUp);
    });
  };

  const renderControl = (id: GridIdentifier, p: Placement): HTMLElement => {
    const def = CONTROL_BY_ID.get(id);
    const ctrl = el("div", { class: `placed-control ${id}`, title: def?.label ?? id });
    if (def) appendControlBody(ctrl, def);
    appendRemoveButton(ctrl, (x) => state.remove(x), id);
    applyAnchor(ctrl, p);
    makeMovable(ctrl, id);
    return ctrl;
  };

  const render = () => {
    const t = state.getTheme();
    player.style.setProperty("--primary", t.primary);
    player.style.setProperty("--secondary", t.secondary);
    canvas.querySelectorAll(".placed-control").forEach((n) => n.remove());
    for (const [id, p] of state.entries()) canvas.append(renderControl(id, p));
  };

  canvas.addEventListener("dragover", (e) => {
    if (!getDraggingId()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    canvas.classList.add("canvas--over");
  });
  canvas.addEventListener("dragleave", (e) => {
    if (e.relatedTarget && canvas.contains(e.relatedTarget as Node)) return;
    canvas.classList.remove("canvas--over");
  });
  canvas.addEventListener("drop", (e) => {
    const id = getDraggingId();
    if (!id) return;
    e.preventDefault();
    canvas.classList.remove("canvas--over");
    const c = canvas.getBoundingClientRect();
    const x = clamp01((e.clientX - c.left) / c.width);
    const y = clamp01((e.clientY - c.top) / c.height);
    state.place(id, { x, y, anchorX: deriveAnchorX(x), anchorY: deriveAnchorY(y) });
    endDrag();
  });

  state.subscribe(render);
  render();

  return {
    id: "free",
    label: "Free",
    element: panel,
    subscribe: (fn) => state.subscribe(fn),
    generateSpec: () => JSON.stringify(buildFreeSpec(state), null, 2),
    has: (id) => state.has(id),
    remove: (id) => state.remove(id),
  };
}
