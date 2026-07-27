// Icon resolution. An icon is just a Material Icons NAME (the ligature string,
// e.g. "play_arrow") — and that name IS the key: it keys the catalog here, it is
// what the palette and canvas render, and it is what player.json carries
// verbatim. No raw SVG anywhere; each platform resolves the same name in its own
// Material set (web: the ligature font; Android: the Material icon drawable;
// iOS: the mapped asset). `versions.json` ships with the `material-icons`
// package keyed by icon name (its value is the release the glyph landed in,
// which we don't need) — so its keys ARE the catalog.

import ICONS from "material-icons/_data/versions.json";

export type IconName = string;

const NAMES = Object.keys(ICONS).sort();

// How many glyphs this build ships (shown in the icon picker).
export const ICON_COUNT = NAMES.length;

const FALLBACK = "help_outline"; // drawn if a saved name isn't in this Material build

// Render a Material name to a live element for the studio UI. The font maps the
// name to its glyph as a ligature, so the element's text content IS the icon
// key. The box is pinned square at `size` so a per-icon background stays a clean
// circle.
export function renderIcon(name: IconName, size = 20): HTMLElement {
  const span = document.createElement("span");
  span.className = "mi material-icons";
  span.textContent = name in ICONS ? name : FALLBACK;
  span.style.fontSize = `${size}px`;
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.setAttribute("aria-hidden", "true");
  return span;
}

// Cheap guard used when sanitizing saved data / validating picker input.
export function isKnownIcon(name: string): boolean {
  return name in ICONS;
}

// The full Material catalog (sorted), for the icon picker. Never mutated.
export function iconNames(): string[] {
  return NAMES;
}
