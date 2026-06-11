// Free mode state: each control placed anywhere, stored as a resolution-
// independent anchor (normalized point + which edge/center it pins to).
// See free_spec.md.

import { isFill } from "../../controls";
import type { GridIdentifier } from "../../controls";
import { DEFAULT_THEME } from "../types";
import type { Theme } from "../types";

export type AnchorX = "left" | "center" | "right";
export type AnchorY = "top" | "center" | "bottom";

export interface Placement {
  x: number; // 0..1 — horizontal position of the anchor point
  y: number; // 0..1 — vertical position of the anchor point
  anchorX: AnchorX;
  anchorY: AnchorY;
  width?: number; // sliders only: width as a fraction of the canvas
}

type Listener = () => void;
const STORAGE_KEY = "player-studio:free-layout";

export function defaultWidth(id: GridIdentifier): number {
  return id === "VideoProgress" ? 0.92 : 0.25;
}
export function deriveAnchorX(x: number): AnchorX {
  return x < 0.33 ? "left" : x > 0.67 ? "right" : "center";
}
export function deriveAnchorY(y: number): AnchorY {
  return y < 0.33 ? "top" : y > 0.67 ? "bottom" : "center";
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function defaultLayout(): Map<GridIdentifier, Placement> {
  const m = new Map<GridIdentifier, Placement>();
  m.set("PictureInPicture", { x: 1.0, y: 0.0, anchorX: "right", anchorY: "top" });
  m.set("VideoProgress", { x: 0.5, y: 0.78, anchorX: "center", anchorY: "center", width: 0.92 });
  m.set("Backward", { x: 0.43, y: 0.92, anchorX: "center", anchorY: "bottom" });
  m.set("PlayNPause", { x: 0.5, y: 0.92, anchorX: "center", anchorY: "bottom" });
  m.set("Forward", { x: 0.57, y: 0.92, anchorX: "center", anchorY: "bottom" });
  m.set("TimeAll", { x: 0.0, y: 0.92, anchorX: "left", anchorY: "bottom" });
  m.set("Speed", { x: 0.78, y: 0.92, anchorX: "right", anchorY: "bottom" });
  m.set("Quality", { x: 0.85, y: 0.92, anchorX: "right", anchorY: "bottom" });
  m.set("Setting", { x: 0.92, y: 0.92, anchorX: "right", anchorY: "bottom" });
  m.set("FullScreen", { x: 1.0, y: 0.92, anchorX: "right", anchorY: "bottom" });
  return m;
}

export class FreeState {
  private map = new Map<GridIdentifier, Placement>();
  private theme: Theme = { ...DEFAULT_THEME };
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
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
  getTheme(): Theme {
    return { ...this.theme };
  }

  place(id: GridIdentifier, p: Placement): void {
    const placement: Placement = { x: clamp01(p.x), y: clamp01(p.y), anchorX: p.anchorX, anchorY: p.anchorY };
    if (isFill(id)) placement.width = p.width ?? this.map.get(id)?.width ?? defaultWidth(id);
    this.map.set(id, placement);
    this.changed();
  }
  remove(id: GridIdentifier): void {
    if (this.map.delete(id)) this.changed();
  }
  setTheme(partial: Partial<Theme>): void {
    this.theme = { ...this.theme, ...partial };
    this.changed();
  }
  clear(): void {
    if (this.map.size) {
      this.map.clear();
      this.changed();
    }
  }
  resetToDefault(): void {
    this.map = defaultLayout();
    this.theme = { ...DEFAULT_THEME };
    this.changed();
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ controls: Object.fromEntries(this.map), theme: this.theme }));
    } catch {
      /* ignore */
    }
  }
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.map = defaultLayout();
        return;
      }
      const parsed = JSON.parse(raw) as { controls?: Record<string, unknown>; theme?: Partial<Theme> };
      this.map = sanitize(parsed.controls);
      if (parsed.theme) {
        this.theme = {
          primary: parsed.theme.primary ?? DEFAULT_THEME.primary,
          secondary: parsed.theme.secondary ?? DEFAULT_THEME.secondary,
        };
      }
    } catch {
      this.map = defaultLayout();
    }
  }
}

const AX: AnchorX[] = ["left", "center", "right"];
const AY: AnchorY[] = ["top", "center", "bottom"];

function sanitize(value: unknown): Map<GridIdentifier, Placement> {
  const out = new Map<GridIdentifier, Placement>();
  if (!value || typeof value !== "object") return defaultLayout();
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.x !== "number" || typeof r.y !== "number") continue;
    const p: Placement = {
      x: clamp01(r.x),
      y: clamp01(r.y),
      anchorX: AX.includes(r.anchorX as AnchorX) ? (r.anchorX as AnchorX) : deriveAnchorX(r.x),
      anchorY: AY.includes(r.anchorY as AnchorY) ? (r.anchorY as AnchorY) : deriveAnchorY(r.y),
    };
    if (typeof r.width === "number") p.width = r.width;
    out.set(id as GridIdentifier, p);
  }
  return out;
}
