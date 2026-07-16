// Runtime control registry: the mutable, persisted source of truth that replaces
// the static CONTROL_BY_ID map. It seeds itself from BUILTINS (controls.ts) and
// layers on the user's CUSTOM controls plus per-control icon OVERRIDES. Everything
// — palette, canvas, and the player.json generator — resolves controls through the
// single `registry` singleton so custom controls and icon swaps render live.

import {
  BUILTIN_BY_ID,
  BUILTINS,
  DEFAULT_ICON_SIZE,
  DEFAULT_SEPARATOR,
  DEFAULT_SPACER_WIDTH,
  ICON_BG_PADDING_MAX,
  ICON_BG_RADIUS_MAX,
  ICON_SIZE_MAX,
  ICON_SIZE_MIN,
  isControlKind,
  isTextType,
  TEXT_TYPE_BY_TYPE,
  textOf,
} from "./controls";
import type { ControlDef, ControlId, ControlKind, IconBg, TextType } from "./controls";
import { isKnownIcon } from "./icons";
import type { IconName } from "./icons";

const STORAGE_KEY = "player-studio:registry";
const FALLBACK_ICON = "CircleHelp";

type Listener = () => void;

interface PersistShape {
  custom: ControlDef[];
  overrides: Array<[string, IconName]>;
  sizes: Array<[string, number]>;
  iconBgs: Array<[string, IconBg]>;
}

