// Icon resolution. An icon is just a Lucide export NAME (a string, e.g. "Heart").
// The same value is what the palette renders, what the canvas renders, and what
// player.json carries verbatim — no raw SVG anywhere. Each platform maps the name
// to its own glyph set. `icons[name]` is the same IconNode that
// `import { Heart } from "lucide"` yields; we just resolve it lazily by name.

import { createElement, icons as lucideIcons } from "lucide";
import type { IconNode } from "lucide";

// `icons` is typed as a concrete object literal (no string index); widen it so we
// can resolve glyphs by an arbitrary saved/searched name.
const icons = lucideIcons as Record<string, IconNode>;

export type IconName = string;

const FALLBACK = "CircleHelp"; // drawn if a saved name no longer exists in Lucide

// Render a Lucide name to a live <svg> for the studio UI.
export function renderIcon(name: IconName, size = 20): SVGElement {
  const node = icons[name] ?? icons[FALLBACK];
  return createElement(node, { width: String(size), height: String(size) });
}

// Cheap guard used when sanitizing saved data / validating picker input.
export function isKnownIcon(name: string): boolean {
  return name in icons;
}

// The full Lucide catalog (sorted), for the icon picker.
export function iconNames(): string[] {
  return Object.keys(icons).sort();
}
