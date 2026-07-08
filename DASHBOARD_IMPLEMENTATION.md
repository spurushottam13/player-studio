# Dashboard Implementation — Regional Layout Authoring (Drag & Drop)

How the **dashboard** lets a user drag controls onto a player mock, switch
**viewports**, fold controls into **Setting**, and emit the Regional Layout JSON.
For now the output target is `console.log` / a live code panel; later it posts to
the layout API. The consumer side (player) is in
[`PLAYER_IMPLEMENTATION.md`](./PLAYER_IMPLEMENTATION.md); the contract is
[`spec.md`](./spec.md).

This doc generalizes the working POC in [`src/modes/region/`](./src/modes/region/)
(editor, state, spec), [`src/dnd.ts`](./src/dnd.ts), and
[`src/ui/palette.ts`](./src/ui/palette.ts).

> **Schema:** the dashboard emits **`schemaVersion` 3.0** — per-**viewport**
> layouts (`default | 490 | 300 | 200`) of lane-keyed rows, each viewport with
> its own `collapseInSetting`
> list, under one shared `theme`, plus an optional top-level **`controls`** block
> declaring **custom controls**, **text controls**, and **icon overrides**
> ([§2b](#2b-the-control-registry-built-ins--custom--overrides) / [§5](#5-serializer--internal-model--output-json)).

> **17 built-ins.** **All** time readouts (`TimeConsumed`, `TimeLeft`,
> `TimeDuration`, `TimeAll`) are no longer built-in chips — they (plus Current
> Chapter, Dynamic Text, and Title) are added through the **"+ Add text"** flow as
> **text controls** ([§6f](#6f-text-controls--add-text)). The default layout seeds a
> `TimeConsumed` text control (`registry.seedDefaults()`) so the default bar still
> shows elapsed time.

---

## 1. What we're building

```
┌──────────────────────┐  drag  ┌──────────────────────────────┐  serialize ┌─────────────┐
│  Control palette      │ ─────► │  Player canvas (one viewport) │ ─────────► │ console.log │
│  17 built-ins + custom│  drop  │  regions → rows → lanes        │  on change  │ / code panel│
│  + "Add control" +    │ ◄───── │  (top / center / bottom)       │             │  (the JSON) │
│  "Add text" +         │drag-back└──────────────────────────────┘             └─────────────┘
│  "Collapse in Setting"│            ▲  Viewport switcher: Default · ≤490 · ≤300 · ≤200
└──────────────────────┘
```

Pieces:

1. **Palette (left)** — draggable control chips: the **17 built-ins plus any
   user-added custom + text controls** (drag source + remove target). Above them an
   **"Add custom control"** button (pick any Lucide icon) and an **"Add text"**
   button (time readouts, current chapter, dynamic text, title — §6f); each chip
   also exposes inline actions to **change its icon**, **reset** an override, or
   **delete** a custom control (§6d). Below them a **"Collapse in Setting"** bin.
2. **Canvas (center)** — a player mock split into three regions; drop zones build
   the layout. A **viewport switcher** above it swaps which viewport you're
   editing and resizes the preview.
3. **State + registry + serializer** — a per-viewport layout model (drops/collapses
   mutate it) **and** a runtime **control registry** (custom controls + icon
   overrides, §2b); both feed the Regional Layout JSON re-serialized on every change.

---

## 2. The authoring model (state ≠ output)

The dashboard keeps an **edit-friendly** internal model and _derives_ the output
JSON from it. Don't author directly against the wire format — the internal lanes
carry editor state the wire's lane-keyed rows don't need.

### Internal model

```ts
type Lane = "start" | "center" | "end"; // the three alignment lanes
type RegionName = "top" | "center" | "bottom";
type Viewport = "default" | "490" | "300" | "200"; // max-width breakpoints

interface Row {
  start: ControlId[]; // ordered L→R
  center: ControlId[];
  end: ControlId[];
}
type Regions = Record<RegionName, Row[]>; // each region = stacked rows

// One viewport's design: the placed regions PLUS the icons folded into Setting.
interface ViewportLayout {
  regions: Regions;
  collapse: ControlId[]; // serialized as `collapseInSetting`
}
type Layouts = Record<Viewport, ViewportLayout>;

interface Theme {
  primary: string;
  secondary: string;
} // shared across viewports
```

- The store holds **four independent viewport layouts** + one **active viewport**
  pointer. All mutating ops act on the active viewport only.
- A region is an **ordered list of rows**; each row has **three lanes**
  (`start` / `center` / `end`), each an ordered list of control ids — a built-in
  `gridIdentifier` **or** a `CUSTOM_*` id (§2b).
- A control appears **at most once** within a viewport, across its regions **and**
  its collapse list.
- Empty rows are **pruned** automatically after every edit.
- `theme` is global (one set of tokens for all viewports).
- The layout stores only **ids**; what each id _is_ (label, kind, icon, custom?)
  lives in the **control registry** (§2b), persisted separately.

> Why lanes? A lane is a fixed, always-present drop target, so the user can drop
> into "the right edge of row 2" directly. The serializer emits the same lanes on
> the wire, minus empty ones (§5).

### A control's identity: the control id

Every chip and placed item is keyed by a **control id**. Three kinds:

- A **built-in `gridIdentifier`** — one of the 17 stable cross-platform ids
  (`PlayNPause`, `VideoProgress`, …). These are the reserved contract.
- A **custom id** `CUSTOM_<slug>` — a user-added control (icon **or** text). The
  `CUSTOM_` prefix (from the label, slugged + uniquified) guarantees no collision
  with the built-ins.
- A **dynamic-text id** `cdt_<name>` — a Dynamic Text control, keyed by its
  SDK-facing variable name (§6f).

The id's metadata (label, render `kind`, icon, and for text controls its `textType`
+ extras) is resolved through the **registry** (§2b), not the layout. The dashboard
uses `kind` only to render the chip/preview and to decide what may collapse — it
never writes a built-in's `kind` into the output JSON; custom and text controls _do_
carry their declaration (§5).

---

## 2b. The control registry (built-ins + custom + overrides)

The static control table from the old POC is now a **runtime `ControlRegistry`**
([`src/registry.ts`](./src/registry.ts)) — a single app-wide singleton seeded from
the built-in catalog ([`src/controls.ts`](./src/controls.ts)) and layered with the
user's edits. It is the source of truth for _what a control is_; the layout state
(§2/§3) only references ids.

It owns three things:

|                       | what                                                          | persisted                |
| --------------------- | ------------------------------------------------------------- | ------------------------ |
| **built-ins**         | the 17 `ControlDef`s (`id`, `label`, `kind`, `icon`) — frozen | in code                  |
| **custom/text ctrls** | user-added `ControlDef`s, `custom: true`, id `CUSTOM_*` / `cdt_*` | `player-studio:registry` |
| **icon overrides**    | per-id `id → iconName` for built-ins whose glyph was swapped  | `player-studio:registry` |

```ts
class ControlRegistry {
  list(): ControlDef[];                 // built-ins ++ custom (palette iterates this)
  get(id): ControlDef | undefined;      // built-in or custom def
  iconOf(id): IconName;                 // override ?? def.icon  (effective glyph)
  kindOf(id): ControlKind | undefined;  // drives isFill / isCollapsible
  isCustom(id): boolean;
  isOverridden(id): boolean;

  addCustom({ label, icon, kind? }): ControlId;   // mints a CUSTOM_<slug> id (icon control)
  addText({ textType, separator?, variable?, showNumber? }): ControlId;  // a text control (§6f)
  seedDefaults(): void;       // ensure the seeded default text control exists (fresh + reset)
  removeCustom(id): void;                          // + purge it from every viewport (§3)
  setIcon(id, icon): void;    // custom → edit in place; built-in → record an override
  resetIcon(id): void;        // drop a built-in's override
  subscribe(fn): () => void;  // re-render palette + canvas + code panel on any change
}
export const registry = new ControlRegistry();
```

> **Seeded default text control.** Since no time readout is a built-in, the default
> layout references a **seeded** `CUSTOM_time_consumed` text control
> (`DEFAULT_TIME_CONTROL_ID`). The registry creates it on a **fresh install** (no
> persisted registry) and `state.resetToDefault()` re-creates it, so the default bar
> always shows elapsed time. It's an ordinary text control otherwise — draggable,
> editable, deletable.

### Icons are Lucide **names**

An icon is just a **Lucide export name** (a string, e.g. `"Heart"`), never raw SVG.
[`src/icons.ts`](./src/icons.ts) resolves a name to an `<svg>` via
`renderIcon(name)` (with a `CircleHelp` fallback for an unknown name) and exposes
the full catalog (~1958 names) for the icon picker (§6d). The same name is what the
serializer writes into the `controls` block (§5), so the schema stays portable —
each platform maps the name to its own glyph set.

- **Custom controls** (`addCustom`) are `kind: "icon"`; **text controls**
  (`addText`) are `kind: "text"` and carry a `textType` + extras (§6f). No custom
  sliders.
- A registry edit fans out as a normal change: the `Studio` re-emits on
  `registry.subscribe`, so palette, canvas, and the code panel all refresh live.

---

## 3. State API

A store the canvas + palette drive and the serializer reads. (POC reference:
[`src/modes/region/state.ts`](./src/modes/region/state.ts).)

```ts
interface ItemPath {
  region: RegionName;
  row: number;
  lane: Lane;
  index: number;
}

class RegionState {
  // ---- viewports -----------------------------------------------------------
  getViewports(): readonly Viewport[];
  getViewport(): Viewport; // active
  setViewport(v: Viewport): void; // switch which viewport is being edited

  // ---- active-viewport regions --------------------------------------------
  rows(region: RegionName): Row[]; // of the ACTIVE viewport
  find(id: ControlId): ItemPath | null;
  has(id: ControlId): boolean; // on the bar OR collapsed in this viewport
  place(id: ControlId, target: ItemPath): void; // into an existing lane
  placeInNewRow(id, region, atRow, lane?): void; // into a new row
  remove(id: ControlId): void; // from the ACTIVE viewport
  purge(id: ControlId): void; // from EVERY viewport — used when a custom is deleted

  // ---- collapse-in-Setting (active viewport) ------------------------------
  getCollapsed(): ControlId[];
  isCollapsed(id: ControlId): boolean;
  collapse(id: ControlId): void; // bar → Setting menu
  uncollapse(id: ControlId): void; // out of Setting (does NOT re-place on bar)

  // ---- non-mutating reads of ANY viewport, for serialization --------------
  rowsOf(vp: Viewport, region: RegionName): Row[];
  collapsedOf(vp: Viewport): ControlId[];

  // ---- theme + lifecycle ---------------------------------------------------
  getTheme(): Theme;
  setTheme(partial: Partial<Theme>): void;
  clear(): void; // empties the ACTIVE viewport
  resetToDefault(): void; // seeds `default`; narrow viewports blank
  subscribe(fn: () => void): () => void;
}

// Standalone: only icons (and never `Setting` itself) may be collapsed.
// Resolves kind via the registry, so CUSTOM_* icon controls qualify too.
function isCollapsible(id: ControlId): boolean; // registry.kindOf(id) === "icon" && id !== "Setting"
```

Invariants baked into the store:

- **Single occurrence per viewport:** `place` / `placeInNewRow` / `collapse` first
  drop the id from wherever it was (bar lane _or_ collapse list).
- **Prune empty rows** and notify subscribers after every mutation.
- **Setting is auto-managed** — see §3a.
- **Persist** to `localStorage` (POC key `player-studio:region-layout`) as
  `{ layouts, theme, active }`; sanitize + migrate the legacy flat `{ regions }`
  shape into the `default` viewport on load. The **registry persists separately**
  (`player-studio:registry`), so clearing a layout never wipes custom controls and
  vice-versa.
- **Registry-aware load:** the `registry` singleton constructs (and loads) at import
  time, _before_ any `RegionState`, so layout sanitization can resolve custom ids.
  On load, an id is **dropped** if `registry.get(id)` is undefined — this evicts
  "ghost" ids (a custom control deleted while its id lingered in saved layout JSON).
- **Delete = purge:** deleting a custom control calls `registry.removeCustom(id)`
  **and** `state.purge(id)` (strips it from every viewport's regions + collapse),
  so no viewport is left referencing a control that no longer exists.

### 3a. `reconcileSetting()` — the Setting-icon rule

Runs on **every** change, on the active viewport:

```ts
// Setting is mandatory iff this viewport has ≥1 collapsed icon.
const wantSetting = layout.collapse.length > 0;
if (wantSetting && !find("Setting")) addSettingToLastBottomRow(); // show it
if (!wantSetting && find("Setting")) removeSetting(); // hide it
```

So the `Setting` icon is **fully derived** from the collapse list: ≥1 collapsed →
`Setting` shown on the bar; 0 → no `Setting`. The user never places it by hand
(the palette disables that chip — §6).

---

## 4. Drag & drop wiring

Native HTML5 DnD. Key trick: `dataTransfer` payloads are **not readable during
`dragover`**, so the dragged id is stashed in a module variable and read back on
drop. (POC reference: [`src/dnd.ts`](./src/dnd.ts).)

### 4a. Sources — palette chips, placed controls, collapsed chips

```ts
let draggingId: ControlId | null = null;
const MIME = "application/x-player-control";

function makeDraggable(
  el: HTMLElement,
  id: ControlId,
  dragImage?: HTMLElement,
) {
  el.setAttribute("draggable", "true");
  el.addEventListener("dragstart", (e) => {
    draggingId = id;
    e.dataTransfer?.setData(MIME, id);
    e.dataTransfer!.effectAllowed = "copyMove";
    if (dragImage) e.dataTransfer!.setDragImage(dragImage, 18, 18);
    document.body.classList.add("dnd-active");
  });
  el.addEventListener("dragend", () => {
    draggingId = null; /* clear highlight */
  });
}

// Force-end a drag whose source element was rebuilt away by a re-render, so its
// own `dragend` never fires (used after collapse/lane commits).
function endDrag() {
  draggingId = null;
  document.body.classList.remove("dnd-active");
}
```

Palette chips, placed controls, **and** collapsed chips in the Setting bin are all
draggable.

### 4b. Drop targets on the canvas

Two target types, marked with `data-drop`:

| `data-drop` | element          | meaning                                     |
| ----------- | ---------------- | ------------------------------------------- |
| `"lane"`    | a lane in a row  | insert into this lane at the caret position |
| `"gap"`     | gap between rows | create a **new row** at this position       |

Each lane carries `data-region`, `data-row`, `data-lane`; each gap carries
`data-region`, `data-row`. On drop, lane → `state.place(...)`, gap →
`state.placeInNewRow(...)`. (Unchanged from the original lane/caret logic.)

### 4c. Remove (drag back to palette)

```ts
function makeRemoveTarget(panel: HTMLElement, state: RemoveTarget) {
  panel.addEventListener("dragover", (e) => {
    if (draggingId) e.preventDefault();
  });
  panel.addEventListener("drop", (e) => {
    const id = (e.dataTransfer?.getData(MIME) ||
      draggingId) as ControlId | null;
    draggingId = null;
    if (id && state.has(id)) {
      e.preventDefault();
      state.remove(id);
    } // ignore fresh palette drags
  });
}
```

### 4d. Collapse (drag into the Setting bin)

```ts
interface CollapseTarget {
  canCollapse(id: ControlId): boolean;
  collapse(id: ControlId): void;
}

function makeCollapseTarget(bin: HTMLElement, target: CollapseTarget) {
  bin.addEventListener("dragover", (e) => {
    if (!draggingId || !target.canCollapse(draggingId)) return;
    e.preventDefault();
    bin.classList.add("collapse--over");
  });
  bin.addEventListener("dragleave", () =>
    bin.classList.remove("collapse--over"),
  );
  bin.addEventListener("drop", (e) => {
    bin.classList.remove("collapse--over");
    const id = (e.dataTransfer?.getData(MIME) ||
      draggingId) as ControlId | null;
    draggingId = null;
    if (id && target.canCollapse(id)) {
      e.preventDefault();
      target.collapse(id);
    }
  });
}
```

`canCollapse(id) = isCollapsible(id) && !isCollapsed(id)`. Accepts drags from the
bar **and** straight from the palette.

---

## 5. Serializer — internal model → output JSON

The serializer emits each viewport's lanes directly — a row is an object keyed
by lane — and emits its collapse list as `collapseInSetting`. (POC reference:
[`src/modes/region/spec.ts`](./src/modes/region/spec.ts).)

### Per-row rule

Walk lanes `start → center → end`; skip empty ones. Each non-empty lane becomes
`{ items }` with its ids in order. A `fill` control (a slider — only
`VideoProgress`) is **not** pulled out of the sequence: it stays at its position in
`items` and is repeated in the lane's optional `fill` list, which carries only
the stretch behavior.

```ts
interface LaneGroup {
  items: ControlId[];
  fill?: ControlId[]; // subset of items that stretch; omitted when none
}
type SerializedRow = Partial<Record<Lane, LaneGroup>>;

function serializeRow(row: Row): SerializedRow {
  const out: SerializedRow = {};
  for (const lane of ["start", "center", "end"] as const) {
    if (!row[lane].length) continue;
    const items = [...row[lane]];
    const fill = items.filter(isFill);
    out[lane] = { items, ...(fill.length ? { fill } : {}) };
  }
  return out;
}
```

`isFill(id) = registry.kindOf(id) === "slider"` — resolved through the registry so
custom (`icon`) and text controls are never treated as fill.

### The `controls` block (custom controls, text controls + icon overrides)

`schemaVersion` 2.1 adds an optional top-level **`controls`** object, keyed by id.
It is built by walking every id **used** anywhere across the four viewports (lanes
**and** collapse lists) and emitting a declaration only for ids the player can't
resolve on its own — **custom controls**, **text controls**, and **icon-overridden
built-ins**. Stock built-ins stay id-only; the block is **omitted entirely when
empty** (so a layout with no customs/overrides is byte-identical to the old 2.0
output plus the version bump).

```ts
function buildControlDecls(state: RegionState): Record<string, unknown> {
  const used = new Set<ControlId>();
  for (const vp of ["default", "490", "300", "200"] as const) {
    for (const region of ["top", "center", "bottom"] as const)
      for (const row of state.rowsOf(vp, region))
        for (const lane of ["start", "center", "end"] as const)
          for (const id of row[lane]) used.add(id);
    for (const id of state.collapsedOf(vp)) used.add(id);
  }

  const out: Record<string, unknown> = {};
  for (const id of used) {
    const custom = registry.isCustom(id);
    if (!custom && !registry.isOverridden(id)) continue; // stock built-in → id-only
    const def = registry.get(id);
    out[id] = custom
      ? {
          custom: true,
          kind: def?.kind ?? "icon",
          label: def?.label ?? id,
          icon: registry.iconOf(id),
          // Text controls ride their flavour + extras so the player can render them:
          ...(def?.textType ? { textType: def.textType } : {}),      // §6f
          ...(def?.separator !== undefined ? { separator: def.separator } : {}),   // timeAll
          ...(def?.variable !== undefined ? { variable: def.variable } : {}),      // dynamicText
          ...(def?.showNumber !== undefined ? { showNumber: def.showNumber } : {}), // currentChapter
        }
      : { icon: registry.iconOf(id) }; // override → new glyph only
  }
  return out;
}
```

A **text control** serializes like a custom control but with `kind: "text"` and a
`textType`, plus the one extra field its flavour needs (`separator` for `timeAll`,
`variable` for `dynamicText`, `showNumber` for `currentChapter`). The player reads
`textType` to know what to render — see
[`PLAYER_IMPLEMENTATION.md` §7c](./PLAYER_IMPLEMENTATION.md#7c-text-controls-the-controls-block).

### Whole-document build (all four viewports)

```ts
function buildRegionSpec(state: RegionState) {
  const theme = state.getTheme();
  const viewports: Record<string, unknown> = {};
  for (const vp of ["default", "490", "300", "200"] as const) {
    const regions: Record<string, unknown[]> = {};
    for (const region of ["top", "center", "bottom"] as const) {
      regions[region] = state.rowsOf(vp, region).map(serializeRow);
    }
    viewports[vp] = { regions, collapseInSetting: state.collapsedOf(vp) };
  }
  const controls = buildControlDecls(state);
  return {
    schemaVersion: "3.0",
    layoutModel: "region",
    theme: {
      primary: theme.primary,
      secondary: theme.secondary,
      iconSize: 22,
      barHeight: 40,
      gap: 8,
    },
    ...(Object.keys(controls).length ? { controls } : {}), // omit when empty
    viewports,
  };
}
```

### Emit on every change (current target: `console.log` / code panel)

```ts
state.subscribe(() => {
  const json = JSON.stringify(buildRegionSpec(state), null, 2);
  console.log(json); // ← for now (the POC also shows it live in a code panel)
  // later: PUT /api/player-layout/{id}  with this body
});
```

This produces exactly the shape documented in
[`PLAYER_IMPLEMENTATION.md` §2](./PLAYER_IMPLEMENTATION.md#2-json-shape-what-the-player-receives).

---

## 6. UI — palette, viewport switcher, collapse bin & icon picker

### 6a. Canvas (the player mock)

Render the **active viewport's** regions so the user authors against a realistic
preview. (POC reference: [`src/modes/region/editor.ts`](./src/modes/region/editor.ts).)

```
player (sized to the active viewport)
├── region--top
│   ├── row-gap (drop: gap, row 0)
│   ├── player-row → lane--start | lane--center | lane--end   (each drop: lane)
│   └── …
├── region--center
└── region--bottom
```

Per render: apply `--primary` / `--secondary`; for each region emit a `gap`, each
row (3 lanes), and a trailing `gap`; an empty region shows a "Drop here"
placeholder that is itself a `gap` target. Each placed control renders by `kind`
(icon glyph / `00:00` text / `<input range>`) plus a `×` remove button — the icon
branch draws `renderIcon(registry.iconOf(id))`, so overrides and custom glyphs show
live. The canvas re-renders on **registry** changes too (not just layout), so an
icon swap updates an already-placed control immediately.

### 6b. Viewport switcher

A segmented control above the player. Switching swaps the active design **and
resizes the preview** so the responsive bar is visible:

```ts
const VIEWPORT_PX = { default: 640, "490": 490, "300": 300, "200": 200 };

for (const vp of state.getViewports()) {
  const btn = segButton(label(vp)); // "Default" · "≤490" · "≤300" · "≤200"
  btn.onclick = () => state.setViewport(vp);
}

// in render():
const w = VIEWPORT_PX[state.getViewport()];
player.style.width = `${w}px`;
player.style.height = `${Math.round((w * 9) / 16)}px`; // keep 16:9
highlightActive(state.getViewport());
```

Each viewport keeps its own layout + collapse set, so the bar you see changes as
you switch. `resetToDefault()` seeds only `default`; the narrow ones start blank
(author from scratch, or leave blank to inherit on the player — see
[`PLAYER_IMPLEMENTATION.md` §3](./PLAYER_IMPLEMENTATION.md#3-viewports--choosing-which-layout-to-render)).

### 6c. Collapse-in-Setting bin (left palette)

Below the chips, the **left palette** hosts the collapse bin (POC reference:
[`src/ui/palette.ts`](./src/ui/palette.ts)):

```ts
const bin = el("div", { class: "collapse-bin" }, [collapseItems]);
makeCollapseTarget(bin, {
  canCollapse: (id) => active.canCollapse?.(id) ?? false, // isCollapsible && !isCollapsed
  collapse: (id) => {
    active.collapse?.(id);
    endDrag();
  },
});
// Stop collapse drops bubbling to the panel-wide REMOVE target (same element tree).
for (const ev of ["dragover", "dragleave", "drop"] as const)
  bin.addEventListener(ev, (e) => e.stopPropagation());
```

- **Drop an icon here** → `collapse(id)` (works from the bar or the palette).
  Sliders/text and `Setting` are rejected by `canCollapse`.
- **Collapsed chips** render in the bin: each is draggable back onto a lane to
  re-place it, and carries a `×` to `uncollapse(id)`.
- **The `Setting` palette chip is disabled** (`managesSetting`) — it's auto-driven
  by `reconcileSetting` (§3a), so the user can't place it manually.

> The bin lives inside the palette, which is itself the remove target — hence the
> `stopPropagation` so a collapse drop doesn't also fire "remove."

> **Architecture:** the canvas editor exposes the collapse capability on its
> `EditorInstance` (`collapsible`, `managesSetting`, `canCollapse`, `getCollapsed`,
> `collapse`, `uncollapse`, `isCollapsed`); the shared palette renders the bin
> against that interface, staying mode-agnostic.

### 6d. Custom controls & icon overrides (palette)

The palette iterates **`registry.list()`** (built-ins ++ custom ++ text), not a
static catalog, and rebuilds on every change so newly-added chips appear and icon
swaps show live. Three affordances drive the registry (§2b):

```ts
// "+ Add custom control" — pick any Lucide icon, then name it.
addBtn.onclick = async () => {
  const icon = await pickIcon({ title: "Pick an icon for your control" }); // §6e
  if (!icon) return;
  const label = window.prompt("Name your control")?.trim();
  if (label) registry.addCustom({ label, icon }); // mints a CUSTOM_<slug> id
};

// Per-chip inline actions (revealed on hover):
changeIcon.onclick = async () => {
  // ✎ — any chip
  const next = await pickIcon({ current: registry.iconOf(id) });
  if (next) registry.setIcon(id, next); // built-in → override; custom → edit
};
resetIcon.onclick = () => registry.resetIcon(id); // ↺ — only when overridden
deleteChip.onclick = () => {
  // × — only on custom chips
  studio.active().purge?.(id); // strip from every viewport first
  registry.removeCustom(id); // then drop the definition
};
```

- **Change icon** works on **built-ins** (records an override) _and_ **custom**
  controls (edits the def). An overridden built-in shows a **reset** (↺) action.
- **Delete** is custom-only and always pairs `purge` + `removeCustom` (§3).
- Action buttons `stopPropagation` on `pointerdown`/`click` so clicking one never
  starts a chip drag.

### 6e. Icon picker (`pickIcon`)

A modal over the full Lucide catalog (POC reference:
[`src/ui/iconpicker.ts`](./src/ui/iconpicker.ts)). `iconNames()` (~1958 names) feeds
a searchable swatch grid; the search normalizes case + punctuation so "full screen"
matches `Fullscreen`, and only the first ~240 matches render (refine to narrow).
`pickIcon(opts?): Promise<string | null>` resolves the chosen **Lucide name** (never
raw SVG) or `null` on cancel. Used by both "Add control" and "Change icon".

### 6f. Text controls ("+ Add text")

A second creator button next to "Add custom control". It opens the **text picker**
([`src/ui/textpicker.ts`](./src/ui/textpicker.ts)) — a small modal listing the seven
text flavours — and, on pick, calls `registry.addText(descriptor)`, which mints a
`kind: "text"` control ([`src/controls.ts`](./src/controls.ts) `TextType`):

| flavour          | id form       | preview      | extra input the picker collects        |
| ---------------- | ------------- | ------------ | -------------------------------------- |
| Time Left        | `CUSTOM_*`    | `00:00`      | —                                      |
| Time Consumed    | `CUSTOM_*`    | `00:00`      | —                                      |
| Time Duration    | `CUSTOM_*`    | `00:00`      | —                                      |
| Time All         | `CUSTOM_*`    | `00:00 / 00:00` | **separator** text (default `" / "`) |
| Current Chapter  | `CUSTOM_*`    | `Chapter Name` | **switch** — append the `02/14` number |
| Dynamic Text     | `cdt_<name>`  | `cdt_<name>` | **variable** name (auto-prefixed `cdt_`) |
| Title            | `CUSTOM_*`    | `Video Title` | —                                     |

```ts
// "+ Add text" — pick a flavour, then (for two of them) an extra field.
addTextBtn.onclick = async () => {
  const desc = await pickText();      // { textType, separator? | variable? | showNumber? }
  if (desc) registry.addText(desc);   // → CUSTOM_* / cdt_* text control
};
```

- All chips render an **icon** in the palette (as the old built-in time chips did)
  but a **text** string on the canvas (`registry`-resolved `def.text`), so they never
  collapse into Setting (icon-only, §6c).
- The default layout ships one of these for free: a seeded **Time Consumed** text
  control (`CUSTOM_time_consumed`) via `registry.seedDefaults()` (§2b) — the
  `addText`-built stand-in for the removed `TimeConsumed` built-in.
- **Time controls** always preview `00:00`; only **Time All** takes user input (its
  `separator`). **Current Chapter** shows the chapter title as text, with a **switch**
  to append the `02/14` position status (`showNumber`).
- **Dynamic Text** is keyed by a `cdt_`-prefixed **variable** — both its id and the
  handle the player/SDK fills at load. The picker keeps the user's casing, strips
  non-identifier characters, and prefixes `cdt_` if missing;
  `normalizeVariable` is shared with the picker's live preview so what you see is
  what's stored.
- Each is serialized into the `controls` block with its `textType` + extras (§5) and
  rendered player-side by `textType`
  ([`PLAYER_IMPLEMENTATION.md` §7c](./PLAYER_IMPLEMENTATION.md#7c-text-controls-the-controls-block)).

---

## 7. Toolbar (theme + reset)

- **Primary / Secondary** color pickers → `state.setTheme({ primary | secondary })`
  (global — affects all viewports).
- **Reset** → `state.resetToDefault()` (seeds the canonical `default` viewport, and
  re-creates the seeded `CUSTOM_time_consumed` text control it references — §2b).
  Layout/theme only — **user custom controls and icon overrides survive** (they live
  in the separately-persisted registry, §2b).
- **Clear** → `state.clear()` (empties the **active** viewport only).

---

## 8. Build order / checklist

- [ ] `RegionState` with per-viewport `Layouts` + active pointer + the API in §3
      (single-occurrence, prune-empty, persist + legacy migration).
- [ ] `reconcileSetting()` on every change — derive the `Setting` icon from the
      collapse list (§3a).
- [ ] `ControlRegistry` singleton: 17 built-ins + custom/text controls + icon
      overrides, persisted to `player-studio:registry`; `Studio` re-emits on its
      changes (§2b). `seedDefaults()` on fresh install + reset creates the
      `CUSTOM_time_consumed` text control the default layout references (§2b).
- [ ] Palette iterates `registry.list()` (built-ins + custom + text), each
      `makeDraggable`; disable the `Setting` chip; per-chip change-icon / reset /
      delete (§6d).
- [ ] "Add custom control" + `pickIcon` modal over the Lucide catalog (§6d/§6e).
- [ ] "Add text" + `pickText` modal → `registry.addText`; collect the separator /
      variable / show-number input per flavour (§6f).
- [ ] Canvas: regions → gaps + rows → 3 lanes with `data-drop`; lane/gap drops;
      icons via `registry.iconOf`; re-render on registry changes (§6a).
- [ ] Viewport switcher: `setViewport` + resize the preview (§6b).
- [ ] Collapse bin in the left palette: `makeCollapseTarget` + collapsed chips +
      `stopPropagation` vs the remove target (§6c).
- [ ] Delete a custom control → `state.purge(id)` across all viewports + drop ghost
      ids on load (§3).
- [ ] `serializeRow` + `buildControlDecls` + `buildRegionSpec` over all four
      viewports → `schemaVersion` 3.0, `controls` omitted when empty, text controls
      emit `textType` + extras (§5).
- [ ] `state.subscribe` → `console.log(JSON)` / code panel (swap for API later).
- [ ] Verify output validates against `player.schema.json` and round-trips through
      the player ([`PLAYER_IMPLEMENTATION.md` §9c](./PLAYER_IMPLEMENTATION.md#9c-full-document-the-canonical-fixture)),
      including a custom control + override ([§9d](./PLAYER_IMPLEMENTATION.md#9d-with-a-custom-control--an-icon-override))
      and text controls ([§9e](./PLAYER_IMPLEMENTATION.md#9e-with-text-controls-time-all--dynamic-text)).

```

```
