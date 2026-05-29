// Center panel: the .Player grid stage. Holds the two structural background areas,
// a persistent 13x5 overlay of drop-zone cells, and the placed controls (rebuilt
// on each state change). All controls are flat direct children of .Player.

import { createElement } from "lucide";
import { CONTROL_BY_ID } from "../controls";
import type { GridIdentifier } from "../controls";
import { endDrag, getDraggingId, makeDraggable } from "../dnd";
import { clamp, COLS, maxFitSpan, ROWS, toGridArea } from "../grid";
import { attachResize } from "../resize";
import type { Placement, PlacementState } from "../state";
import { el } from "./dom";

// Time controls render text (HH:MM) instead of an icon; TimeAll shows both.
const TIME_TEXT: Partial<Record<GridIdentifier, string>> = {
  TimeConsumed: "00:00",
  TimeLeft: "00:00",
  TimeDuration: "00:00",
  TimeAll: "00:00 / 00:00",
};

export function createPlayer(state: PlacementState): HTMLElement {
  const panel = el("section", { class: "stage-panel" });

  // Stage + .Player container (created first so toolbar controls can target it).
  const stage = el("div", { class: "stage show-grid" });
  const player = el("div", { class: "Player SHOW-CONTROLS" });

  // Theme colors are CSS custom properties on the .Player element.
  const DEFAULT_PRIMARY = "#1e90ff";
  const DEFAULT_SECONDARY = "#ffffff";
  player.style.setProperty("--primary", DEFAULT_PRIMARY);
  player.style.setProperty("--secondary", DEFAULT_SECONDARY);

  // Toolbar
  const showGrid = el("label", { class: "toolbar-toggle" }) as HTMLLabelElement;
  const showGridInput = el("input", { type: "checkbox" }) as HTMLInputElement;
  showGridInput.checked = true;
  showGrid.append(showGridInput, document.createTextNode(" Show grid"));

  const primaryInput = el("input", { type: "color", title: "Primary color (progress)" }) as HTMLInputElement;
  primaryInput.value = DEFAULT_PRIMARY;
  primaryInput.addEventListener("input", () =>
    player.style.setProperty("--primary", primaryInput.value),
  );
  const primaryLabel = el("label", { class: "color-picker", title: "Primary color (progress bar)" }, [
    primaryInput,
    document.createTextNode(" Primary"),
  ]);

  const secondaryInput = el("input", { type: "color", title: "Secondary color (icons)" }) as HTMLInputElement;
  secondaryInput.value = DEFAULT_SECONDARY;
  secondaryInput.addEventListener("input", () =>
    player.style.setProperty("--secondary", secondaryInput.value),
  );
  const secondaryLabel = el("label", { class: "color-picker", title: "Secondary color (icons)" }, [
    secondaryInput,
    document.createTextNode(" Secondary"),
  ]);

  const resetBtn = el("button", { class: "btn", text: "Reset" });
  resetBtn.addEventListener("click", () => state.resetToDefault());

  const clearBtn = el("button", { class: "btn", text: "Clear all" });
  clearBtn.addEventListener("click", () => state.clear());

  const toolbar = el("div", { class: "toolbar" }, [
    el("h2", { class: "panel-title", text: "Player" }),
    el("div", { class: "toolbar-spacer" }),
    primaryLabel,
    secondaryLabel,
    showGrid,
    resetBtn,
    clearBtn,
  ]);
  panel.append(toolbar);

  player.append(el("div", { class: "Player-Visible-Component-Area" }));
  player.append(el("div", { class: "Player-Hidden-Component-Area" }));

  // Persistent overlay of drop-zone cells (grid template comes from CSS .Player).
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

  showGridInput.addEventListener("change", () => {
    stage.classList.toggle("show-grid", showGridInput.checked);
  });

  // Live registry of the rendered control elements (used by the drag preview).
  const placedEls = new Map<GridIdentifier, HTMLElement>();

  // A translucent placeholder showing where a control dragged from the palette
  // will land during the live preview.
  const ghost = el("div", { class: "drop-ghost" });
  ghost.style.display = "none";
  player.append(ghost);

  // Rebuild placed controls on every state change.
  const renderPlaced = () => {
    player.querySelectorAll(".placed-control").forEach((n) => n.remove());
    placedEls.clear();

    for (const [id, placement] of state.entries()) {
      const def = CONTROL_BY_ID.get(id);
      if (!def) continue;

      const control = el("div", { class: `placed-control ${id}`, title: def.label });
      control.style.gridArea = toGridArea(placement.row, placement.col, placement.colSpan);
      makeDraggable(control, id);
      placedEls.set(id, control);

      if (id === "VideoProgress") {
        // VideoProgress is a range input only — no icon.
        control.classList.add("placed-control--range");
        const range = el("input", { type: "range" }) as HTMLInputElement;
        range.className = "control-range";
        range.min = "0";
        range.max = "100";
        range.value = "40";
        control.append(range);
      } else if (TIME_TEXT[id]) {
        // Time controls render text (HH:MM), not an icon.
        control.classList.add("placed-control--text");
        control.append(el("span", { class: "control-text", text: TIME_TEXT[id] }));
      } else {
        // Everything else (including the extendable Volume) is icon-only.
        control.append(createElement(def.icon, { width: "22", height: "22" }));
      }

      // Remove button
      const removeBtn = el("button", { class: "control-remove", title: "Remove", text: "×" });
      removeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.remove(id);
      });
      control.append(removeBtn);

      // Horizontal resize handle (only meaningful when the control can grow).
      if (def.maxSpan > 1) {
        const handle = el("div", { class: "resize-handle", title: "Drag to resize" });
        attachResize(handle, control, def, state);
        control.append(handle);
      }

      player.append(control);
    }
  };

  // ---- Live drag preview ----
  // Map a viewport point to the grid cell (row, col) under it via the fixed cell
  // overlay. Cells never move, so targeting stays stable while icons reflow.
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

  // Resolve the dragged control + the placement a drop at (row, col) implies.
  const resolveDrop = (
    row: number,
    col: number,
  ): { id: GridIdentifier; placement: Placement } | null => {
    const id = getDraggingId();
    if (!id) return null;
    const def = CONTROL_BY_ID.get(id);
    if (!def) return null;
    const existing = state.get(id);
    const wanted = existing ? existing.colSpan : def.defaultSpan;
    const colSpan = clamp(wanted, 1, Math.min(def.maxSpan, maxFitSpan(col)));
    return { id, placement: { row, col, colSpan } };
  };

  // Position elements to match a proposed layout (live preview).
  const applyLayout = (layout: Map<GridIdentifier, Placement>, draggingId: GridIdentifier) => {
    for (const [id, elem] of placedEls) {
      const pl = layout.get(id);
      if (pl) elem.style.gridArea = toGridArea(pl.row, pl.col, pl.colSpan);
    }
    const dragged = layout.get(draggingId);
    if (dragged && !placedEls.has(draggingId)) {
      // Coming from the palette — show a ghost where it would land.
      ghost.style.gridArea = toGridArea(dragged.row, dragged.col, dragged.colSpan);
      ghost.style.display = "";
    } else {
      ghost.style.display = "none";
    }
  };

  // Restore every control to its committed (state) position.
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
    else revertPreview(); // can't fit — keep originals in place
  });

  player.addEventListener("drop", (e) => {
    const { row, col } = cellAtPoint(e.clientX, e.clientY);
    const d = resolveDrop(row, col);
    if (!d) return;
    e.preventDefault();
    state.placeShifting(d.id, d.placement); // commit (rebuilds via subscribe)
    endDrag();
    ghost.style.display = "none";
  });

  // Leaving the player area (e.g. heading back to the palette) snaps icons back.
  player.addEventListener("dragleave", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && player.contains(to)) return; // still moving inside the player
    revertPreview();
  });

  // A drag that ends without a committed drop (released outside / cancelled).
  document.addEventListener("dragend", revertPreview);

  state.subscribe(renderPlaced);
  renderPlaced();

  return panel;
}
