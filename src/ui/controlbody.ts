// Shared rendering of a placed control's inner content (icon / text / slider) and
// its remove button. Used by all three mode canvases so a control looks identical
// regardless of how it is positioned. The icon branch resolves through the registry
// so custom controls and icon overrides render live.

import type { ControlDef, ControlId } from "../controls";
import { renderIcon } from "../icons";
import { registry } from "../registry";
import { el } from "./dom";

export function appendControlBody(ctrl: HTMLElement, def: ControlDef): void {
  if (def.kind === "slider") {
    ctrl.classList.add("placed-control--range");
    const range = el("input", { type: "range" }) as HTMLInputElement;
    range.className = "control-range";
    range.min = "0";
    range.max = "100";
    range.value = def.id === "Volume" ? "70" : "40";
    ctrl.append(range);
  } else if (def.kind === "text") {
    ctrl.classList.add("placed-control--text");
    ctrl.append(el("span", { class: "control-text", text: def.text ?? "00:00" }));
  } else {
    ctrl.append(renderIcon(registry.iconOf(def.id), 20));
  }
}

export function appendRemoveButton(ctrl: HTMLElement, onRemove: (id: ControlId) => void, id: ControlId): void {
  const btn = el("button", { class: "control-remove", title: "Remove", text: "×" });
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRemove(id);
  });
  ctrl.append(btn);
}
