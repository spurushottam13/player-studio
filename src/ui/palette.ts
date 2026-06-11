// Left panel: the 21 draggable control chips. Shared across all modes. Also acts
// as a remove target — drag a placed control back here to take it off the player.
// "Placed" state and removal follow whichever mode is currently active.

import { createElement } from "lucide";
import { CONTROLS } from "../controls";
import type { GridIdentifier } from "../controls";
import { makeDraggable, makeRemoveTarget } from "../dnd";
import type { Studio } from "../studio";
import { el } from "./dom";

export function createPalette(studio: Studio): HTMLElement {
  const panel = el("aside", { class: "palette-panel" });
  panel.append(el("h2", { class: "panel-title", text: "Controls" }));
  panel.append(
    el("p", {
      class: "palette-hint",
      text: "Drag a control onto the player. Drag a placed control back here to remove it.",
    }),
  );

  const list = el("div", { class: "chip-list" });
  const chips = new Map<GridIdentifier, HTMLElement>();
  const dragImages = el("div", { class: "drag-image-holder" });

  for (const def of CONTROLS) {
    const icon = createElement(def.icon, { width: "18", height: "18" });
    const chip = el("div", { class: "chip", title: def.label }, [icon, el("span", { class: "chip-label", text: def.label })]);
    chip.dataset.id = def.id;

    const dragImage = el("div", { class: "chip-drag-image" }, [createElement(def.icon, { width: "24", height: "24" })]);
    dragImages.append(dragImage);

    makeDraggable(chip, def.id, dragImage);
    chips.set(def.id, chip);
    list.append(chip);
  }

  panel.append(list, dragImages);

  // Remove target + placed-state both proxy to the active editor.
  makeRemoveTarget(panel, {
    has: (id) => studio.active().has(id),
    remove: (id) => studio.active().remove(id),
  });

  const sync = () => {
    const active = studio.active();
    for (const [id, chip] of chips) chip.classList.toggle("chip--placed", active.has(id));
  };
  studio.onChange(sync);
  sync();

  return panel;
}
