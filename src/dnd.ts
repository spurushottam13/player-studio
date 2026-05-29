// Native HTML5 drag-and-drop wiring: palette chips + placed controls are sources;
// the player handles drop targeting itself (see ui/player.ts), reading the dragged
// control id from this module since dataTransfer payloads aren't readable during
// `dragover`.

import type { GridIdentifier } from "./controls";
import type { PlacementState } from "./state";

const MIME = "application/x-player-control";

let draggingId: GridIdentifier | null = null;

export function getDraggingId(): GridIdentifier | null {
  return draggingId;
}

// Force-end the current drag. Needed when a drop commit rebuilds the DOM and
// removes the drag-source element, in which case its own `dragend` may not fire.
export function endDrag(): void {
  draggingId = null;
  document.body.classList.remove("dnd-active");
}

// Make a source element (palette chip or placed control) draggable. An optional
// `dragImage` overrides the browser's default drag preview (e.g. to show just the
// control icon instead of the whole palette chip with its text label).
export function makeDraggable(
  el: HTMLElement,
  id: GridIdentifier,
  dragImage?: HTMLElement,
): void {
  el.setAttribute("draggable", "true");
  el.addEventListener("dragstart", (e) => {
    draggingId = id;
    e.dataTransfer?.setData(MIME, id);
    e.dataTransfer?.setData("text/plain", id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
    if (dragImage && e.dataTransfer) e.dataTransfer.setDragImage(dragImage, 18, 18);
    el.classList.add("is-dragging");
    document.body.classList.add("dnd-active"); // highlight grid while dragging
  });
  el.addEventListener("dragend", () => {
    draggingId = null;
    el.classList.remove("is-dragging");
    document.body.classList.remove("dnd-active");
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
