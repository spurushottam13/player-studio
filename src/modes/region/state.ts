// Region mode state: a layout per VIEWPORT (default | 490 | 300 | 200). Each
// viewport is regions (top | center | bottom) → rows (stacked) → lanes
// (start | center | end), each an ordered list of control ids, PLUS a
// `collapse` list of icon ids folded into the Setting menu. A control appears at
// most once across a viewport's regions AND its collapse list; empty rows are
// pruned. The Setting icon's presence in a viewport is fully derived from that
// viewport's collapse list (see reconcileSetting). See spec.md.

import type { ControlId } from "../../controls";
import { DEFAULT_TIME_CONTROL_ID, registry } from "../../registry";
import { DEFAULT_THEME } from "../types";
import type { Theme } from "../types";

export type Lane = "start" | "center" | "end";
export type RegionName = "top" | "center" | "bottom";
export type Viewport = "default" | "490" | "300" | "200";
export const REGION_NAMES: readonly RegionName[] = ["top", "center", "bottom"];
export const LANES: readonly Lane[] = ["start", "center", "end"];
export const VIEWPORTS: readonly Viewport[] = ["default", "490", "300", "200"];

export interface Row {
  start: ControlId[];
  center: ControlId[];
  end: ControlId[];
}
export type Regions = Record<RegionName, Row[]>;

// One viewport's design: the placed regions plus the icons collapsed into Setting.
export interface ViewportLayout {
  regions: Regions;
  collapse: ControlId[];
}
type Layouts = Record<Viewport, ViewportLayout>;

export interface ItemPath {
  region: RegionName;
  row: number;
  lane: Lane;
  index: number;
}

type Listener = () => void;
const STORAGE_KEY = "player-studio:region-layout";

// A control may be collapsed into Setting only if it is an icon and is not the
// Setting control itself (Setting is the collapse container, not collapsible).
// Resolves kind via the registry so custom icon controls qualify too.
export function isCollapsible(id: ControlId): boolean {
  return id !== "Setting" && registry.kindOf(id) === "icon";
}

