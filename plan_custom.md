# Player Studio — Custom Controls & Icon Overrides Plan

Extends the Regional Layout studio with three capabilities:

1. **Custom controls** — the user adds their own control (a brand‑new chip) whose
   glyph is **any of Lucide's ~1958 icons**, picked from a searchable grid.
2. **Custom controls in the schema** — `player.json` carries each custom control's
   *declaration* (id, label, kind, icon) so a renderer that has never heard of it
   can still draw it. Built‑in controls stay id‑only.
3. **Override an existing icon** — the user can swap the glyph of any of the 21
   built‑ins (e.g. give `FullScreen` a different Lucide icon). The override travels
   in the schema next to the custom declarations.

All three collapse onto **one abstraction**: an icon is always **a Lucide icon
name** (a string), plus a *runtime control registry* that replaces today's static
`CONTROLS` const. The schema never carries raw SVG — only the Lucide name, which
each platform maps to its own glyph set.

---

## 0. What today's design assumes (and why these features break it)

- [`src/controls.ts`](src/controls.ts) is the **single source of truth**: a frozen
  `CONTROLS` array of exactly 21 entries, a closed `GridIdentifier` string union,
  and a `CONTROL_BY_ID` map. Nothing is added at runtime.
- The icon is a compile‑time Lucide `IconNode` import; [`ui/controlbody.ts`](src/ui/controlbody.ts)
  and [`ui/palette.ts`](src/ui/palette.ts) call `createElement(def.icon)` directly.
- The schema ([`modes/region/spec.ts`](src/modes/region/spec.ts), `spec.md §6/§8`)
  is **layout + style only** — it emits control **ids**, and every platform binds
  the glyph + behavior natively. There is *no place* to carry a glyph.

Custom controls violate all three: their ids are not in the union, they are not in
`CONTROLS`, and a native renderer has no glyph for them. Icon overrides violate the
last: a built‑in id now needs to carry a *different* glyph than the native default.

So the plan does three structural things: (a) make an icon a Lucide **name** that
both the studio and the schema share, (b) turn the static registry into a mutable,
persisted `ControlRegistry`, and (c) add a `controls` declaration block to the
schema for custom + overridden controls.

---

## 1. Constraints (unchanged from the repo)

- **Vite 8 + TS 6**, vanilla DOM, no framework (`src/main.ts` style). Strict‑ish TS:
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals` — keep `import type`,
  no enums (use `as const` unions).
- **Lucide v1.17** is already a dependency. Two facts the plan relies on, both
  verified against the installed package:
  - `import { icons } from "lucide"` → object of **1958** `name → IconNode` entries.
    This is the icon‑picker catalog (no extra dependency).
  - `IconNode = [tag: string, attrs][][]`‑style data (`type IconNode = [tag, attrs][]`)
    — fully JSON‑serializable, which is what lets an icon ride inside `player.json`.
  - `createElement(iconNode, attrs)` → `SVGElement`.

---

## 2. Core data model — icon name + the registry

### 2a. `IconName` + `renderIcon` (new, in `src/icons.ts`)

An icon is just **the Lucide export name** (a string, e.g. `"Heart"`). The same
value is what the palette renders, what the canvas renders, and what `player.json`
carries verbatim — no raw SVG anywhere.

```ts
// The Lucide export name of a glyph, e.g. "Heart" / "Fullscreen".
export type IconName = string;

import { icons, createElement } from "lucide";

const FALLBACK = "CircleHelp"; // drawn if a saved name no longer exists in Lucide

// Render a Lucide name to a live <svg> for the studio UI.
export function renderIcon(name: IconName, size = 20): SVGElement {
  const node = icons[name] ?? icons[FALLBACK];
  return createElement(node, { width: String(size), height: String(size) });
}

