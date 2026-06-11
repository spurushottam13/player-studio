// Studio controller: owns the three independent editors (grid / region / free),
// tracks the active mode, and fans out a single onChange signal that fires on
// either an active-state edit or a mode switch. Layouts are independent per mode.

import { createFreeEditor } from "./modes/free/editor";
import { createGridEditor } from "./modes/grid/editor";
import { createRegionEditor } from "./modes/region/editor";
import type { EditorInstance, ModeId } from "./modes/types";

const MODE_KEY = "player-studio:mode";
const MODE_DOC: Record<ModeId, string> = { grid: "old_spec.md", region: "spec.md", free: "free_spec.md" };

function loadMode(valid: ModeId[]): ModeId {
  try {
    const m = localStorage.getItem(MODE_KEY) as ModeId | null;
    if (m && valid.includes(m)) return m;
  } catch {
    /* ignore */
  }
  return "free";
}

export class Studio {
  readonly editors: EditorInstance[];
  private byId: Record<ModeId, EditorInstance>;
  private modeId: ModeId;
  private listeners = new Set<() => void>();
  private unsubActive: (() => void) | null = null;

  constructor() {
    // Order matches the spec progression: grid → region → free.
    const grid = createGridEditor();
    const region = createRegionEditor();
    const free = createFreeEditor();
    this.editors = [grid, region, free];
    this.byId = { grid, region, free };
    this.modeId = loadMode(this.editors.map((e) => e.id));
    this.wireActive();
  }

  get mode(): ModeId {
    return this.modeId;
  }
  active(): EditorInstance {
    return this.byId[this.modeId];
  }
  activeDoc(): string {
    return MODE_DOC[this.modeId];
  }

  setMode(id: ModeId): void {
    if (id === this.modeId) return;
    this.modeId = id;
    try {
      localStorage.setItem(MODE_KEY, id);
    } catch {
      /* ignore */
    }
    this.wireActive();
    this.emit();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private wireActive(): void {
    this.unsubActive?.();
    this.unsubActive = this.active().subscribe(() => this.emit());
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