function emptyRow(partial: Partial<Row> = {}): Row {
  return { start: [], center: [], end: [], ...partial };
}
function emptyRegions(): Regions {
  return { top: [], center: [], bottom: [] };
}
function emptyLayout(): ViewportLayout {
  return { regions: emptyRegions(), collapse: [] };
}
function emptyLayouts(): Layouts {
  return { default: emptyLayout(), "490": emptyLayout(), "300": emptyLayout(), "200": emptyLayout() };
}
function defaultRegions(): Regions {
  return {
    top: [emptyRow({ end: ["PictureInPicture"] })],
    center: [],
    bottom: [
      emptyRow({ start: ["VideoProgress"] }),
      emptyRow({ start: ["Backward", "PlayNPause", "Forward"] }),
      emptyRow({
        start: [DEFAULT_TIME_CONTROL_ID],
        end: ["Speed", "Quality", "Setting", "FullScreen"],
      }),
    ],
  };
}
// Reset seeds only the default viewport with the canonical layout; narrow
// viewports start blank (authored from scratch — see plan).
function defaultLayouts(): Layouts {
  const l = emptyLayouts();
  l.default = { regions: defaultRegions(), collapse: [] };
  return l;
}
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export class RegionState {
  private layouts: Layouts = emptyLayouts();
  private activeViewport: Viewport = "default";
  private theme: Theme = { ...DEFAULT_THEME };
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  // ---- active-viewport accessors -----------------------------------------
  private active(): ViewportLayout {
    return this.layouts[this.activeViewport];
  }
  private activeRegions(): Regions {
    return this.active().regions;
  }

  getViewports(): readonly Viewport[] {
    return VIEWPORTS;
  }
  getViewport(): Viewport {
    return this.activeViewport;
  }
  setViewport(v: Viewport): void {
    if (v === this.activeViewport || !VIEWPORTS.includes(v)) return;
    this.activeViewport = v;
    // No mutation to persist beyond the active pointer; reuse changed().
    this.changed();
  }

  rows(region: RegionName): Row[] {
    return this.activeRegions()[region];
  }
  // Non-mutating reads of any viewport, for serialization (don't switch active).
  rowsOf(vp: Viewport, region: RegionName): Row[] {
    return this.layouts[vp].regions[region];
  }
  collapsedOf(vp: Viewport): ControlId[] {
    return [...this.layouts[vp].collapse];
  }
  getTheme(): Theme {
    return { ...this.theme };
  }
  find(id: ControlId): ItemPath | null {
    const regions = this.activeRegions();
    for (const region of REGION_NAMES) {
      const rows = regions[region];
      for (let row = 0; row < rows.length; row++) {
        for (const lane of LANES) {
          const index = rows[row][lane].indexOf(id);
          if (index !== -1) return { region, row, lane, index };
        }
      }
    }
    return null;
  }
  // Placed anywhere in this viewport: on the bar OR collapsed into Setting.
  has(id: ControlId): boolean {
    return this.find(id) !== null || this.isCollapsed(id);
  }

  place(id: ControlId, target: ItemPath): void {
    this.dropFromCollapse(id);
    let insertIndex = target.index;
    const cur = this.find(id);
    if (cur) {
      this.activeRegions()[cur.region][cur.row][cur.lane].splice(cur.index, 1);
      if (
        cur.region === target.region &&
        cur.row === target.row &&
        cur.lane === target.lane &&
        cur.index < insertIndex
      ) {
        insertIndex--;
      }
    }
    const targetRow = this.activeRegions()[target.region][target.row];
    if (!targetRow) return;
    const arr = targetRow[target.lane];
    arr.splice(clamp(insertIndex, 0, arr.length), 0, id);
    this.pruneEmptyRows();
    this.changed();
  }

  placeInNewRow(
    id: ControlId,
    region: RegionName,
    atRow: number,
    lane: Lane = "start",
  ): void {
    this.dropFromCollapse(id);
    const cur = this.find(id);
    if (cur) this.activeRegions()[cur.region][cur.row][cur.lane].splice(cur.index, 1);
    const row = emptyRow();
    row[lane].push(id);
    const rows = this.activeRegions()[region];
    rows.splice(clamp(atRow, 0, rows.length), 0, row);
    this.pruneEmptyRows();
    this.changed();
  }

  remove(id: ControlId): void {
    const collapsed = this.dropFromCollapse(id);
    const cur = this.find(id);
    if (!cur && !collapsed) return;
    if (cur) this.activeRegions()[cur.region][cur.row][cur.lane].splice(cur.index, 1);
    this.pruneEmptyRows();
    this.changed();
  }

  // Strip a control from EVERY viewport (regions + collapse lists), not just the
  // active one. Used when a custom control's definition is deleted so no viewport
  // is left referencing a control that no longer exists.
  purge(id: ControlId): void {
    let touched = false;
    for (const vp of VIEWPORTS) {
      const layout = this.layouts[vp];
      for (const region of REGION_NAMES) {
        for (const row of layout.regions[region]) {
          for (const lane of LANES) {
            const i = row[lane].indexOf(id);
            if (i !== -1) {
              row[lane].splice(i, 1);
              touched = true;
            }
          }
        }
      }
      const ci = layout.collapse.indexOf(id);
      if (ci !== -1) {
        layout.collapse.splice(ci, 1);
        touched = true;
      }
      pruneRegions(layout.regions);
    }
    if (touched) this.changed();
  }

  // ---- collapse-in-Setting API -------------------------------------------
  getCollapsed(): ControlId[] {
    return [...this.active().collapse];
  }
  isCollapsed(id: ControlId): boolean {
    return this.active().collapse.includes(id);
  }
  // Move a control off the bar and into the Setting menu (active viewport).
  collapse(id: ControlId): void {
    if (!isCollapsible(id) || this.isCollapsed(id)) return;
    const cur = this.find(id);
    if (cur) this.activeRegions()[cur.region][cur.row][cur.lane].splice(cur.index, 1);
    this.active().collapse.push(id);
    this.pruneEmptyRows();
    this.changed();
  }
  // Take a control back out of the Setting menu (does not re-place it on the bar).
  uncollapse(id: ControlId): void {
    if (this.dropFromCollapse(id)) this.changed();
  }
  // Remove id from the active collapse list; returns whether it was there.
  private dropFromCollapse(id: ControlId): boolean {
    const list = this.active().collapse;
    const i = list.indexOf(id);
    if (i === -1) return false;
    list.splice(i, 1);
    return true;
  }

  setTheme(partial: Partial<Theme>): void {
    this.theme = { ...this.theme, ...partial };
    this.changed();
  }
  clear(): void {
    this.layouts[this.activeViewport] = emptyLayout();
    this.changed();
  }
  resetToDefault(): void {
    // Re-create the seeded default text control (the canonical bar references it),
    // in case it was deleted, so Reset always restores the full default bar.
    registry.seedDefaults();
    this.layouts = defaultLayouts();
    this.theme = { ...DEFAULT_THEME };
    this.changed();
  }

  private pruneEmptyRows(): void {
    pruneRegions(this.activeRegions());
  }

  // Setting is mandatory iff this viewport has collapsed icons. Auto-place it in
  // the last bottom row's end lane when needed; strip it when the list empties.
  private reconcileSetting(): void {
    const layout = this.active();
    const wantSetting = layout.collapse.length > 0;
    const cur = this.find("Setting");
    if (wantSetting && !cur) {
      const bottom = layout.regions.bottom;
      if (bottom.length === 0) bottom.push(emptyRow());
      bottom[bottom.length - 1].end.push("Setting");
    } else if (!wantSetting && cur) {
      layout.regions[cur.region][cur.row][cur.lane].splice(cur.index, 1);
      this.pruneEmptyRows();
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed(): void {
    this.reconcileSetting();
    this.save();
    for (const fn of this.listeners) fn();
  }
  private save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ layouts: this.layouts, theme: this.theme, active: this.activeViewport }),
      );
    } catch {
      /* ignore */
    }
  }
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.layouts = defaultLayouts();
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      this.layouts = sanitizeLayouts(parsed);
      const active = parsed.active as Viewport | undefined;
      if (active && VIEWPORTS.includes(active)) this.activeViewport = active;
      const theme = parsed.theme as Partial<Theme> | undefined;
      if (theme) {
        this.theme = {
          primary: theme.primary ?? DEFAULT_THEME.primary,
          secondary: theme.secondary ?? DEFAULT_THEME.secondary,
        };
      }
    } catch {
      this.layouts = defaultLayouts();
    }
  }
}

