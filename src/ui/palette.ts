// Left panel: the 21 draggable control chips, plus (for modes that support it)
// a "Collapse in Setting" bin below them. Also acts as a remove target — drag a
// placed control back here to take it off the player. "Placed" state, removal,
// and the collapse bin all proxy to whichever editor is currently active.

import { createElement } from "lucide";
import { CONTROLS, CONTROL_BY_ID } from "../controls";
import type { GridIdentifier } from "../controls";
import { endDrag, makeCollapseTarget, makeDraggable, makeRemoveTarget } from "../dnd";
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

  // ---- Collapse-in-Setting bin (only for modes that expose the capability) ----
  // Drop an icon here to fold it into the Setting menu; the Setting icon on the
  // bar is then auto-shown while at least one control is collapsed.
  let collapseItems: HTMLElement | null = null;
  if (studio.active().collapsible) {
    collapseItems = el("div", { class: "collapse-items" });
    const bin = el("div", { class: "collapse-bin" }, [collapseItems]);
    panel.append(
      el("h2", { class: "panel-title panel-title--sub", text: "Collapse in Setting" }),
      el("p", {
        class: "palette-hint",
        text: "Drag an icon here to fold it into the Setting menu. The Setting icon shows only while this list has at least one control.",
      }),
      bin,
    );
    makeCollapseTarget(bin, {
      canCollapse: (id) => studio.active().canCollapse?.(id) ?? false,
      collapse: (id) => {
        studio.active().collapse?.(id);
        endDrag(); // dragged source may be rebuilt away; clear drag state
      },
    });
    // Keep collapse drops/hover from bubbling to the panel-wide remove target.
    for (const ev of ["dragover", "dragleave", "drop"] as const) {
      bin.addEventListener(ev, (e) => e.stopPropagation());
    }
  }

  const renderCollapsed = () => {
    if (!collapseItems) return;
    const active = studio.active();
    collapseItems.replaceChildren();
    const ids = active.getCollapsed?.() ?? [];
    if (ids.length === 0) {
      collapseItems.append(el("span", { class: "collapse-empty", text: "No controls collapsed." }));
      return;
    }
    for (const id of ids) {
      const def = CONTROL_BY_ID.get(id);
      const chip = el("div", { class: `collapsed-chip ${id}`, title: def?.label ?? id });
      makeDraggable(chip, id); // drag back onto the bar to re-place it
      if (def) chip.append(createElement(def.icon, { width: "16", height: "16" }));
      const off = el("button", { class: "collapsed-chip-remove", title: "Remove from Setting", text: "×" });
      off.addEventListener("click", (e) => {
        e.stopPropagation();
        studio.active().uncollapse?.(id);
      });
      chip.append(off);
      collapseItems.append(chip);
    }
  };

  const sync = () => {
    const active = studio.active();
    for (const [id, chip] of chips) {
      chip.classList.toggle("chip--placed", active.has(id));
      // Setting is auto-managed (driven by the collapse list) → not draggable.
      if (id === "Setting" && active.managesSetting) {
        chip.classList.add("chip--managed");
        chip.setAttribute("draggable", "false");
        chip.title = "Setting — auto-shown when controls are collapsed";
      }
    }
    renderCollapsed();
  };
  studio.onChange(sync);
  sync();

  return panel;
}
