// Runtime control registry: the mutable, persisted source of truth that replaces
// the static CONTROL_BY_ID map. It seeds itself from BUILTINS (controls.ts) and
// layers on the user's CUSTOM controls plus per-control icon OVERRIDES. Everything
// — palette, canvas, and the player.json generator — resolves controls through the
// single `registry` singleton so custom controls and icon swaps render live.

import {
  BUILTIN_BY_ID,
  BUILTINS,
  DEFAULT_SEPARATOR,
  DEFAULT_SPACER_WIDTH,
  isControlKind,
  isTextType,
  SPACER_WIDTH_MAX,
  SPACER_WIDTH_MIN,
  TEXT_TYPE_BY_TYPE,
  textOf,
} from "./controls";
import type { ControlDef, ControlId, ControlKind, TextType } from "./controls";
import { isKnownIcon } from "./icons";
import type { IconName } from "./icons";

// `:v2` — spacer widths turned from px into a PERCENTAGE of the player width, so
// a v1 save would read a 200px spacer as 200%. Bumping the key retires it.
const STORAGE_KEY = "player-studio:registry:v2";
const FALLBACK_ICON = "help_outline";
// Chip glyphs for the two blank/decorative elements. Cosmetic (dashboard-only):
// the player renders a spacer as a gap and a background as a layer, never as an icon.
const SPACER_ICON = "space_bar";
const BACKGROUND_ICON = "format_color_fill";

type Listener = () => void;

interface PersistShape {
  custom: ControlDef[];
  overrides: Array<[string, IconName]>;
}

export class ControlRegistry {
  private custom = new Map<ControlId, ControlDef>(); // user-added controls
  private overrides = new Map<ControlId, IconName>(); // built-in glyph swaps
  // NOTE: per-icon size + background are per-VIEWPORT and live in RegionState
  // (state.ts), not here — the registry stays viewport-agnostic (identity/glyph).
  private listeners = new Set<Listener>();

  constructor() {
    // Fresh install (no persisted registry) → seed the canonical default controls so
    // the default layout's time readout resolves. A returning user's saved registry
    // (incl. a deleted default) is respected — we don't re-seed on top of it.
    if (!this.load()) this.seedDefaults();
  }

  // ---- reads (everything resolves through here) --------------------------
  // Built-ins first (stable order), then custom controls in insertion order.
  list(): ControlDef[] {
    return [...BUILTINS, ...this.custom.values()];
  }
  get(id: ControlId): ControlDef | undefined {
    return this.custom.get(id) ?? BUILTIN_BY_ID.get(id);
  }
  // The effective icon: an override wins over the def's default.
  iconOf(id: ControlId): IconName {
    return this.overrides.get(id) ?? this.get(id)?.icon ?? FALLBACK_ICON;
  }
  kindOf(id: ControlId): ControlKind | undefined {
    return this.get(id)?.kind;
  }
  isCustom(id: ControlId): boolean {
    return this.custom.has(id);
  }
  isOverridden(id: ControlId): boolean {
    return this.overrides.has(id);
  }

