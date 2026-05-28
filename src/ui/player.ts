// Center panel: the .Player grid stage. Holds the two structural background areas,
// a persistent 13x5 overlay of drop-zone cells, and the placed controls (rebuilt
// on each state change). All controls are flat direct children of .Player.

import { createElement } from "lucide";
import { CONTROL_BY_ID } from "../controls";
import type { GridIdentifier } from "../controls";
import { makeDraggable, makeDropTarget } from "../dnd";
import { COLS, ROWS, toGridArea } from "../grid";
import { attachResize } from "../resize";
import type { PlacementState } from "../state";
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

  // Persistent overlay drop-zone cells.
  for (let row = 1; row <= ROWS; row++) {
    for (let col = 1; col <= COLS; col++) {
      const cell = el("div", { class: "cell" });
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.style.gridArea = toGridArea(row, col, 1);
      makeDropTarget(cell, row, col, state);
      player.append(cell);
    }
  }

  stage.append(player);
  panel.append(stage);

  showGridInput.addEventListener("change", () => {
    stage.classList.toggle("show-grid", showGridInput.checked);
  });

  // Rebuild placed controls on every state change.
  const renderPlaced = () => {
    player.querySelectorAll(".placed-control").forEach((n) => n.remove());

    for (const [id, placement] of state.entries()) {
      const def = CONTROL_BY_ID.get(id);
      if (!def) continue;

      const control = el("div", { class: `placed-control ${id}`, title: def.label });
      control.style.gridArea = toGridArea(placement.row, placement.col, placement.colSpan);
      makeDraggable(control, id);

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

  state.subscribe(renderPlaced);
  renderPlaced();

  return panel;
}
