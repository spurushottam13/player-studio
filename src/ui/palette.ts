// Left panel: the 21 draggable control chips. Also acts as a remove target —
// drag a placed control back here to take it off the player.

import { createElement } from "lucide";
import { CONTROLS } from "../controls";
import type { GridIdentifier } from "../controls";
import { makeDraggable, makeRemoveTarget } from "../dnd";
import type { PlacementState } from "../state";
import { el } from "./dom";

export function createPalette(state: PlacementState): HTMLElement {
  const panel = el("aside", { class: "palette-panel" });
  panel.append(el("h2", { class: "panel-title", text: "Controls" }));

  const hint = el("p", {
    class: "palette-hint",
    text: "Drag a control onto the player. Drag a placed control back here to remove it.",
  });
  panel.append(hint);

  const list = el("div", { class: "chip-list" });
  const chips = new Map<GridIdentifier, HTMLElement>();

  // Off-screen holder for the icon-only drag previews. setDragImage needs the
  // element to be rendered, so it lives in the DOM but out of view.
  const dragImages = el("div", { class: "drag-image-holder" });

  for (const def of CONTROLS) {
    const icon = createElement(def.icon, { width: "18", height: "18" });
    const chip = el("div", { class: "chip", title: def.label }, [
      icon,
      el("span", { class: "chip-label", text: def.label }),
    ]);
    chip.dataset.id = def.id;

    // Drag preview: just the control icon, no text label.
    const dragImage = el("div", { class: "chip-drag-image" }, [
      createElement(def.icon, { width: "24", height: "24" }),
    ]);
    dragImages.append(dragImage);

    makeDraggable(chip, def.id, dragImage);
    chips.set(def.id, chip);
    list.append(chip);
  }

  panel.append(list, dragImages);
  makeRemoveTarget(panel, state);

  const sync = () => {
    for (const [id, chip] of chips) chip.classList.toggle("chip--placed", state.has(id));
  };
  state.subscribe(sync);
  sync();

  return panel;
}
