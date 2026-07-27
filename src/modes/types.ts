// Contract the authoring canvas implements so the Studio controller and shared
// UI (palette, code panel) can treat it uniformly. The Region canvas is the sole
// implementation — it owns its state, drag-drop, and native spec generator. The
// POC compared three models (grid / region / free); region was chosen.

import { DEFAULT_PLAYER_PADDING_X, DEFAULT_PLAYER_PADDING_Y } from "../controls";
import type { ControlId } from "../controls";

export type ModeId = "region";

export interface EditorInstance {
  id: ModeId;
  label: string;
  element: HTMLElement; // the full stage-panel (toolbar + canvas)
  subscribe(fn: () => void): () => void; // fires on this mode's state changes
  generateSpec(): string; // native player.json for this mode
  has(id: ControlId): boolean; // for palette "placed" state
  remove(id: ControlId): void; // for palette remove-on-drag-back
  purge?(id: ControlId): void; // remove a control from EVERY viewport (custom delete)

  // ---- Collapse-in-Setting (region mode only; optional capabilities) -------
  // When set, the LEFT palette shows a "Collapse in Setting" bin and treats the
  // Setting chip as auto-managed. Modes without these leave them undefined.
  collapsible?: boolean; // show the collapse bin for this mode
  managesSetting?: boolean; // Setting is auto-driven (palette chip disabled)
  canCollapse?(id: ControlId): boolean; // droppable into the bin right now
  getCollapsed?(): ControlId[];
  collapse?(id: ControlId): void;
  uncollapse?(id: ControlId): void;
  isCollapsed?(id: ControlId): boolean;
}

export interface Theme {
  primary: string;
  secondary: string;
  // Shared across ALL background elements (there is no per-background color) —
  // edited via the one "Background" tool in the stage toolbar.
  bgColor: string;
  bgOpacity: number; // 0–1
  // Padding of the whole .Player container, edited via the toolbar's "Padding"
  // tool. Global across the layout, and a PERCENTAGE of the container so the
  // inset scales with the player: X of its width, Y of its height.
  playerPadX: number; // % of container width
  playerPadY: number; // % of container height
}

export const DEFAULT_THEME: Theme = {
  primary: "#1e90ff",
  secondary: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 0.5,
  playerPadX: DEFAULT_PLAYER_PADDING_X,
  playerPadY: DEFAULT_PLAYER_PADDING_Y,
};
