// Native HTML5 drag-and-drop wiring: palette chips + placed controls are sources,
// overlay cells are drop targets. The dragged control id is kept in a module
// variable because dataTransfer payloads are not readable during `dragover`.

import { CONTROL_BY_ID } from "./controls";
import type { GridIdentifier } from "./controls";
import { clamp, maxFitSpan } from "./grid";
import type { PlacementState } from "./state";

const MIME = "application/x-player-control";

let draggingId: GridIdentifier | null = null;

// Make a source element (palette chip or placed control) draggable.
export function makeDraggable(el: HTMLElement, id: GridIdentifier): void {
  el.setAttribute("draggable", "true");
  el.addEventListener("dragstart", (e) => {
    draggingId = id;
    e.dataTransfer?.setData(MIME, id);
    e.dataTransfer?.setData("text/plain", id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
    el.classList.add("is-dragging");
    document.body.classList.add("dnd-active"); // highlight grid while dragging
  });
  el.addEventListener("dragend", () => {
    draggingId = null;
    el.classList.remove("is-dragging");
    document.body.classList.remove("dnd-active");
  });
}

// Wire an overlay cell as a drop target at (row, col).
export function makeDropTarget(
  cell: HTMLElement,
  row: number,
  col: number,
  state: PlacementState,
): void {
  cell.addEventListener("dragover", (e) => {
    if (!draggingId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    cell.classList.add("cell--over");
  });

  cell.addEventListener("dragleave", () => {
    cell.classList.remove("cell--over");
  });

  cell.addEventListener("drop", (e) => {
    e.preventDefault();
    cell.classList.remove("cell--over");
    const id = (e.dataTransfer?.getData(MIME) || draggingId) as GridIdentifier | null;
    draggingId = null;
    if (!id) return;

    const def = CONTROL_BY_ID.get(id);
    if (!def) return;

    // Preserve an existing span when moving; otherwise use the control's default.
    const existing = state.get(id);
    const wanted = existing ? existing.colSpan : def.defaultSpan;
    const colSpan = clamp(wanted, 1, Math.min(def.maxSpan, maxFitSpan(col)));

    state.place(id, { row, col, colSpan });
  });
}

// Wire a drop zone (e.g. the palette) that removes a placed control.
export function makeRemoveTarget(el: HTMLElement, state: PlacementState): void {
  el.addEventListener("dragover", (e) => {
    if (!draggingId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    el.classList.add("remove--over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("remove--over"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("remove--over");
    const id = (e.dataTransfer?.getData(MIME) || draggingId) as GridIdentifier | null;
    draggingId = null;
    // Only remove if the control is currently placed (ignore fresh palette drags).
    if (id && state.has(id)) {
      e.preventDefault();
      state.remove(id);
    }
  });
}
