// Shared rendering of a placed control's inner content (icon / text / slider) and
// its remove button. Used by all three mode canvases so a control looks identical
// regardless of how it is positioned. The icon branch resolves through the registry
// so custom controls and icon overrides render live.

import { DEFAULT_ICON_SIZE, DEFAULT_SPACER_WIDTH } from "../controls";
import type { ControlDef, ControlId } from "../controls";
import { renderIcon } from "../icons";
import { registry } from "../registry";
import { el, spacerWidthCss } from "./dom";

// `iconSize` is the per-viewport size for this placement (the caller resolves it
// from RegionState); defaults to the theme size when not given.
export function appendControlBody(ctrl: HTMLElement, def: ControlDef, iconSize: number = DEFAULT_ICON_SIZE): void {
  if (def.kind === "slider") {
    ctrl.classList.add("placed-control--range");
    const range = el("input", { type: "range" }) as HTMLInputElement;
    range.className = "control-range";
    range.min = "0";
    range.max = "100";
    range.value = "40";
    ctrl.append(range);
  } else if (def.kind === "text") {
    ctrl.classList.add("placed-control--text");
    ctrl.append(el("span", { class: "control-text", text: def.text ?? "00:00" }));
  } else if (def.kind === "spacer") {
    // Blank block: width is a % of the player container (resolved against
    // --player-w, published per render), full lane height via CSS align-self.
    ctrl.classList.add("placed-control--spacer");
    ctrl.style.width = spacerWidthCss(def.width ?? DEFAULT_SPACER_WIDTH);
  } else {
    // Backgrounds never reach here (the region editor renders them as row
    // layers), so the fallback stays the icon branch.
    ctrl.append(renderIcon(registry.iconOf(def.id), iconSize));
    if (def.id === "Volume") appendVolumeFlyout(ctrl);
  }
}

// Volume is an icon control, but previews its slider on hover: a 150px slider
// sliding out of the icon as an INLINE flex child — it takes real row space, so
// neighbors shift and a fill item (VideoProgress) shrinks instead of being
// overlapped. Both the side and the width are measured per hover — the layout
// around the icon changes as controls are added/moved.
const VOLUME_FLYOUT_WIDTH = 150;
const VOLUME_FLYOUT_MIN = 60;
const RANGE_MIN_WIDTH = 60; // keep in sync with .placed-control--range min-width
const GAP = 8; // keep in sync with --gap

// How wide the flyout can get without pushing the row past the player edge:
// the row's free space plus whatever a fill slider in it can give up.
function flyoutWidthFor(ctrl: HTMLElement): number {
  const rowEl = ctrl.closest<HTMLElement>(".player-row");
  if (!rowEl) return VOLUME_FLYOUT_WIDTH;
  let content = 2 * GAP; // inter-lane gaps
  for (const item of rowEl.querySelectorAll(".placed-control"))
    content += item.getBoundingClientRect().width + GAP;
  const slack = rowEl.getBoundingClientRect().width - content;
  const fill = rowEl.querySelector(".placed-control--range");
  const shrinkable = fill
    ? Math.max(0, fill.getBoundingClientRect().width - RANGE_MIN_WIDTH)
    : 0;
  return Math.round(
    Math.max(VOLUME_FLYOUT_MIN, Math.min(VOLUME_FLYOUT_WIDTH, slack + shrinkable)),
  );
}

function appendVolumeFlyout(ctrl: HTMLElement): void {
  ctrl.classList.add("placed-control--volume");
  const flyout = el("div", { class: "volume-flyout volume-flyout--right" });
  const range = el("input", { type: "range" }) as HTMLInputElement;
  range.className = "control-range volume-flyout-range";
  range.min = "0";
  range.max = "100";
  range.value = "70";
  flyout.append(range);
  // The flyout's range is the one interactive slider in the preview. While the
  // thumb is held: suspend the chip's HTML5 drag (a gesture on the range must
  // move the thumb, not the chip) and pin the flyout open via `is-sliding` (the
  // pointer may leave the chip mid-drag, which would otherwise collapse it).
  range.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    ctrl.setAttribute("draggable", "false");
    ctrl.classList.add("is-sliding");
    document.addEventListener(
      "pointerup",
      () => {
        ctrl.setAttribute("draggable", "true");
        ctrl.classList.remove("is-sliding");
      },
      { once: true },
    );
  });
  ctrl.addEventListener("pointerenter", () => {
    const host = ctrl.closest(".Player");
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const rect = ctrl.getBoundingClientRect();
    const spaceRight = hostRect.right - rect.right;
    const spaceLeft = rect.left - hostRect.left;
    const openRight =
      spaceRight >= VOLUME_FLYOUT_WIDTH ||
      (spaceLeft < VOLUME_FLYOUT_WIDTH && spaceRight >= spaceLeft);
    flyout.classList.toggle("volume-flyout--right", openRight);
    flyout.classList.toggle("volume-flyout--left", !openRight);
    ctrl.style.setProperty("--fly-w", `${flyoutWidthFor(ctrl)}px`);
  });
  ctrl.append(flyout);
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
