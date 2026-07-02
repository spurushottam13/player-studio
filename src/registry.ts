// Runtime control registry: the mutable, persisted source of truth that replaces
// the static CONTROL_BY_ID map. It seeds itself from BUILTINS (controls.ts) and
// layers on the user's CUSTOM controls plus per-control icon OVERRIDES. Everything
// — palette, canvas, and the player.json generator — resolves controls through the
// single `registry` singleton so custom controls and icon swaps render live.

import { BUILTIN_BY_ID, BUILTINS, DEFAULT_SEPARATOR, isTextType, TEXT_TYPE_BY_TYPE, textOf } from "./controls";
import type { ControlDef, ControlId, ControlKind, TextType } from "./controls";
import { isKnownIcon } from "./icons";
import type { IconName } from "./icons";

const STORAGE_KEY = "player-studio:registry";
const FALLBACK_ICON = "CircleHelp";

type Listener = () => void;

interface PersistShape {
  custom: ControlDef[];
  overrides: Array<[string, IconName]>;
}

export class ControlRegistry {
  private custom = new Map<ControlId, ControlDef>(); // user-added controls
  private overrides = new Map<ControlId, IconName>(); // built-in glyph swaps
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
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
    const variable = isDynamic ? id : undefined;
    this.custom.set(id, {
      id,
      label: isDynamic ? id : meta.label,
      icon: meta.icon,
      kind: "text",
      custom: true,
      textType: input.textType,
      text: textOf(input.textType, { separator, variable, showNumber }),
      ...(separator !== undefined ? { separator } : {}),
      ...(variable !== undefined ? { variable } : {}),
      ...(showNumber !== undefined ? { showNumber } : {}),
      defaultSpan: isTimeAll ? 3 : 2,
      maxSpan: isTimeAll ? 6 : 4,
    });
    this.changed();
    return id;
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
  updateCustom(id: ControlId, partial: Partial<Pick<ControlDef, "label" | "icon">>): void {
    const def = this.custom.get(id);
    if (!def) return;
    if (partial.label !== undefined) def.label = partial.label;
    if (partial.icon !== undefined) def.icon = partial.icon;
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
  private save(): void {
    try {
      const data: PersistShape = {
        custom: [...this.custom.values()],
        overrides: [...this.overrides.entries()] as Array<[string, IconName]>,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistShape>;
      for (const def of parsed.custom ?? []) {
        if (!def || typeof def.id !== "string" || typeof def.icon !== "string") continue;
        this.custom.set(def.id, {
          id: def.id,
          label: typeof def.label === "string" && def.label ? def.label : def.id,
          icon: def.icon,
          kind: def.kind === "text" || def.kind === "slider" ? def.kind : "icon",
          custom: true,
          ...(typeof def.text === "string" ? { text: def.text } : {}),
          ...(isTextType(def.textType) ? { textType: def.textType } : {}),
          ...(typeof def.separator === "string" ? { separator: def.separator } : {}),
          ...(typeof def.variable === "string" ? { variable: def.variable } : {}),
          ...(typeof def.showNumber === "boolean" ? { showNumber: def.showNumber } : {}),
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
    } catch {
      /* ignore */
    }
  }
}

// Lowercase slug for CUSTOM_ ids: non-alphanumerics collapse to underscores.
function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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
