// Placement state: which controls are placed, where, and how wide.
// Simple pub/sub so palette, player and code panel can re-render on change.

import type { GridIdentifier } from "./controls";
import { COLS } from "./grid";

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

  // Pure: compute the full placement map that would result from inserting `id`
  // at `p`, reflowing same-row neighbors so nothing overlaps. Returns a fresh
  // map (cloned placements — safe to read without touching live state), or null
  // if the row genuinely can't fit the control. Used for both the live drag
  // preview and the committed drop.
  //
  // Strategy: push the controls at/after the drop point right (keeping gaps); if
  // that runs off the grid, tighten them; if it still overflows, slide the
  // inserted control and the left-side controls left to absorb the overflow.
  computeShift(id: GridIdentifier, p: Placement): Map<GridIdentifier, Placement> | null {
    const { row, col, colSpan } = p;
    const cols = COLS;

    const next = new Map<GridIdentifier, Placement>();
    for (const [k, v] of this.map) if (k !== id) next.set(k, { ...v });

    const others = [...next.entries()]
      .filter(([, q]) => q.row === row)
      .map(([oid, q]) => ({ id: oid, col: q.col, span: q.colSpan }))
      .sort((a, b) => a.col - b.col);

    const left = others.filter((o) => o.col < col); // stay left of the insert
    const right = others.filter((o) => o.col >= col); // pushed right of the insert

    // Lay out the right-side controls starting just after the inserted control.
    const packRight = (insertStart: number, preserveGaps: boolean): { starts: number[]; end: number } => {
      const starts: number[] = [];
      let cursor = insertStart + colSpan;
      for (const o of right) {
        const s = preserveGaps ? Math.max(o.col, cursor) : cursor;
        starts.push(s);
        cursor = s + o.span;
      }
      const end = right.length ? cursor - 1 : insertStart + colSpan - 1;
      return { starts, end };
    };

    let insertStart = col;
    let rightStarts: number[];
    let leftStarts: number[] | null = null;

    const gapped = packRight(col, true);
    if (gapped.end <= cols) {
      rightStarts = gapped.starts;
    } else {
      const tight = packRight(col, false);
      if (tight.end <= cols) {
        rightStarts = tight.starts;
      } else {
        // Slide the inserted control left by the overflow, then re-pack.
        const overflow = tight.end - cols;
        insertStart = col - overflow;
        if (insertStart < 1) return null;

        rightStarts = packRight(insertStart, false).starts;

        // Pack the left-side controls so each ends before the insert point.
        leftStarts = new Array(left.length);
        let limit = insertStart;
        for (let i = left.length - 1; i >= 0; i--) {
          const s = Math.min(left[i].col, limit - left[i].span);
          if (s < 1) return null; // no room on the left either
          leftStarts[i] = s;
          limit = s;
        }
      }
    }

    if (leftStarts) {
      left.forEach((o, i) => {
        next.get(o.id)!.col = leftStarts![i];
      });
    }
    right.forEach((o, i) => {
      next.get(o.id)!.col = rightStarts[i];
    });

    next.set(id, { ...p, col: insertStart });
    return next;
  }

  // Non-committing: the layout a drop at `p` would produce (or null if it can't
  // fit). Does not mutate state or notify listeners.
  previewShift(id: GridIdentifier, p: Placement): Map<GridIdentifier, Placement> | null {
    return this.computeShift(id, p);
  }

  // Commit an insert-with-reflow drop. No-op if the row can't fit the control.
  placeShifting(id: GridIdentifier, p: Placement): void {
    const next = this.computeShift(id, p);
    if (!next) return;
    this.map = next;
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
      const parsed = JSON.parse(raw) as
        | Record<string, Placement>
        | { placements: Record<string, Placement> };

      // Tolerate the older wrapped shape ({ placements, ... }) if present.
      const placements = (
        parsed && typeof parsed === "object" && "placements" in parsed
          ? parsed.placements
          : parsed
      ) as Record<string, Placement>;

      for (const [id, p] of Object.entries(placements)) {
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
