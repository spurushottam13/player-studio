// Common contract every authoring mode (free / region / grid) implements, so the
// Studio controller can treat them uniformly. Each mode is fully self-contained:
// its own state, canvas, drag-drop, and native spec generator. Layouts are
// independent per mode (switching modes does not convert the design).

import type { GridIdentifier } from "../controls";

export type ModeId = "free" | "region" | "grid";

export interface EditorInstance {
  id: ModeId;
  label: string;
  element: HTMLElement; // the full stage-panel (toolbar + canvas)
  subscribe(fn: () => void): () => void; // fires on this mode's state changes
  generateSpec(): string; // native player.json for this mode
  has(id: GridIdentifier): boolean; // for palette "placed" state
  remove(id: GridIdentifier): void; // for palette remove-on-drag-back
}

export interface Theme {
  primary: string;
  secondary: string;
}

export const DEFAULT_THEME: Theme = { primary: "#1e90ff", secondary: "#ffffff" };
