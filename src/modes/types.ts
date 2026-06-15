// Contract the authoring canvas implements so the Studio controller and shared
// UI (palette, code panel) can treat it uniformly. The Region canvas is the sole
// implementation — it owns its state, drag-drop, and native spec generator. The
// POC compared three models (grid / region / free); region was chosen.

import type { GridIdentifier } from "../controls";

export type ModeId = "region";

export interface EditorInstance {
  id: ModeId;
  label: string;
  element: HTMLElement; // the full stage-panel (toolbar + canvas)
  subscribe(fn: () => void): () => void; // fires on this mode's state changes
  generateSpec(): string; // native player.json for this mode
  has(id: GridIdentifier): boolean; // for palette "placed" state
  remove(id: GridIdentifier): void; // for palette remove-on-drag-back

  // ---- Collapse-in-Setting (region mode only; optional capabilities) -------
  // When set, the LEFT palette shows a "Collapse in Setting" bin and treats the
  // Setting chip as auto-managed. Modes without these leave them undefined.
  collapsible?: boolean; // show the collapse bin for this mode
  managesSetting?: boolean; // Setting is auto-driven (palette chip disabled)
  canCollapse?(id: GridIdentifier): boolean; // droppable into the bin right now
  getCollapsed?(): GridIdentifier[];
  collapse?(id: GridIdentifier): void;
  uncollapse?(id: GridIdentifier): void;
  isCollapsed?(id: GridIdentifier): boolean;
}

export interface Theme {
  primary: string;
  secondary: string;
}

export const DEFAULT_THEME: Theme = { primary: "#1e90ff", secondary: "#ffffff" };
