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

  for (const def of CONTROLS) {
    const icon = createElement(def.icon, { width: "18", height: "18" });
    const chip = el("div", { class: "chip", title: def.label }, [
      icon,
      el("span", { class: "chip-label", text: def.label }),
    ]);
    chip.dataset.id = def.id;
    makeDraggable(chip, def.id);
    chips.set(def.id, chip);
    list.append(chip);
  }

  panel.append(list);
  makeRemoveTarget(panel, state);

  const sync = () => {
    for (const [id, chip] of chips) chip.classList.toggle("chip--placed", state.has(id));
  };
  state.subscribe(sync);
  sync();

  return panel;
}
