// Pointer-driven horizontal resize of a placed grid control. Snaps to whole cells
// by reading live cell rects (the column template is non-uniform), and clamps so
// the control never overflows the grid's right edge.

import type { ControlDef } from "../../controls";
import { clamp, maxFitSpan, toGridArea } from "./geometry";
import type { GridState } from "./state";

function columnAtX(player: HTMLElement, row: number, clientX: number): number {
  const cells = player.querySelectorAll<HTMLElement>(`.cell[data-row="${row}"]`);
  let result = 1;
  let best = -Infinity;
  for (const cell of cells) {
    const col = Number(cell.dataset.col);
    const rect = cell.getBoundingClientRect();
    if (clientX >= rect.left && clientX < rect.right) return col;
    if (rect.left <= clientX && rect.left > best) {
      best = rect.left;
      result = col;
    }
  }
  return result;
}

export function attachResize(handle: HTMLElement, controlEl: HTMLElement, def: ControlDef, state: GridState): void {
  handle.addEventListener("pointerdown", (e) => {
    const placement = state.get(def.id);
    const player = controlEl.parentElement as HTMLElement | null;
    if (!placement || !player) return;

    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    controlEl.classList.add("is-resizing");

    const { row, col } = placement;
    const maxSpan = Math.min(def.maxSpan, maxFitSpan(col));
    let colSpan = placement.colSpan;

    const onMove = (ev: PointerEvent) => {
      const targetCol = columnAtX(player, row, ev.clientX);
      colSpan = clamp(targetCol - col + 1, 1, maxSpan);
      controlEl.style.gridArea = toGridArea(row, col, colSpan);
    };
    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      controlEl.classList.remove("is-resizing");
      state.resize(def.id, colSpan);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
}
