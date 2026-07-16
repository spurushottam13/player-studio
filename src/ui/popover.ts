// Small anchored popover for in-canvas property editing (icon size, background
// color/opacity). Appended to document.body — NOT inside the player canvas — so
// it survives the full re-renders that registry/state commits trigger while it
// is open. Singleton: opening a popover closes the previous one.

import { el } from "./dom";

const MARGIN = 8; // viewport clamp margin

let current: { root: HTMLElement; close: () => void } | null = null;

export function closePopover(): void {
  current?.close();
}

// Build the popover's content via `build(body, close)` and anchor it under
// `anchor` (flipped above when there's no room below), clamped to the viewport.
// Dismissed on outside pointerdown or Escape.
export function openPopover(
  anchor: HTMLElement,
  build: (body: HTMLElement, close: () => void) => void,
): void {
  closePopover();

  const root = el("div", { class: "popover" });

  const onPointerDown = (e: PointerEvent) => {
    if (!root.contains(e.target as Node)) close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const close = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    root.remove();
    if (current?.root === root) current = null;
  };

  build(root, close);
  document.body.append(root);

  // Position after building (size is known): centered under the anchor.
  const a = anchor.getBoundingClientRect();
  const p = root.getBoundingClientRect();
  let left = a.left + a.width / 2 - p.width / 2;
  left = Math.min(Math.max(left, MARGIN), window.innerWidth - p.width - MARGIN);
  let top = a.bottom + MARGIN;
  if (top + p.height > window.innerHeight - MARGIN) top = a.top - p.height - MARGIN;
  top = Math.max(top, MARGIN);
  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  current = { root, close };
}