// Cheap guard used when sanitizing saved data / picker input.
export function isKnownIcon(name: string): boolean {
  return name in icons;
}
```

`icons[name]` is the same `IconNode` that `import { Fullscreen } from "lucide"`
yields today — we just resolve it lazily by name instead of importing each one.

### 2b. `ControlDef` holds an `IconName`, not an `IconNode`

[`controls.ts`](src/controls.ts) `ControlDef.icon` changes type from `IconNode` to
`IconName`. The 21 built‑ins become declarative (no glyph imports needed):

```ts
export interface ControlDef {
  id: ControlId;            // was GridIdentifier (now widened — see §3)
  label: string;
  icon: IconName;           // was IconNode — now a Lucide name string
  kind: ControlKind;        // "icon" | "text" | "slider"
  custom?: boolean;         // true for user‑added controls
  text?: string;
  defaultSpan: number;
  maxSpan: number;
}

// e.g. { id: "FullScreen", label: "FullScreen", icon: "Fullscreen", kind: "icon", ... }
```

The big `import { Airplay, Rewind, … } from "lucide"` block in `controls.ts` is
**deleted** — built‑ins reference Lucide by name string, resolved lazily through
`renderIcon`. (`icons["Fullscreen"]` is the same node `Fullscreen` imported today.)

### 2c. `ControlRegistry` (new, in `src/registry.ts`)

Replaces the static `CONTROL_BY_ID` with a mutable, observable, persisted store.
Owns: the frozen built‑in seeds, the user's custom controls, and the per‑id icon
overrides. Single module‑level singleton (mirrors how `CONTROLS` is imported today).

```ts
const STORAGE_KEY = "player-studio:registry";

export class ControlRegistry {
  private custom = new Map<ControlId, ControlDef>();        // user‑added
  private overrides = new Map<ControlId, IconName>();       // built‑in glyph swaps
  private listeners = new Set<() => void>();

  // ---- reads (everything resolves through here) ----
  list(): ControlDef[] { … }                 // BUILTINS ++ custom, in display order
  get(id: ControlId): ControlDef | undefined // built‑in or custom def
  iconOf(id: ControlId): IconName            // overrides.get(id) ?? get(id).icon
  kindOf(id: ControlId): ControlKind | undefined
  isCustom(id: ControlId): boolean
  isOverridden(id: ControlId): boolean

  // ---- writes (each calls changed()) ----
  addCustom(input: { label: string; icon: IconName; kind?: ControlKind }): ControlId
  removeCustom(id: ControlId): void          // also asks layout to evict it (§6)
  setIcon(id: ControlId, icon: IconName): void
  resetIcon(id: ControlId): void             // drop an override
  updateCustom(id, partial): void

  subscribe(fn): () => void
  private changed(): void { this.save(); this.listeners.forEach(f => f()); }
  private save()/load()  // JSON of { custom: [...], overrides: [...] }
}