// Accept both the new `{ layouts }` shape and the legacy `{ regions }` shape
// (migrated into the default viewport, narrow viewports left blank).
function sanitizeLayouts(value: Record<string, unknown>): Layouts {
  const out = emptyLayouts();
  if (value && typeof value.layouts === "object" && value.layouts) {
    const src = value.layouts as Record<string, unknown>;
    for (const vp of VIEWPORTS) {
      const entry = (src[vp] ?? {}) as Record<string, unknown>;
      out[vp] = {
        regions: sanitizeRegions(entry.regions),
        collapse: collapseList(entry.collapse),
      };
    }
    return out;
  }
  // Legacy migration: top-level `regions` → default viewport.
  if (value && typeof value.regions === "object") {
    out.default = { regions: sanitizeRegions(value.regions), collapse: [] };
    return out;
  }
  return defaultLayouts();
}

function sanitizeRegions(value: unknown): Regions {
  const out = emptyRegions();
  if (!value || typeof value !== "object") return out;
  const v = value as Record<string, unknown>;
  for (const region of REGION_NAMES) {
    const rows = Array.isArray(v[region]) ? (v[region] as unknown[]) : [];
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const built = emptyRow({
        start: idList(row.start),
        center: idList(row.center),
        end: idList(row.end),
      });
      if (built.start.length || built.center.length || built.end.length)
        out[region].push(built);
    }
  }
  return out;
}
// Keep only strings that resolve to a known control (built-in or a still-existing
// custom). This drops "ghost" ids — e.g. a custom control deleted from the registry
// while its id lingered in saved layout JSON — so no unrenderable chip survives.
function idList(value: unknown): ControlId[] {
  return Array.isArray(value)
    ? (value.filter((x) => typeof x === "string" && registry.get(x) !== undefined) as ControlId[])
    : [];
}
function collapseList(value: unknown): ControlId[] {
  return idList(value).filter(isCollapsible);
}

// Drop rows whose three lanes are all empty (shared by prune + purge).
function pruneRegions(regions: Regions): void {
  for (const region of REGION_NAMES) {
    regions[region] = regions[region].filter(
      (r) => r.start.length || r.center.length || r.end.length,
    );
  }
}