  // ---- writes (each persists + notifies) ---------------------------------
  addCustom(input: { label: string; icon: IconName; kind?: ControlKind }): ControlId {
    const label = input.label.trim();
    const id = this.uniqueId(`CUSTOM_${slugify(label) || "control"}`);
    this.custom.set(id, {
      id,
      label: label || id,
      icon: input.icon,
      kind: input.kind ?? "icon",
      custom: true,
      defaultSpan: 1,
      maxSpan: 1,
    });
    this.changed();
    return id;
  }
  // Add a TEXT control (the "+ Add text" flow). Time readouts, chapter, title and
  // dynamic text all render as kind === "text"; the flavour and its extras live in
  // `textType` / `separator` / `variable`. Dynamic Text is keyed by its cdt_ variable
  // (also the SDK handle); the rest get a CUSTOM_ id like any other custom control.
  addText(input: { textType: TextType; separator?: string; variable?: string; showNumber?: boolean }): ControlId {
    const meta = TEXT_TYPE_BY_TYPE.get(input.textType);
    if (!meta) return "";
    const isDynamic = input.textType === "dynamicText";
    const isTimeAll = input.textType === "timeAll";
    const isChapter = input.textType === "currentChapter";
    const separator = isTimeAll ? input.separator ?? DEFAULT_SEPARATOR : undefined;
    const showNumber = isChapter ? input.showNumber ?? false : undefined;

    const id = this.uniqueId(
      isDynamic ? normalizeVariable(input.variable) : `CUSTOM_${slugify(meta.label)}`,
    );
    // Dynamic Text's variable IS its id (the SDK handle).
    this.custom.set(id, makeTextDef(id, input.textType, { separator, showNumber, variable: isDynamic ? id : undefined }));
    this.changed();
    return id;
  }
  // Add a SPACER control: a blank block that adds horizontal space between
  // controls. Width (a % of the player width) is edited in-canvas via its
  // resize handle.
  addSpacer(): ControlId {
    const id = this.uniqueId("CUSTOM_spacer");
    this.custom.set(id, {
      id,
      label: "Spacer",
      icon: SPACER_ICON,
      kind: "spacer",
      custom: true,
      width: DEFAULT_SPACER_WIDTH,
      defaultSpan: 1,
      maxSpan: 1,
    });
    this.changed();
    return id;
  }
  // Add a BACKGROUND control: a color layer rendered behind a row's controls.
  // Color/opacity are edited in-canvas (click → popover); width via resize handle.
  // Color/opacity are NOT stored per-background — they come from the shared
  // theme (one "Background" tool for all). Padding/radius fall back to defaults
  // until edited on the placed layer.
  addBackground(): ControlId {
    const id = this.uniqueId("CUSTOM_background");
    this.custom.set(id, {
      id,
      label: "Background",
      icon: BACKGROUND_ICON,
      kind: "background",
      custom: true,
      defaultSpan: 1,
      maxSpan: 1,
    });
    this.changed();
    return id;
  }
  // Seed the registry entries the canonical default layout references (see
  // state.defaultRegions): three background layers, two 31%-wide spacers, a Time
  // Left readout, and the transport-icon look (Backward/Forward 30px + Play 48px,
  // each with a circular background). Runs on a FRESH install and on every
  // resetToDefault — so it FORCES these entries (a reset restores the default
  // look). A returning user's saved registry is loaded instead of seeded, so
  // their edits are untouched.
  seedDefaults(): void {
    const D = DEFAULT_CONTROL_IDS;
    // `extra` carries the per-background padding/radius overrides (unique CUSTOM_*
    // ids, so per-instance) baked into the default look.
    const bg = (id: ControlId, extra: Partial<ControlDef> = {}): ControlDef => ({
      id, label: "Background", icon: BACKGROUND_ICON,
      kind: "background", custom: true, defaultSpan: 1, maxSpan: 1, ...extra,
    });
    const spacer = (id: ControlId): ControlDef => ({
      id, label: "Spacer", icon: SPACER_ICON,
      kind: "spacer", custom: true, width: DEFAULT_LAYOUT_SPACER_WIDTH, defaultSpan: 1, maxSpan: 1,
    });
    this.custom.set(D.bgBottom, bg(D.bgBottom, { paddingX: 4 }));
    this.custom.set(D.bgTopRight, bg(D.bgTopRight, { paddingX: 5, paddingY: 5, radius: 0 }));
    this.custom.set(D.bgTopLeft, bg(D.bgTopLeft, { paddingX: 4 }));
    this.custom.set(D.bg4, bg(D.bg4, { paddingX: 5, paddingY: 3, radius: 0 }));
    this.custom.set(D.bg5, bg(D.bg5, { paddingX: 5, paddingY: 5, radius: 0 }));
    this.custom.set(D.spacerLeft, spacer(D.spacerLeft));
    this.custom.set(D.spacerRight, spacer(D.spacerRight));
    this.custom.set(D.timeLeft, makeTextDef(D.timeLeft, "timeLeft", {}));
    // The transport icons' enlarged size + circular background are per-VIEWPORT
    // and seeded into the default viewport by state.defaultLayouts (state.ts).
    this.changed();
  }
  removeCustom(id: ControlId): void {
    if (this.custom.delete(id)) {
      this.overrides.delete(id);
      this.changed();
    }
  }
  // Set the glyph: edits a custom def in place, or records an override for a built-in.
  setIcon(id: ControlId, icon: IconName): void {
    const def = this.custom.get(id);
    if (def) def.icon = icon;
    else if (BUILTIN_BY_ID.has(id)) this.overrides.set(id, icon);
    else return;
    this.changed();
  }
  // Drop a built-in's override (back to its default glyph). No-op for customs.
  resetIcon(id: ControlId): void {
    if (this.overrides.delete(id)) this.changed();
  }
  // `width` (spacers) is a percentage of the player container width; the
  // background paddings/radius stay in px.
  updateCustom(
    id: ControlId,
    partial: Partial<Pick<ControlDef, "label" | "icon" | "width" | "paddingX" | "paddingY" | "radius">>,
  ): void {
    const def = this.custom.get(id);
    if (!def) return;
    if (partial.label !== undefined) def.label = partial.label;
    if (partial.icon !== undefined) def.icon = partial.icon;
    if (partial.width !== undefined) def.width = partial.width;
    if (partial.paddingX !== undefined) def.paddingX = partial.paddingX;
    if (partial.paddingY !== undefined) def.paddingY = partial.paddingY;
    if (partial.radius !== undefined) def.radius = partial.radius;
    this.changed();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Uniquify a base id against built-ins + customs (callers own the prefix/slug).
  private uniqueId(base: string): ControlId {
    let id = base;
    let n = 2;
    while (this.custom.has(id) || BUILTIN_BY_ID.has(id)) id = `${base}_${n++}`;
    return id;
  }

  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }
  private toPersist(): PersistShape {
    return {
      custom: [...this.custom.values()],
      overrides: [...this.overrides.entries()] as Array<[string, IconName]>,
    };
  }
  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toPersist()));
    } catch {
      /* ignore */
    }
  }
  // ---- Undo/redo snapshots (see history.ts) ------------------------------
  snapshot(): string {
    return JSON.stringify(this.toPersist());
  }
  restore(snapshot: string): void {
    this.custom.clear();
    this.overrides.clear();
    try {
      this.hydrate(JSON.parse(snapshot) as Partial<PersistShape>);
    } catch {
      /* ignore a corrupt snapshot */
    }
    this.changed();
  }

  // Returns whether persisted registry data was found (fresh installs seed defaults).
  private load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      this.hydrate(JSON.parse(raw) as Partial<PersistShape>);
      return true;
    } catch {
      return false;
    }
  }

  // Rehydrate the maps from a parsed persist shape — the shared whitelist for
  // both load() (localStorage) and restore() (an undo/redo snapshot). Any new
  // persisted field MUST be validated here or it silently drops.
  private hydrate(parsed: Partial<PersistShape>): void {
    for (const def of parsed.custom ?? []) {
        if (!def || typeof def.id !== "string" || typeof def.icon !== "string") continue;
        this.custom.set(def.id, {
          id: def.id,
          label: typeof def.label === "string" && def.label ? def.label : def.id,
          icon: def.icon,
          kind: isControlKind(def.kind) ? def.kind : "icon",
          custom: true,
          ...(typeof def.text === "string" ? { text: def.text } : {}),
          ...(isTextType(def.textType) ? { textType: def.textType } : {}),
          ...(typeof def.separator === "string" ? { separator: def.separator } : {}),
          ...(typeof def.variable === "string" ? { variable: def.variable } : {}),
          ...(typeof def.showNumber === "boolean" ? { showNumber: def.showNumber } : {}),
          // Width is a percentage of the player width — clamp it into range so a
          // hand-edited or stale value can't produce an off-canvas spacer.
          ...(typeof def.width === "number" && Number.isFinite(def.width) && def.width > 0
            ? { width: Math.min(Math.max(def.width, SPACER_WIDTH_MIN), SPACER_WIDTH_MAX) }
            : {}),
          ...(typeof def.color === "string" && /^#[0-9a-fA-F]{6}$/.test(def.color) ? { color: def.color } : {}),
          ...(typeof def.opacity === "number" && Number.isFinite(def.opacity)
            ? { opacity: Math.min(Math.max(def.opacity, 0), 1) }
            : {}),
          ...(typeof def.paddingX === "number" && Number.isFinite(def.paddingX) && def.paddingX >= 0
            ? { paddingX: def.paddingX }
            : {}),
          ...(typeof def.paddingY === "number" && Number.isFinite(def.paddingY) && def.paddingY >= 0
            ? { paddingY: def.paddingY }
            : {}),
          ...(typeof def.radius === "number" && Number.isFinite(def.radius) && def.radius >= 0
            ? { radius: def.radius }
            : {}),
          defaultSpan: typeof def.defaultSpan === "number" ? def.defaultSpan : 1,
          maxSpan: typeof def.maxSpan === "number" ? def.maxSpan : 1,
        });
      }
      for (const entry of parsed.overrides ?? []) {
        const [id, icon] = entry ?? [];
        // Drop overrides for ids that aren't built-ins, or names this Material build lacks.
        if (typeof id === "string" && typeof icon === "string" && BUILTIN_BY_ID.has(id) && isKnownIcon(icon)) {
          this.overrides.set(id, icon);
        }
      }
  }
}