export class ControlRegistry {
  private custom = new Map<ControlId, ControlDef>(); // user-added controls
  private overrides = new Map<ControlId, IconName>(); // built-in glyph swaps
  private sizes = new Map<ControlId, number>(); // per-icon size overrides (px)
  private iconBgs = new Map<ControlId, IconBg>(); // per-icon background shape
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
  // The effective icon size: a per-control override or the shared default.
  sizeOf(id: ControlId): number {
    return this.sizes.get(id) ?? DEFAULT_ICON_SIZE;
  }
  hasSize(id: ControlId): boolean {
    return this.sizes.has(id);
  }
  // The per-icon background shape (a circle/badge behind the glyph), if set.
  iconBgOf(id: ControlId): IconBg | undefined {
    return this.iconBgs.get(id);
  }
  hasIconBg(id: ControlId): boolean {
    return this.iconBgs.has(id);
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
  // controls. Width is edited in-canvas via its resize handle.
  addSpacer(): ControlId {
    const id = this.uniqueId("CUSTOM_spacer");
    this.custom.set(id, {
      id,
      label: "Spacer",
      icon: isKnownIcon("RectangleHorizontal") ? "RectangleHorizontal" : "Square",
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
      icon: isKnownIcon("PaintBucket") ? "PaintBucket" : "Square",
      kind: "background",
      custom: true,
      defaultSpan: 1,
      maxSpan: 1,
    });
    this.changed();
    return id;
  }
  // Set a per-control icon size; the default size clears the override.
  setSize(id: ControlId, px: number): void {
    const clamped = Math.round(Math.min(Math.max(px, ICON_SIZE_MIN), ICON_SIZE_MAX));
    if (clamped === DEFAULT_ICON_SIZE) this.sizes.delete(id);
    else this.sizes.set(id, clamped);
    this.changed();
  }
  // Enable/patch the per-icon background shape (clamped). Merges over any current.
  setIconBg(id: ControlId, partial: Partial<IconBg>): void {
    const cur = this.iconBgs.get(id) ?? { padding: 0, radius: 0 };
    this.iconBgs.set(id, {
      padding: clampInt(partial.padding ?? cur.padding, 0, ICON_BG_PADDING_MAX),
      radius: clampInt(partial.radius ?? cur.radius, 0, ICON_BG_RADIUS_MAX),
    });
    this.changed();
  }
  // Remove the per-icon background.
  clearIconBg(id: ControlId): void {
    if (this.iconBgs.delete(id)) this.changed();
  }
  // Seed the registry entries the canonical default layout references (see
  // state.defaultRegions): three background layers, two 200px spacers, a Time
  // Left readout, and the transport-icon look (Backward/Forward 30px + Play 48px,
  // each with a circular background). Runs on a FRESH install and on every
  // resetToDefault — so it FORCES these entries (a reset restores the default
  // look). A returning user's saved registry is loaded instead of seeded, so
  // their edits are untouched.
  seedDefaults(): void {
    const D = DEFAULT_CONTROL_IDS;
    const bg = (id: ControlId): ControlDef => ({
      id, label: "Background", icon: isKnownIcon("PaintBucket") ? "PaintBucket" : "Square",
      kind: "background", custom: true, defaultSpan: 1, maxSpan: 1,
    });
    const spacer = (id: ControlId): ControlDef => ({
      id, label: "Spacer", icon: isKnownIcon("RectangleHorizontal") ? "RectangleHorizontal" : "Square",
      kind: "spacer", custom: true, width: 200, defaultSpan: 1, maxSpan: 1,
    });
    this.custom.set(D.bgBottom, bg(D.bgBottom));
    this.custom.set(D.bgTopRight, bg(D.bgTopRight));
    this.custom.set(D.bgTopLeft, bg(D.bgTopLeft));
    this.custom.set(D.spacerLeft, spacer(D.spacerLeft));
    this.custom.set(D.spacerRight, spacer(D.spacerRight));
    this.custom.set(D.timeLeft, makeTextDef(D.timeLeft, "timeLeft", {}));
    // Transport icons: enlarged, each with a circular background.
    this.sizes.set("Backward", 30);
    this.sizes.set("PlayNPause", 48);
    this.sizes.set("Forward", 30);
    this.iconBgs.set("Backward", { padding: 10, radius: 24 });
    this.iconBgs.set("PlayNPause", { padding: 10, radius: 40 });
    this.iconBgs.set("Forward", { padding: 10, radius: 24 });
    this.changed();
  }
  removeCustom(id: ControlId): void {
    if (this.custom.delete(id)) {
      this.overrides.delete(id);
      this.sizes.delete(id);
      this.iconBgs.delete(id);
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
      sizes: [...this.sizes.entries()] as Array<[string, number]>,
      iconBgs: [...this.iconBgs.entries()],
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
    this.sizes.clear();
    this.iconBgs.clear();
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
          ...(typeof def.width === "number" && Number.isFinite(def.width) && def.width > 0 ? { width: def.width } : {}),
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
        // Drop overrides for ids that aren't built-ins or names Lucide no longer has.
        if (typeof id === "string" && typeof icon === "string" && BUILTIN_BY_ID.has(id) && isKnownIcon(icon)) {
          this.overrides.set(id, icon);
        }
      }
      for (const entry of parsed.sizes ?? []) {
        const [id, px] = entry ?? [];
        // Sizes apply to built-ins AND custom icon controls (unlike icon overrides).
        if (typeof id === "string" && typeof px === "number" && Number.isFinite(px)) {
          this.sizes.set(id, Math.round(Math.min(Math.max(px, ICON_SIZE_MIN), ICON_SIZE_MAX)));
        }
      }
      for (const entry of parsed.iconBgs ?? []) {
        const [id, bg] = entry ?? [];
        if (typeof id === "string" && bg && typeof bg === "object") {
          const padding = (bg as IconBg).padding;
          const radius = (bg as IconBg).radius;
          if (typeof padding === "number" && Number.isFinite(padding) && typeof radius === "number" && Number.isFinite(radius)) {
            this.iconBgs.set(id, {
              padding: clampInt(padding, 0, ICON_BG_PADDING_MAX),
              radius: clampInt(radius, 0, ICON_BG_RADIUS_MAX),
            });
          }
        }
      }
  }
}

// Round + clamp a number into [min, max].
function clampInt(v: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(v, min), max));
}

// Deterministic ids for the custom controls the default layout references, so
// state.defaultRegions can name them and seedDefaults can create them. (The
// suffixes mirror a real authoring session; they just need to be stable.)
export const DEFAULT_CONTROL_IDS = {
  bgBottom: "CUSTOM_background",
  bgTopRight: "CUSTOM_background_2",
  bgTopLeft: "CUSTOM_background_3",
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
