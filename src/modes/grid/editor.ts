// Grid mode editor: the original 13×5 grid. Controls snap to cells; dropping
// reflows same-row neighbours; wide controls (time / progress / volume) resize
// horizontally. A persistent cell overlay provides stable drop targeting.

import { CONTROL_BY_ID } from "../../controls";
import type { GridIdentifier } from "../../controls";
import { endDrag, getDraggingId, makeDraggable } from "../../dnd";
import { appendControlBody, appendRemoveButton } from "../../ui/controlbody";
import { el } from "../../ui/dom";
import { createToolbar } from "../../ui/toolbar";
import type { EditorInstance } from "../types";
import { clamp, COLS, maxFitSpan, ROWS, toGridArea } from "./geometry";
import { attachResize } from "./resize";
import { GridState } from "./state";
import type { Placement } from "./state";
import { buildGridSpec } from "./spec";

export function createGridEditor(): EditorInstance {
  const state = new GridState();
  const panel = el("section", { class: "stage-panel" });

  const stage = el("div", { class: "stage show-grid" });
  const player = el("div", { class: "Player Player--grid SHOW-CONTROLS" });

  panel.append(
    createToolbar({
      theme: state.getTheme(),
      onPrimary: (hex) => state.setTheme({ primary: hex }),
      onSecondary: (hex) => state.setTheme({ secondary: hex }),
      onReset: () => state.resetToDefault(),
      onClear: () => state.clear(),
    }),
  );

  player.append(el("div", { class: "Player-Visible-Component-Area" }));
  player.append(el("div", { class: "Player-Hidden-Component-Area" }));

  // Persistent overlay of drop-zone cells.
  for (let row = 1; row <= ROWS; row++) {
    for (let col = 1; col <= COLS; col++) {
      const cell = el("div", { class: "cell" });
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.style.gridArea = toGridArea(row, col, 1);
      player.append(cell);
    }
  }

  stage.append(player);
  panel.append(stage);

  const placedEls = new Map<GridIdentifier, HTMLElement>();
  const ghost = el("div", { class: "drop-ghost" });
  ghost.style.display = "none";
  player.append(ghost);

  const renderPlaced = () => {
    const t = state.getTheme();
    player.style.setProperty("--primary", t.primary);
    player.style.setProperty("--secondary", t.secondary);
    player.querySelectorAll(".placed-control").forEach((n) => n.remove());
    placedEls.clear();

    for (const [id, placement] of state.entries()) {
      const def = CONTROL_BY_ID.get(id);
      if (!def) continue;
      const control = el("div", { class: `placed-control ${id}`, title: def.label });
      control.style.gridArea = toGridArea(placement.row, placement.col, placement.colSpan);
      makeDraggable(control, id);
      placedEls.set(id, control);

      appendControlBody(control, def);
      appendRemoveButton(control, (x) => state.remove(x), id);

      if (def.maxSpan > 1) {
        const handle = el("div", { class: "resize-handle", title: "Drag to resize" });
        attachResize(handle, control, def, state);
        control.append(handle);
      }
      player.append(control);
    }
  };

  const cellAtPoint = (x: number, y: number): { row: number; col: number } => {
    const cells = player.querySelectorAll<HTMLElement>(".cell");
    let row = 1;
    let col = 1;
    let best = Infinity;
    for (const cell of cells) {
      const r = cell.getBoundingClientRect();
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
        return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      }
      const dx = Math.max(r.left - x, x - r.right, 0);
      const dy = Math.max(r.top - y, y - r.bottom, 0);
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        row = Number(cell.dataset.row);
        col = Number(cell.dataset.col);
      }
    }
    return { row, col };
  };

  const resolveDrop = (row: number, col: number): { id: GridIdentifier; placement: Placement } | null => {
    const id = getDraggingId();
    if (!id) return null;
    const def = CONTROL_BY_ID.get(id);
    if (!def) return null;
    const existing = state.get(id);
    const wanted = existing ? existing.colSpan : def.defaultSpan;
    const colSpan = clamp(wanted, 1, Math.min(def.maxSpan, maxFitSpan(col)));
    return { id, placement: { row, col, colSpan } };
  };

  const applyLayout = (layout: Map<GridIdentifier, Placement>, draggingId: GridIdentifier) => {
    for (const [id, elem] of placedEls) {
      const pl = layout.get(id);
      if (pl) elem.style.gridArea = toGridArea(pl.row, pl.col, pl.colSpan);
    }
    const dragged = layout.get(draggingId);
    if (dragged && !placedEls.has(draggingId)) {
      ghost.style.gridArea = toGridArea(dragged.row, dragged.col, dragged.colSpan);
      ghost.style.display = "";
    } else {
      ghost.style.display = "none";
    }
  };

  const revertPreview = () => {
    for (const [id, elem] of placedEls) {
      const pl = state.get(id);
      if (pl) elem.style.gridArea = toGridArea(pl.row, pl.col, pl.colSpan);
    }
    ghost.style.display = "none";
  };

  player.addEventListener("dragover", (e) => {
    if (!getDraggingId()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const { row, col } = cellAtPoint(e.clientX, e.clientY);
    const d = resolveDrop(row, col);
    if (!d) return;
    const layout = state.previewShift(d.id, d.placement);
    if (layout) applyLayout(layout, d.id);
    else revertPreview();
  });

  player.addEventListener("drop", (e) => {
    const { row, col } = cellAtPoint(e.clientX, e.clientY);
    const d = resolveDrop(row, col);
    if (!d) return;
    e.preventDefault();
    state.placeShifting(d.id, d.placement);
    endDrag();
    ghost.style.display = "none";
  });

  player.addEventListener("dragleave", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && player.contains(to)) return;
    revertPreview();
  });
  document.addEventListener("dragend", revertPreview);

  state.subscribe(renderPlaced);
  renderPlaced();

  return {
    id: "grid",
    label: "Grid",
    element: panel,
    subscribe: (fn) => state.subscribe(fn),
    generateSpec: () => JSON.stringify(buildGridSpec(state), null, 2),
    has: (id) => state.has(id),
    remove: (id) => state.remove(id),
  };
}
