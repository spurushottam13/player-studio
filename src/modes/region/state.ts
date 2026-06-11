// Region mode state: regions (top | center | bottom) → rows (stacked) → lanes
// (start | center | end), each an ordered list of control ids. A control appears
// at most once; empty rows are pruned. See spec.md.

import type { GridIdentifier } from "../../controls";
import { DEFAULT_THEME } from "../types";
import type { Theme } from "../types";

export type Lane = "start" | "center" | "end";
export type RegionName = "top" | "center" | "bottom";
export const REGION_NAMES: readonly RegionName[] = ["top", "center", "bottom"];
export const LANES: readonly Lane[] = ["start", "center", "end"];

export interface Row {
  start: GridIdentifier[];
  center: GridIdentifier[];
  end: GridIdentifier[];
}
export type Regions = Record<RegionName, Row[]>;

export interface ItemPath {
  region: RegionName;
  row: number;
  lane: Lane;
  index: number;
}

type Listener = () => void;
const STORAGE_KEY = "player-studio:region-layout";

function emptyRow(partial: Partial<Row> = {}): Row {
  return { start: [], center: [], end: [], ...partial };
}
function emptyRegions(): Regions {
  return { top: [], center: [], bottom: [] };
}
function defaultRegions(): Regions {
  return {
    top: [emptyRow({ end: ["PictureInPicture", ""] })],
    center: [],
    bottom: [
      emptyRow({ start: ["VideoProgress"] }),
      emptyRow({ start: ["Backward", "PlayNPause", "Forward"] }),
      emptyRow({
        start: ["TimeAll"],
        end: ["Speed", "Quality", "Setting", "FullScreen"],
      }),
    ],
  };
}
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export class RegionState {
  private regions: Regions = emptyRegions();
  private theme: Theme = { ...DEFAULT_THEME };
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  rows(region: RegionName): Row[] {
    return this.regions[region];
  }
  getTheme(): Theme {
    return { ...this.theme };
  }
  find(id: GridIdentifier): ItemPath | null {
    for (const region of REGION_NAMES) {
      const rows = this.regions[region];
      for (let row = 0; row < rows.length; row++) {
        for (const lane of LANES) {
          const index = rows[row][lane].indexOf(id);
          if (index !== -1) return { region, row, lane, index };
        }
      }
    }
    return null;
  }
  has(id: GridIdentifier): boolean {
    return this.find(id) !== null;
  }

  place(id: GridIdentifier, target: ItemPath): void {
    let insertIndex = target.index;
    const cur = this.find(id);
    if (cur) {
      this.regions[cur.region][cur.row][cur.lane].splice(cur.index, 1);
      if (
        cur.region === target.region &&
        cur.row === target.row &&
        cur.lane === target.lane &&
        cur.index < insertIndex
      ) {
        insertIndex--;
      }
    }
    const targetRow = this.regions[target.region][target.row];
    if (!targetRow) return;
    const arr = targetRow[target.lane];
    arr.splice(clamp(insertIndex, 0, arr.length), 0, id);
    this.pruneEmptyRows();
    this.changed();
  }

  placeInNewRow(
    id: GridIdentifier,
    region: RegionName,
    atRow: number,
    lane: Lane = "start",
  ): void {
    const cur = this.find(id);
    if (cur) this.regions[cur.region][cur.row][cur.lane].splice(cur.index, 1);
    const row = emptyRow();
    row[lane].push(id);
    const rows = this.regions[region];
    rows.splice(clamp(atRow, 0, rows.length), 0, row);
    this.pruneEmptyRows();
    this.changed();
  }

  remove(id: GridIdentifier): void {
    const cur = this.find(id);
    if (!cur) return;
    this.regions[cur.region][cur.row][cur.lane].splice(cur.index, 1);
    this.pruneEmptyRows();
    this.changed();
  }
  setTheme(partial: Partial<Theme>): void {
    this.theme = { ...this.theme, ...partial };
    this.changed();
  }
  clear(): void {
    this.regions = emptyRegions();
    this.changed();
  }
  resetToDefault(): void {
    this.regions = defaultRegions();
    this.theme = { ...DEFAULT_THEME };
    this.changed();
  }

  private pruneEmptyRows(): void {
    for (const region of REGION_NAMES) {
      this.regions[region] = this.regions[region].filter(
        (r) => r.start.length || r.center.length || r.end.length,
      );
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }
  private save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ regions: this.regions, theme: this.theme }),
      );
    } catch {
      /* ignore */
    }
  }
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.regions = defaultRegions();
        return;
      }
      const parsed = JSON.parse(raw) as {
        regions?: unknown;
        theme?: Partial<Theme>;
      };
      this.regions = sanitizeRegions(parsed.regions);
      if (parsed.theme) {
        this.theme = {
          primary: parsed.theme.primary ?? DEFAULT_THEME.primary,
          secondary: parsed.theme.secondary ?? DEFAULT_THEME.secondary,
        };
      }
    } catch {
      this.regions = defaultRegions();
    }
  }
}

function sanitizeRegions(value: unknown): Regions {
  const out = emptyRegions();
  if (!value || typeof value !== "object") return defaultRegions();
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
function idList(value: unknown): GridIdentifier[] {
  return Array.isArray(value)
    ? (value.filter((x) => typeof x === "string") as GridIdentifier[])
    : [];
}
