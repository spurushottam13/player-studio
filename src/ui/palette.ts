// Left panel: the draggable control chips (built-ins + user-added custom controls),
// plus a "Collapse in Setting" bin below them. Also acts as a remove target — drag
// a placed control back here to take it off the player. Each chip exposes inline
// actions: change its icon (any chip), reset an override (overridden built-ins),
// and delete (custom controls). "Add custom control" creates a new chip from any
// Lucide icon. Placed-state, removal, and the collapse bin proxy to the active editor.

import type { ControlId } from "../controls";
import { renderIcon } from "../icons";
import { registry } from "../registry";
import { endDrag, makeCollapseTarget, makeDraggable, makeRemoveTarget } from "../dnd";
import type { Studio } from "../studio";
import { el } from "./dom";
import { pickIcon } from "./iconpicker";

// A small chip action button that never starts a chip drag.
function actionBtn(cls: string, title: string, text: string, onClick: () => void): HTMLElement {
  const b = el("button", { class: `chip-act ${cls}`, title, text });
  b.setAttribute("draggable", "false");
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function createPalette(studio: Studio): HTMLElement {
  const panel = el("aside", { class: "palette-panel" });
  panel.append(el("h2", { class: "panel-title", text: "Controls" }));
  panel.append(
    el("p", {
      class: "palette-hint",
      text: "Drag a control onto the player. Drag a placed control back here to remove it.",
    }),
  );

  // "+ Add custom control" — pick any Lucide icon + a name → a new draggable chip.
  const addBtn = el("button", { class: "btn add-control-btn", text: "+ Add custom control" });
  addBtn.addEventListener("click", async () => {
    const icon = await pickIcon({ title: "Pick an icon for your control" });
    if (!icon) return;
    const label = window.prompt("Name your control")?.trim();
    if (!label) return;
    registry.addCustom({ label, icon });
  });
  panel.append(addBtn);

  const list = el("div", { class: "chip-list" });
  const dragImages = el("div", { class: "drag-image-holder" });
  panel.append(list, dragImages);

  // Remove target + placed-state both proxy to the active editor.
  makeRemoveTarget(panel, {
    has: (id) => studio.active().has(id),
    remove: (id) => studio.active().remove(id),
  });

  // ---- Collapse-in-Setting bin (only for modes that expose the capability) ----
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

  // Rebuild every chip from the registry. Called on each change so custom controls
  // appear/disappear and icon swaps show live. Chips only mutate on commit (drop,
  // registry edit), never mid-drag, so rebuilding here is safe.
  const renderChips = () => {
    const active = studio.active();
    list.replaceChildren();
    dragImages.replaceChildren();

    for (const def of registry.list()) {
      const id: ControlId = def.id;
      const chip = el("div", { class: "chip", title: def.label }, [
        renderIcon(registry.iconOf(id), 18),
        el("span", { class: "chip-label", text: def.label }),
      ]);
      chip.dataset.id = id;

      const actions = el("div", { class: "chip-actions" });
      actions.append(
        actionBtn("chip-act--icon", "Change icon", "✎", async () => {
          const next = await pickIcon({ title: `Change icon — ${def.label}`, current: registry.iconOf(id) });
          if (next) registry.setIcon(id, next);
        }),
      );
      if (registry.isOverridden(id)) {
        actions.append(actionBtn("chip-act--reset", "Reset to default icon", "↺", () => registry.resetIcon(id)));
      }
      if (registry.isCustom(id)) {
        actions.append(
          actionBtn("chip-act--del", "Delete control", "×", () => {
            studio.active().purge?.(id); // strip from every viewport first
            registry.removeCustom(id);
          }),
        );
      }
      chip.append(actions);

      chip.classList.toggle("chip--placed", active.has(id));

      const dragImage = el("div", { class: "chip-drag-image" }, [renderIcon(registry.iconOf(id), 24)]);
      dragImages.append(dragImage);
      makeDraggable(chip, id, dragImage);

      // Setting is auto-managed (driven by the collapse list) → not draggable.
      if (id === "Setting" && active.managesSetting) {
        chip.classList.add("chip--managed");
        chip.setAttribute("draggable", "false");
        chip.title = "Setting — auto-shown when controls are collapsed";
      }

      list.append(chip);
    }
  };

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
      const def = registry.get(id);
      const chip = el("div", { class: `collapsed-chip ${id}`, title: def?.label ?? id });
      makeDraggable(chip, id); // drag back onto the bar to re-place it
      chip.append(renderIcon(registry.iconOf(id), 16));
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
    renderChips();
    renderCollapsed();
  };
  studio.onChange(sync);
  sync();

  return panel;
}