export const registry = new ControlRegistry();  // app‑wide singleton
```

`isFill` / `isCollapsible` stop reading `CONTROL_BY_ID` and read `registry.kindOf(id)`.

---

## 3. Widening the id type (`GridIdentifier` → `ControlId`)

Custom ids are user‑generated, so they cannot be members of the closed union.

- Keep `GridIdentifier` but rename its role to **`BuiltinId`** (the 21 reserved
  contract ids). Add:
  ```ts
  export type ControlId = BuiltinId | (string & {});   // any string, built‑in or custom
  ```
- **Custom id scheme:** `CUSTOM_<slug>` where `<slug>` is a sanitized, uniquified
  version of the label (e.g. `CUSTOM_like`, `CUSTOM_like_2`). The `CUSTOM_` prefix
  guarantees no collision with the 21 reserved ids and makes the schema
  self‑describing (a parser can tell built‑in from custom by prefix *or* by
  presence in the `controls` block — see §5).
- Loosen the signatures in [`modes/region/state.ts`](src/modes/region/state.ts)
  (`find`, `place`, `placeInNewRow`, `remove`, collapse API), [`dnd.ts`](src/dnd.ts),
  and [`modes/types.ts`](src/modes/types.ts) `EditorInstance` from `GridIdentifier`
  to `ControlId`. These are mechanical — the functions already treat the id as an
  opaque string key.

---

## 4. UI work

### 4a. Icon picker modal (new, `src/ui/iconpicker.ts`)

A reusable modal used by **both** "add custom control" and "override icon".

- **Catalog:** `Object.entries(icons)` (1958). Render lazily — a search box filters
  by name substring (case‑insensitive, split camelCase so "full screen" matches
  `Fullscreen`), and only the first ~200 matches are drawn into a CSS‑grid of
  swatches (each `renderIcon(name, 22)` in a button). Picking one resolves the
  promise with the Lucide **name** string.
- API: `pickIcon(opts?): Promise<IconName | null>` (null = cancelled). Mounts a
  backdrop + dialog, traps focus, closes on Esc/backdrop click. No raw‑SVG entry —
  every icon is a Lucide name.

### 4b. Palette changes ([`src/ui/palette.ts`](src/ui/palette.ts))

- Iterate **`registry.list()`** instead of importing `CONTROLS`; render chip glyphs
  with `renderIcon(registry.iconOf(def.id), 18)` instead of `createElement(def.icon)`.
- **"+ Add control" button** at the top of the chip list → `pickIcon()` → prompt for
  a label → `registry.addCustom({ label, icon })` (`icon` is a Lucide name). The new chip appears immediately
  (registry change re‑renders the palette) and is draggable like any built‑in.
- **Per‑chip "change icon" affordance:** a small pencil button on each chip (built‑in
  *and* custom) → `pickIcon()` → `registry.setIcon(id, ref)`. For built‑ins this
  creates an override; a built‑in with an override shows a "reset" dot →
  `registry.resetIcon(id)`. Custom chips also get a "×" → `registry.removeCustom(id)`.
- Subscribe to `registry` (via `studio.onChange`, see §6) so chips, placed‑state,
  and the collapse bin all re‑render on registry edits.

### 4c. Canvas body ([`src/ui/controlbody.ts`](src/ui/controlbody.ts))

`appendControlBody` currently does `createElement(def.icon, …)`. Change the `icon`
branch to `ctrl.append(renderIcon(registry.iconOf(def.id), 20))` so placed controls
reflect overrides and custom glyphs live. `text`/`slider` branches are unchanged;
custom controls default to `kind: "icon"` (see open questions for text/slider).

[`modes/region/editor.ts`](src/modes/region/editor.ts) `renderControl` already
funnels through `appendControlBody`, so no change there beyond the loosened id type.

---

## 5. Schema changes — carrying icons in `player.json`

### 5a. New top‑level `controls` declaration block

`spec.md` today emits only ids. Add a **`controls`** object keyed by id, containing a
declaration **only** for ids that a stock renderer can't resolve on its own — i.e.
**custom controls** and **overridden built‑ins**. Untouched built‑ins stay id‑only.

```jsonc
{
  "schemaVersion": "2.1",          // minor bump: additive, back‑compatible
  "layoutModel": "region",
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8 },

  "controls": {
    // custom control: full declaration (id ∉ the 21 built‑ins)
    "CUSTOM_like": {
      "custom": true,
      "kind": "icon",
      "label": "Like",
      "icon": "Heart"          // Lucide icon name
    },
    // overridden built‑in: just the new glyph (id IS a built‑in, behavior unchanged)
    "FullScreen": { "icon": "Maximize2" }
  },

  "viewports": {
    "default": { "regions": { "bottom": [ … "items": ["CUSTOM_like", "FullScreen"] … ] }, "collapseInSetting": [] }
    // …490 / 300 / 200
  }
}
```

`icon` is always a **Lucide icon name** — never raw SVG. Each platform maps that
name to its own glyph (Lucide on web; the agreed Lucide‑equivalent SF Symbol /
Material asset on native). The `regions → rows → groups → items` arrays are
**unchanged** — custom ids sit in `items` exactly like built‑in ids. A renderer's
lookup becomes:

> For an item id: if it appears in `controls` with an `icon`, draw that Lucide
> glyph by name. Otherwise it's a stock built‑in → native glyph + native behavior,
> as today. Items in `controls` with `"custom":true` have **no** native behavior —
> see §5c.

### 5b. Generator ([`modes/region/spec.ts`](src/modes/region/spec.ts))

`buildRegionSpec(state)` gains a `controls` builder. It walks every id actually used
across all viewports (each region's rows + each viewport's `collapseInSetting`),
dedupes, and for each id that `registry.isCustom(id) || registry.isOverridden(id)`
emits a declaration:

```ts
function buildControlDecls(usedIds: Set<ControlId>) {
  const out: Record<string, unknown> = {};
  for (const id of usedIds) {
    const custom = registry.isCustom(id);
    if (!custom && !registry.isOverridden(id)) continue;     // stock → id‑only
    const def = registry.get(id);
    out[id] = custom
      ? { custom: true, kind: def?.kind ?? "icon", label: def?.label ?? id, icon: registry.iconOf(id) }
      : { icon: registry.iconOf(id) };                       // override: glyph only
  }
  return out;
}
// return { schemaVersion: "2.1", layoutModel: "region", theme, controls, viewports };
```

Only **used** custom/overridden controls are emitted, keeping `player.json` minimal
and self‑contained (a removed‑then‑unused custom control leaves no trace).

### 5c. `spec.md` doc edits

- Bump the worked examples / `schemaVersion` note; document the `controls` block,
  the `icon` field (always a Lucide name string), and the renderer lookup rule above.
- **§6 (catalog):** note that the 21 ids remain the reserved contract; custom ids use
  the `CUSTOM_` prefix and are **declared inline** (never assumed by renderers).
- **§8 (out of scope):** clarify that custom controls carry their **glyph** (since no
  native default exists) but **behavior is still the embedder's job** — a custom
  control with no native binding does nothing unless the host app wires its id. Add
  an optional `"action"` string to a custom declaration as the documented hook
  (e.g. an event name / URL) — emitted only if set. (Flagged in open questions.)

---

## 6. Wiring registry changes through the app

Registry edits (add/remove custom, set/reset icon) must re‑render the palette, the
canvas, and the code panel — the same fan‑out `studio.onChange` already drives for
layout edits.

- In [`src/studio.ts`](src/studio.ts), the `Studio` constructor subscribes to the
  registry and re‑emits: `registry.subscribe(() => this.emit())`. Every existing
  `studio.onChange` consumer ([`palette.ts`](src/ui/palette.ts),
  [`codepanel.ts`](src/ui/codepanel.ts)) then refreshes for free.
- **Eviction on remove:** `registry.removeCustom(id)` must also strip that id from
  every viewport's layout + collapse lists. Cleanest seam: the editor exposes
  `remove(id)` already; have `Studio` hold a small `onRegistryRemove(id)` that calls
  `state.remove(id)` for the active editor (and, since region state keeps *all*
  viewports, add a `RegionState.purge(id)` that removes the id from every viewport's
  regions + collapse, not just the active one). Call `purge` before dropping the def.
- **Load order:** the `registry` singleton constructs (and loads from localStorage)
  at module import, before `RegionState` loads its layout — so when
  `state.load()`/`sanitizeLayouts` runs, `registry.kindOf` already knows custom kinds.

### 6a. Persistence & sanitization edge cases ([`state.ts`](src/modes/region/state.ts))

- `collapseList()` filters via `isCollapsible`, which calls `registry.kindOf` — a
  custom icon control is now correctly allowed; a custom slider/text is excluded.
  ✔ once load order (above) holds.
- `idList()` already accepts any string, so custom ids in saved layouts survive
  reload. But a custom id whose **definition no longer exists** (registry cleared,
  storage edited) should be dropped: add a final pass in `sanitizeRegions`/
  `collapseList` that keeps an id only if `registry.get(id)` exists. This prevents a
  ghost chip that can't render.
- Registry has its **own** storage key (`player-studio:registry`), independent of
  `player-studio:region-layout`, so clearing a layout doesn't wipe custom controls
  and vice‑versa. `resetToDefault()` leaves custom controls intact (document this);
  add a separate "Reset controls" affordance if a full reset is wanted (open Q).

---

## 7. Styling ([`src/style.css`](src/style.css))

- Icon‑picker modal: backdrop, dialog, search input, responsive swatch grid,
  hover/selected swatch state, empty/too‑many‑results hint.
- "+ Add control" button in the palette; per‑chip pencil/reset/× affordances
  (show on hover, keyboard‑focusable). Visual marker on overridden built‑ins.
- Custom chips reuse the existing `.chip` look so they're indistinguishable to drag.

---

## 8. Files touched (summary)

| File | Change |
| --- | --- |
| `src/icons.ts` *(new)* | `IconName` type + `renderIcon()` + `isKnownIcon()` |
| `src/registry.ts` *(new)* | `ControlRegistry` class + `registry` singleton + persistence |
| `src/ui/iconpicker.ts` *(new)* | `pickIcon()` modal over Lucide `icons` (name‑only) |
| `src/controls.ts` | `ControlDef.icon: IconName`; built‑ins declarative (drop glyph imports); `ControlId`/`BuiltinId`; `isFill` via registry |
| `src/modes/region/state.ts` | widen ids → `ControlId`; `purge(id)`; registry‑aware sanitization; load‑order note |
| `src/modes/region/spec.ts` | emit `controls` block; `schemaVersion: "2.1"`; `isFill` via registry |
| `src/modes/types.ts` | `EditorInstance` ids → `ControlId` |
| `src/dnd.ts` | ids → `ControlId` |
| `src/ui/palette.ts` | iterate `registry.list()`; add‑control + change/reset/remove affordances; `renderIcon` |
| `src/ui/controlbody.ts` | icon branch → `renderIcon(registry.iconOf(id))` |
| `src/studio.ts` | subscribe to registry; eviction wiring |
| `src/style.css` | picker modal + chip affordances |
| `spec.md` | document `controls` block, `icon` name field, version bump, behavior caveat |

---

## 9. Build order (milestones)

1. **`IconName` + `renderIcon`** (`icons.ts`); convert `ControlDef.icon` to a Lucide
   name string and route `palette`/`controlbody` through `renderIcon`. No behavior
   change yet — built‑ins render identically. (De‑risks the icon abstraction first.)
2. **`ControlRegistry`** seeded with the 21 built‑ins + persistence; repoint
   `CONTROL_BY_ID`/`isFill`/`isCollapsible` reads to it; `studio` re‑emits on
   registry change. Still no UI to mutate it — parity check.
3. **Override existing icon** (req #3): per‑chip change/reset via `pickIcon()`;
   `setIcon`/`resetIcon`. Canvas + palette reflect overrides live.
4. **Add custom control** (req #1): "+ Add control" → `pickIcon` + label →
   `addCustom`; new chip drags/places/collapses like a built‑in; `removeCustom` +
   `purge` eviction.
5. **Schema** (req #2): `controls` block in `spec.ts`, `schemaVersion: "2.1"`, code
   panel shows declarations for used custom/overridden ids; update `spec.md`.
6. **Sanitization hardening**: drop ghost ids on load, custom‑slider/text exclusion
   from collapse, registry/layout storage independence.
7. **Polish**: picker search/camelCase matching + result cap, styling,
   keyboard/focus handling, overridden‑built‑in marker.

---

## 10. Open questions / assumptions (defaults chosen)

- **Custom kind = `icon` only (v1).** Custom text/slider controls are excluded to
  keep `controlbody` and span logic simple. Flag if custom sliders are wanted.
- **Icon representation = Lucide name only.** The schema carries just the Lucide
  export name; native teams map it to their own glyph set (no raw SVG). This means
  custom/override icons are limited to Lucide's catalog — acceptable per the
  requirement ("chosen from any Lucide icon"). If a brand glyph outside Lucide is
  ever needed, that's a future schema addition, not v1.
- **Behavior for custom controls is out of scope** (spec is layout+style). The
  optional `action` field is the only behavior hook; otherwise a custom control is
  cosmetic until the host binds its id. Confirm whether `action` is needed for v1.
- **`CUSTOM_` id prefix + label‑derived slug**, uniquified. Assumed acceptable; an
  alternative is opaque `CUSTOM_<uuid>` ids if labels shouldn't leak into ids.
- **`resetToDefault()` keeps custom controls** (only layout/theme reset). Add a
  separate "Reset controls" action if a hard wipe is desired.
- **Schema bump is minor (`2.0` → `2.1`)** since `controls` is additive; a strict
  renderer that ignores unknown ids simply won't draw custom controls. Bump to a
  major instead if we want old renderers to *reject* rather than silently skip.