// The transport spacers in the canonical default layout: 31% of the player width
// each (what the old fixed 200px came to on the 640px default preview).
const DEFAULT_LAYOUT_SPACER_WIDTH = 31; // %

// Deterministic ids for the custom controls the default layout references, so
// state.defaultRegions can name them and seedDefaults can create them. (The
// suffixes mirror a real authoring session; they just need to be stable.)
export const DEFAULT_CONTROL_IDS = {
  bgBottom: "CUSTOM_background",
  bgTopRight: "CUSTOM_background_2",
  bgTopLeft: "CUSTOM_background_3",
  bg4: "CUSTOM_background_4",
  bg5: "CUSTOM_background_5",
  spacerLeft: "CUSTOM_spacer_3",
  spacerRight: "CUSTOM_spacer_2",
  timeLeft: "CUSTOM_time_left",
} as const;

// Lowercase slug for CUSTOM_ ids: non-alphanumerics collapse to underscores.
function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Build a kind === "text" ControlDef. Shared by addText and seedDefaults so a seeded
// control is byte-identical to a user-added one. `extras.variable` (Dynamic Text)
// doubles as the SDK handle; separator/showNumber apply to TimeAll / Current Chapter.
function makeTextDef(
  id: ControlId,
  textType: TextType,
  extras: { separator?: string; variable?: string; showNumber?: boolean },
): ControlDef {
  const meta = TEXT_TYPE_BY_TYPE.get(textType);
  const isTimeAll = textType === "timeAll";
  return {
    id,
    label: textType === "dynamicText" ? id : meta?.label ?? id,
    icon: meta?.icon ?? FALLBACK_ICON,
    kind: "text",
    custom: true,
    textType,
    text: textOf(textType, extras),
    ...(extras.separator !== undefined ? { separator: extras.separator } : {}),
    ...(extras.variable !== undefined ? { variable: extras.variable } : {}),
    ...(extras.showNumber !== undefined ? { showNumber: extras.showNumber } : {}),
    defaultSpan: isTimeAll ? 3 : 2,
    maxSpan: isTimeAll ? 6 : 4,
  };
}

// The SDK handle for a Dynamic Text control: a cdt_-prefixed identifier. Keeps the
// user's casing (SDK var names are case-sensitive), strips non-identifier chars, and
// only prefixes cdt_ when it isn't already there. Exported so the picker can preview
// the exact string that will be stored (idempotent: addText normalizes again).
export function normalizeVariable(raw?: string): string {
  const cleaned = (raw ?? "").trim().replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const base = cleaned || "text";
  return /^cdt_/i.test(base) ? base : `cdt_${base}`;
}

// App-wide singleton. Constructed (and loaded from localStorage) at import time,
// before any RegionState — so layout sanitization can already resolve custom ids.
export const registry = new ControlRegistry();

// Registry-aware helpers (replace the old pure controls.ts versions).
export function isFill(id: ControlId): boolean {
  return registry.kindOf(id) === "slider";
}
