// Placement state: which controls are placed, where, and how wide.
// Simple pub/sub so palette, player and code panel can re-render on change.

import type { GridIdentifier } from "./controls";

export interface Placement {
  row: number;
  col: number;
  colSpan: number;
}

type Listener = () => void;

const STORAGE_KEY = "player-studio:placements";

// Default player layout, applied on first load (when nothing is saved yet).
export const DEFAULT_LAYOUT: Partial<Record<GridIdentifier, Placement>> = {
  Backward: { row: 4, col: 1, colSpan: 1 },
  PlayNPause: { row: 4, col: 2, colSpan: 1 },
  Forward: { row: 4, col: 3, colSpan: 1 },
  VideoProgress: { row: 4, col: 4, colSpan: 10 },
  PictureInPicture: { row: 1, col: 13, colSpan: 1 },
  TimeAll: { row: 5, col: 1, colSpan: 3 },
  Speed: { row: 5, col: 10, colSpan: 1 },
  Quality: { row: 5, col: 11, colSpan: 1 },
  Setting: { row: 5, col: 12, colSpan: 1 },
  FullScreen: { row: 5, col: 13, colSpan: 1 },
};

export class PlacementState {
  private map = new Map<GridIdentifier, Placement>();
  private listeners = new Set<Listener>();

  constructor(load = true) {
    if (load) this.load();
  }

  place(id: GridIdentifier, p: Placement): void {
    this.map.set(id, { ...p });
    this.changed();
  }

  resize(id: GridIdentifier, colSpan: number): void {
    const p = this.map.get(id);
    if (p && p.colSpan !== colSpan) {
      p.colSpan = colSpan;
      this.changed();
    }
  }

  remove(id: GridIdentifier): void {
    if (this.map.delete(id)) this.changed();
  }

  clear(): void {
    if (this.map.size > 0) {
      this.map.clear();
      this.changed();
    }
  }

  resetToDefault(): void {
    this.map.clear();
    this.applyDefault();
    this.changed();
  }

  private applyDefault(): void {
    for (const [id, p] of Object.entries(DEFAULT_LAYOUT)) {
      if (p) this.map.set(id as GridIdentifier, { ...p });
    }
  }

  get(id: GridIdentifier): Placement | undefined {
    return this.map.get(id);
  }

  has(id: GridIdentifier): boolean {
    return this.map.has(id);
  }

  entries(): [GridIdentifier, Placement][] {
    return [...this.map.entries()];
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
      const obj = Object.fromEntries(this.map);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.applyDefault();
        return;
      }
      const obj = JSON.parse(raw) as Record<string, Placement>;
      for (const [id, p] of Object.entries(obj)) {
        if (p && typeof p.row === "number" && typeof p.col === "number") {
          this.map.set(id as GridIdentifier, {
            row: p.row,
            col: p.col,
            colSpan: typeof p.colSpan === "number" ? p.colSpan : 1,
          });
        }
      }
    } catch {
      // ignore malformed storage
    }
  }
}
