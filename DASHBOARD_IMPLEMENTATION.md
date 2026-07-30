# Dashboard Implementation — Regional Layout Authoring (Drag & Drop)

How the **dashboard** lets a user drag controls onto a player mock, switch
**viewports**, style them, fold controls into **Setting**, undo/redo, and emit the
Regional Layout JSON. For now the output target is `console.log` / a live code
panel; later it posts to the layout API. The consumer side (player) is in
[`PLAYER_IMPLEMENTATION.md`](./PLAYER_IMPLEMENTATION.md).

> **This document is the contract for the authoring side.** It is kept in step
> with the code in [`src/`](./src/). [`spec.md`](./spec.md) is **background and
> rationale** — the model's goals and why it replaced the grid model — and it
> predates the per-viewport layout; where the two disagree, this document wins.

This doc generalizes the working code in [`src/modes/region/`](./src/modes/region/)
(editor, state, spec), [`src/registry.ts`](./src/registry.ts),
[`src/history.ts`](./src/history.ts), [`src/dnd.ts`](./src/dnd.ts), and
[`src/ui/`](./src/ui/).

> **Schema:** there is **one schema**, and the emitted document carries **no
> version field**. Per-**viewport** layouts (`default | 490 | 300 | vertical` — three
> landscape width breakpoints plus a portrait 9:16 design) of lane-keyed
> rows, each viewport with its own `collapseInSetting` list, under one shared
> `theme`, plus a top-level **`controls`** block declaring **every control used
> anywhere in the document** — each one's Material `icon` name, and the full
> definition for custom controls and text/spacer/background elements
> ([§2b](#2b-the-control-registry) / [§5](#5-serializer--internal-model--output-json)).

> **The dashboard's job is to emit a self-describing document.** A control id is
> a **behavior** contract key, not a glyph: nothing in `CaptionSearch` derives
> `manage_search`, and only 4 of the 17 built-ins match their id when lowercased.
> So the serializer writes the icon name for **every** placed control, including
> stock built-ins nobody edited — the design a user approves in the studio is then
> fully reconstructible from the JSON, with no id→glyph table on any platform.
> See [§5](#the-controls-block-identity--per-viewport-styles-appearance).

> **Units.** An `icon` is a **Material icon name** (`"play_arrow"`,
> lower_snake_case — the icon's own catalog key,
> [§2b](#icons-are-material-names)). A **spacer's `width`** and
> **`theme.paddingX` / `paddingY`** are **percentages of the player container**
> (width; width / height); every other measurement (icon `size`, lane-background
> padding/radius) is in px.

> **No schema version.** The dashboard and the renderers ship against one schema;
> the document has no version field and nothing negotiates. Changing the emitted
> shape means updating the player implementations alongside it — that coordination
> is the design, not a gap in it.
>
> Because there is no version to fall back on, **one shared JSON Schema
> (`player.schema.json`) validated in CI on both ends** — this serializer's output
> and each native parser — is what keeps the platforms honest. It is the safety
> net a version field would otherwise pretend to be.
>
> **The schema is owned by the player repo**, which also holds the type for the
> whole metadata response. This serializer is therefore a *consumer*: pull the
> published schema and validate the emitted document against it in CI. **Do not
> keep a local copy** — a second copy drifts exactly like the id→glyph table this
> contract deleted, and it would drift silently, since both sides would still pass
> their own tests.
>
> The two **`localStorage`** keys carry a **version suffix**. That is unrelated to
> the wire format — it retires local state whose stored shape, units, or ids have
> changed, dropping it rather than migrating. The suffix is per-build: this
> prototype is at `:v2`, and a downstream build that has since renamed its
> built-in ids will legitimately be further along. See §3.

> **17 built-ins.** All time readouts (`TimeConsumed`, `TimeLeft`,
> `TimeDuration`, `TimeAll`), plus Current Chapter, Dynamic Text, and Title, are
> **text controls** added via **"+ Add text"** ([§6f](#6f-text-controls--add-text)),
> not built-in chips. The two blank/decorative elements — **Spacer** and
> **Background** — are added via **"+ Add spacer"** / **"+ Add background"**
> ([§6g](#6g-spacers--backgrounds)).

---

## 1. What we're building

```
┌──────────────────────┐  drag  ┌──────────────────────────────┐  serialize ┌─────────────┐
│  Control palette      │ ─────► │  Player canvas (one viewport) │ ─────────► │ console.log │
│  17 built-ins + custom│  drop  │  regions → rows → lanes        │  on change  │ / code panel│
│  + Add text/spacer/bg │ ◄───── │  (top / center / bottom)       │             │  (the JSON) │
│  + Collapse in Setting│drag-back└──────────────────────────────┘             └─────────────┘
└──────────────────────┘            ▲  Viewport switcher: Default · ≤490 · ≤300 · 9:16
```

Pieces:

1. **Palette (left)** — draggable control chips: the **17 built-ins plus any
   user-added custom control, text control, spacer, or background** (drag source +
   remove target). Above them: **"+ Add custom control"** (pick any Material icon),
   **"+ Add text"**, **"+ Add spacer"**, **"+ Add background"**; each chip also
   exposes inline actions to **change its icon**, **reset** an override, or
   **delete** a custom control (§6d). Below them a **"Collapse in Setting"** bin.
2. **Canvas (center)** — a player mock split into three regions; drop zones build
   the layout. A **viewport switcher** above it swaps which viewport you're editing
   and resizes the preview. Clicking a placed control opens a small **popover** to
   tune it (icon size + background, spacer width, background padding/radius).
3. **Stage toolbar** — theme colors, a shared **Background** color+opacity tool, a
   **Padding** tool for the player container, and **Undo / Redo**.
4. **State + registry + serializer + history** — a per-viewport layout model
   (drops/collapses **and per-viewport icon styles** mutate it), a runtime **control
   registry** (custom controls, icon overrides — identity/glyph, §2b), and a combined
   **undo/redo history** (§3b); all feed the Regional Layout JSON, re-serialized on
   every change.

---

## 2. The authoring model (state ≠ output)

The dashboard keeps an **edit-friendly** internal model and _derives_ the output
JSON from it. Don't author directly against the wire format — the internal lanes
carry editor state the wire's lane-keyed rows don't need.

### Internal model

```ts
type Lane = "start" | "center" | "end"; // the three alignment lanes
type RegionName = "top" | "center" | "bottom";
// three landscape max-width breakpoints + a portrait 9:16 design
type Viewport = "default" | "490" | "300" | "vertical";

interface Row {
  start: ControlId[]; // ordered L→R
  center: ControlId[];
  end: ControlId[];
}
type Regions = Record<RegionName, Row[]>; // each region = stacked rows

// One viewport's design: the placed regions, the icons folded into Setting, and
// its PER-VIEWPORT icon appearance (size + background) — so the same built-in icon
// can look different across viewports.
interface IconStyle {
  size?: number; // px; absent = theme default
  iconBg?: IconBg; // { padding, radius } circle/badge; absent = none
}
interface ViewportLayout {
  regions: Regions;
  collapse: ControlId[]; // serialized as `collapseInSetting`
  styles: Record<string, IconStyle>; // keyed by control id — serialized as viewport `styles`
}
type Layouts = Record<Viewport, ViewportLayout>;

// Shared across viewports. The one place background color/opacity and the
// player-container padding live.
//
// NOTE: this is the WHOLE editable theme — six fields. The exported document's
// `theme` also carries `iconSize` and `gap` (8), which are NOT here and no UI
// changes them. `iconSize` is DEFAULT_ICON_SIZE (20) — the same constant the
// canvas uses; `gap` is a literal in the serializer (§5).
interface Theme {
  primary: string; // progress fill / active accents
  secondary: string; // icon + text color
  bgColor: string; // shared fill for EVERY background (lane + per-icon)
  bgOpacity: number; // 0–1
  // .Player container padding as a PERCENTAGE of the container, so it scales
  // with the preview (and with the real player) instead of being a fixed inset.
  playerPadX: number; // left+right, % of the container's WIDTH
  playerPadY: number; // top+bottom, % of the container's HEIGHT
}
```

> **`iconSize` is one constant now — keep it that way.** The serializer used to
> write the literal `22` while the canvas drew unstyled icons at
> `DEFAULT_ICON_SIZE` = 20, so every unstyled icon reached the player ~10% larger
> than the author saw. Both now read `DEFAULT_ICON_SIZE`
> ([`controls.ts`](./src/controls.ts)), and the emitted value is **20** — the
> canvas is the truth, since it is what the author approved.
>
> ⚠️ **`gap` is the same defect, not yet bitten.** The canvas gets `8` from
> `--gap: 8px` in the stylesheet and the serializer writes the literal `8`
> independently. They agree today, and nothing enforces it.
>
> The rule: **any value that both the canvas and the serializer need must come
> from one constant.** Two literals that happen to agree is the bug that already
> shipped once.

- The store holds **four independent viewport layouts** + one **active viewport**
  pointer. All mutating ops act on the active viewport only — so **placing, moving, or
  removing a control** (a background, spacer, icon, text, …) affects **only** the
  viewport you're editing; the others are untouched. Switching viewports shows only
  that viewport's placed controls.
- A region is an **ordered list of rows**; each row has **three lanes**
  (`start` / `center` / `end`), each an ordered list of control ids — a built-in
  `gridIdentifier` **or** a `CUSTOM_*` id (§2b).
- A control appears **at most once** within a viewport, across its regions **and**
  its collapse list.
- Empty rows are **pruned** automatically after every edit.
- `theme` is global (one set of tokens for all viewports).
- The layout stores only **ids**; what each id _is_ (label, kind, icon, custom?,
  spacer width, background padding/radius) lives in the **global control registry**
  (§2b), keyed by id and shared across viewports (identity/glyph). A control renders
  in a viewport only where its id is placed (§3), so a lane background / spacer /
  custom control added to one viewport is absent from the others.
- **Per-icon appearance is per-viewport, NOT in the registry.** A placed icon's
  `size` and `background` live in the active viewport's `styles` map (see
  `ViewportLayout` above), so the same built-in icon (e.g. `Forward`) can be a bigger
  circle in `default` and a plain glyph in `vertical` — editing one viewport never
  touches another.

> Why lanes? A lane is a fixed, always-present drop target, so the user can drop
> into "the right edge of row 2" directly. The serializer emits the same lanes on
> the wire, minus empty ones (§5).

### Control kinds

```ts
type ControlKind = "icon" | "text" | "slider" | "spacer" | "background";
```

| kind         | what                                                        | added via            |
| ------------ | ---------------------------------------------------------- | -------------------- |
| `icon`       | a single Material glyph (most controls)                    | built-in / Add ctrl  |
| `text`       | a readout (time / chapter / dynamic / title) — §6f         | + Add text           |
| `slider`     | a range that fills width (`VideoProgress` only)            | built-in             |
| `spacer`     | a blank block that adds horizontal space; user-set `width` (% of the player width) | + Add spacer (§6g) |
| `background` | a color layer behind a lane's controls; user-set padding/radius | + Add background (§6g) |

### A control's identity: the control id

Every chip and placed item is keyed by a **control id**:

- A **built-in `gridIdentifier`** — one of the 17 stable cross-platform ids.
- A **custom id** `CUSTOM_<slug>` — a user-added control (icon, text, spacer, or
  background). The `CUSTOM_` prefix (slugged + uniquified) guarantees no collision.
- A **dynamic-text id** `cdt_<name>` — a Dynamic Text control, keyed by its
  SDK-facing variable name (§6f).

The id's metadata (label, `kind`, icon, text extras, spacer width, background
padding/radius) resolves through the **registry** (§2b), not the layout. Per-icon
**size** and per-icon **background**, however, are **per-viewport** — they live in
the active viewport's `styles` map in `RegionState` (§3), not the registry.

---

## 2b. The control registry

The runtime **`ControlRegistry`** ([`src/registry.ts`](./src/registry.ts)) is a
single app-wide singleton seeded from the built-in catalog
([`src/controls.ts`](./src/controls.ts)) and layered with the user's edits. It is
the source of truth for _what a control is_ (identity + glyph); per-viewport
appearance (icon size/background) lives in `RegionState` (§3). The layout state
(§2/§3) only references ids.

It owns three things, all persisted together to the version-suffixed registry key
(`player-studio:registry:v2` here — see §3)
(viewport-agnostic — no per-icon size/background here):

|                     | what                                                             |
| ------------------- | --------------------------------------------------------------- |
| **built-ins**       | the 17 `ControlDef`s (frozen, in code)                          |
| **custom controls** | user-added defs, `custom: true` — icon / text / spacer / background |
| **icon overrides**  | `id → iconName` for built-ins whose glyph was swapped           |

```ts
class ControlRegistry {
  list(): ControlDef[];                 // built-ins ++ custom (palette iterates this)
  get(id): ControlDef | undefined;
  iconOf(id): IconName;                 // override ?? def.icon (effective glyph)
  kindOf(id): ControlKind | undefined;  // drives isFill / isCollapsible / rendering
  isCustom(id): boolean;
  isOverridden(id): boolean;
  // NOTE: per-icon size + background are per-VIEWPORT — see RegionState (§3).

  // creators
  addCustom({ label, icon, kind? }): ControlId; // CUSTOM_<slug>; kind defaults to "icon"
  addText({ textType, separator?, variable?, showNumber? }): ControlId; // §6f
  addSpacer(): ControlId;                  // kind "spacer", width 4 (% of player width) (§6g)
  addBackground(): ControlId;              // kind "background" (§6g)

  // edits
  setIcon(id, icon): void;  resetIcon(id): void;           // glyph override
  updateCustom(id, { label?, icon?, width?, paddingX?, paddingY?, radius? }): void;
  removeCustom(id): void;                                   // + purge from every viewport (§3)

  seedDefaults(): void;     // build the full default look (fresh install + reset) — see below
  snapshot(): string; restore(s): void;  // undo/redo (§3b)
  subscribe(fn): () => void; // re-render palette + canvas + code panel on any change
}
export const registry = new ControlRegistry();
```

> **`seedDefaults()` seeds the default's custom controls.** The canonical default
> layout references seeded registry entries — three background layers, two 31%-wide
> spacers, a Time Left readout. `seedDefaults()` creates them on a **fresh install**
> and on every **`state.resetToDefault()`**. The transport look (Backward/Forward
> 30px + Play 48px, each with a circular background) is **per-viewport**, so it's
> seeded into the `default` viewport's `styles` by `state.defaultLayouts` (§3), not
> here. A returning user's saved registry is loaded instead of seeded, so their edits
> survive. Deterministic ids (`DEFAULT_CONTROL_IDS`) let the default layout name the
> seeded controls.

### Icons are Material **names**

An icon is a **Material Icons name** — the icon's own key in the Material catalog,
lower_snake_case (`"play_arrow"`, `"closed_caption"`) — never raw SVG.
[`src/icons.ts`](./src/icons.ts) resolves a name via `renderIcon(name, size)` and
exposes the ~2,100-name catalog to the icon picker. The catalog itself is the
`material-icons` package's `versions.json`, which is **keyed by icon name**, so
"the name" and "the key" are the same string end to end.

- `renderIcon` returns a **ligature span** — `<span class="mi material-icons">play_arrow</span>`
  — not an `<svg>`: the self-hosted font turns the name into the glyph, so the
  element's text content _is_ the icon key. It pins the box square at `size`, which
  is what keeps a per-icon background a clean circle. Anything reaching into a
  placed control's glyph should query `.mi` and write `font-size`, not `svg`
  width/height attributes.
- Unknown names fall back to `help_outline`.
- The same name is written into the `controls` block (§5) for **every used
  control** — an overridden built-in, a custom control, and a stock built-in the
  user never touched all serialize their effective glyph. That's what keeps the
  schema portable: each platform looks the name up in its own Material set and
  needs no default table of its own (see
  [`PLAYER_IMPLEMENTATION.md` §7f](./PLAYER_IMPLEMENTATION.md#7f-icons-are-material-names)).
- **`iconOf(id)` is viewport-agnostic** — one glyph per control id, globally.
  The wire format reserves a per-viewport override at `viewports[vp].styles[id].icon`
  (parallel to how `size` overrides `theme.iconSize`), but the studio has no UI for
  it and never writes it; `setIcon` applies to every viewport. Wiring that feature
  later means making the registry viewport-keyed — the schema is already ready.

- A registry edit fans out as a normal change: `Studio` re-emits on
  `registry.subscribe`, so palette, canvas, and the code panel all refresh live.

---

## 3. State API

A store the canvas + palette drive and the serializer reads. (Reference:
[`src/modes/region/state.ts`](./src/modes/region/state.ts).)

```ts
class RegionState {
  // ---- viewports ----
  getViewports(): readonly Viewport[];
  getViewport(): Viewport; setViewport(v): void;

  // ---- active-viewport regions ----
  rows(region): Row[]; find(id): ItemPath | null; has(id): boolean;
  place(id, target: ItemPath): void; placeInNewRow(id, region, atRow, lane?): void;
  remove(id): void; purge(id): void; // purge = remove from EVERY viewport (custom delete)

  // ---- collapse-in-Setting (active viewport) ----
  getCollapsed(): ControlId[]; isCollapsed(id): boolean;
  collapse(id): void; uncollapse(id): void;

  // ---- per-viewport icon appearance (ACTIVE viewport) — the SAME icon can
  //      differ across viewports; this is why it lives here, not in the registry.
  sizeOf(id): number; hasSize(id): boolean; setSize(id, px): void;   // 12–48, default 20
  iconBgOf(id): IconBg | undefined; hasIconBg(id): boolean;
  setIconBg(id, { padding?, radius? }): void; clearIconBg(id): void;

  // ---- non-mutating reads of ANY viewport, for serialization ----
  rowsOf(vp, region): Row[]; collapsedOf(vp): ControlId[]; stylesOf(vp): Record<string, IconStyle>;

  // ---- theme + lifecycle ----
  getTheme(): Theme;
  // playerPadX/playerPadY are percentages of the container (0–10, 0.5 steps).
  setTheme(partial: Partial<Theme>): void; // primary/secondary/bgColor/bgOpacity/playerPadX/playerPadY
  clear(): void;              // empties the ACTIVE viewport
  resetToDefault(): void;     // re-seeds the full default (registry + default viewport)
  snapshot(): string; restore(s): void;    // undo/redo (§3b)
  subscribe(fn): () => void;
}

// Standalone: only icons (and never `Setting`) may be collapsed. Spacers,
// backgrounds, text, and sliders are excluded.
function isCollapsible(id): boolean; // registry.kindOf(id) === "icon" && id !== "Setting"
```

Invariants baked into the store:

- **Single occurrence per viewport:** `place` / `placeInNewRow` / `collapse` first
  drop the id from wherever it was.
- **Prune empty rows** and notify subscribers after every mutation.
- **Setting is auto-managed** — §3a.
- **Persist** to `localStorage` (`player-studio:region-layout:<version>`) as
  `{ layouts, theme, active }`. The registry persists **separately**
  (`player-studio:registry:<version>`), so clearing a layout never wipes custom controls.
  Both keys carry a **version suffix**, and the rule — not the number — is the
  contract: **bump it whenever the stored shape, units, or ids change, and drop
  old state rather than migrating it.** This prototype is at `:v2` (units went
  px → % of the player; a v1 save would be read as a 200% spacer). A downstream
  build that has since renamed built-in ids will legitimately be at `:v3` or
  beyond — don't "correct" it back to match this doc, that would resurrect exactly
  the stale saves the bump retired.

  This is **local-state** hygiene only, entirely independent of the wire format,
  which is unversioned (§ schema note). Nothing about the emitted document depends
  on this suffix.
- **Registry-aware load:** the `registry` singleton constructs (and loads/seeds) at
  import time, _before_ any `RegionState`, so layout sanitization can resolve custom
  ids; an id whose `registry.get(id)` is undefined is **dropped** (evicts ghost ids).
- **Delete = purge:** deleting a custom control pairs `registry.removeCustom(id)` +
  `state.purge(id)` across all viewports.

### 3a. `reconcileSetting()` — the Setting-icon rule

Runs on **every** change, on the active viewport: `Setting` is present iff that
viewport's `collapse` list is non-empty (auto-added to the last bottom row's end
lane when needed, stripped when the list empties). The user never places it by hand.

### 3b. Undo / redo (`History`)

[`src/history.ts`](./src/history.ts) is a combined undo/redo over **both** the
layout and the registry, so a single logical action restores as a whole — e.g.
adding a spacer (registry) then placing it (layout) are two steps, but each undo
lands on a self-consistent whole.

```ts
class History {
  constructor(registry: Snapshotable, state: Snapshotable);
  undo(): void; redo(): void;
  canUndo(): boolean; canRedo(): boolean;
  subscribe(fn): () => void; // toolbar buttons enable/disable off this
}
```

- A **snapshot** is `{ registry.snapshot(), state.snapshot() }` (both full
  serialized forms). `undo`/`redo` `restore()` both.
- Recording is **coalesced to one entry per microtask**: a single user action
  commits one change event → one undo step, while a synchronous burst across both
  stores (e.g. Reset) collapses into one. A `restoring` guard stops restores from
  recording new entries.
- Wired to the toolbar's **Undo / Redo** buttons and **Cmd/Ctrl+Z** (Shift or
  Ctrl+Y to redo); keyboard is ignored while typing in a field (§7).

---

## 4. Drag & drop wiring

Native HTML5 DnD. `dataTransfer` payloads aren't readable during `dragover`, so the
dragged id is stashed in a module variable and read back on drop. (Reference:
[`src/dnd.ts`](./src/dnd.ts).)

- **Sources** — palette chips, placed controls (including spacers + backgrounds),
  and collapsed chips are all `makeDraggable`. `endDrag()` force-clears a drag whose
  source was rebuilt away by a re-render.
- **Targets on the canvas** — marked with `data-drop`: `"lane"` (insert into this
  lane at the caret) and `"gap"` (create a new row). Each lane carries
  `data-region` / `data-row` / `data-lane`; each gap carries `data-region` /
  `data-row`. On drop, lane → `state.place`, gap → `state.placeInNewRow`.
- **Expanded drop targets.** While dragging (`body.dnd-active`) every lane grows
  (bigger min-size + a dashed frame) and the hovered target gets a solid accent
  fill, so where an item will land is obvious. A bold drop-caret marks the insert
  point within a lane.
- **Remove** — dragging a placed control back onto the palette removes it
  (`makeRemoveTarget`, ignores fresh palette drags).
- **Collapse** — dragging an icon into the Setting bin collapses it
  (`makeCollapseTarget`; accepts bar + palette drags; rejects non-icons).

> **Drop → settle → re-render.** The drop handler clears `dnd-active` **before**
> committing the placement, because backgrounds snap to their lane's box and lanes
> are temporarily inflated during a drag — a dropped background must measure the
> settled lane, not the inflated one (§6g).

---

## 5. Serializer — internal model → output JSON

Emits each viewport's lanes directly, its collapse list as `collapseInSetting`, the
shared `theme`, and an optional `controls` block. (Reference:
[`src/modes/region/spec.ts`](./src/modes/region/spec.ts); the typed contract is
[`src/modes/region/schema.ts`](./src/modes/region/schema.ts).)

### Per-row rule

Walk lanes `start → center → end`; skip empty ones. Each non-empty lane becomes
`{ items }` in order. A `fill` control (a slider — only `VideoProgress`) stays at
its position in `items` and is repeated in the lane's optional `fill` list.
Spacers and backgrounds stay **inline in `items`** too — the player renders them
specially (a blank gap / a backdrop layer), but their position in the sequence is
the layout information.

```ts
function serializeRow(row: Row): SerializedRow {
  const out = {};
  for (const lane of ["start", "center", "end"] as const) {
    if (!row[lane].length) continue;
    const items = [...row[lane]];
    const fill = items.filter(isFill); // registry.kindOf(id) === "slider"
    out[lane] = { items, ...(fill.length ? { fill } : {}) };
  }
  return out;
}
```

### The `controls` block (identity) + per-viewport `styles` (appearance)

`controls` is a **deduped identity table** — one entry per used id, no matter how
many viewports place it. **Every** used id gets an entry: customs
(icon/text/spacer/background) carry a full definition, and every other control —
including stock built-ins the user never edited — carries at least its Material
`icon` name. It holds **no** per-icon size/background (those are per-viewport), and
is omitted only when the document places nothing at all.

> **Why stock built-ins are emitted.** A `gridIdentifier` is a **behavior**
> contract key and does not encode a glyph. `CaptionSearch` → `manage_search`,
> `Chapters` → `playlist_play`, `PictureInPicture` → `picture_in_picture_alt`:
> none derive, and only `airplay` / `cast` / `fullscreen` / `speed` survive naive
> lowercasing. Omitting the name would push a private copy of `BUILTINS`
> ([`src/controls.ts`](./src/controls.ts)) onto web, Android, and iOS — three
> copies to keep in sync, and a stale one renders a glyph the designer never
> picked, silently. `registry.iconOf(id)` already returns the **effective** glyph
> (override ?? catalog default), so emitting it unconditionally costs one dropped
> `continue` and ~40 bytes per control.

```ts
function buildControlDecls(used: Set<ControlId>): Record<string, unknown> {
  const out = {};
  for (const id of used) {
    // NOTE: no `isOverridden` early-continue — a stock built-in is declared too,
    // so the document never leaves a glyph implied.
    const custom = registry.isCustom(id);
    const def = registry.get(id);
    out[id] = custom
      ? {
          custom: true,
          kind: def?.kind ?? "icon",
          label: def?.label ?? id,
          icon: registry.iconOf(id),
          ...(def?.textType ? { textType: def.textType } : {}),          // text extras (§6f)
          ...(def?.separator !== undefined ? { separator: def.separator } : {}),
          ...(def?.variable !== undefined ? { variable: def.variable } : {}),
          ...(def?.showNumber !== undefined ? { showNumber: def.showNumber } : {}),
          ...(def?.kind === "spacer" && def?.width !== undefined ? { width: def.width } : {}), // % of player width
          ...(def?.kind === "background" && def?.paddingX !== undefined ? { paddingX: def.paddingX } : {}),
          ...(def?.kind === "background" && def?.paddingY !== undefined ? { paddingY: def.paddingY } : {}),
          ...(def?.kind === "background" && def?.radius !== undefined ? { radius: def.radius } : {}),
        }
      : { icon: registry.iconOf(id) }; // built-in → its effective glyph (override ?? default)
  }
  return out;
}

// Per-VIEWPORT icon appearance: for each icon PLACED in this viewport with a
// non-default size or a background, emit { size?, background? }. Omitted when empty.
function buildViewportStyles(state: RegionState, vp: Viewport): Record<string, unknown> {
  const used = usedIdsIn(state, vp); // ids in vp's rows + collapse list
  const styles = state.stylesOf(vp);
  const out = {};
  for (const id of used) {
    const s = styles[id];
    if (!s || (s.size === undefined && !s.iconBg)) continue;
    out[id] = { ...(s.size !== undefined ? { size: s.size } : {}), ...(s.iconBg ? { background: s.iconBg } : {}) };
  }
  return out;
}
```

- **Background color/opacity are never per-control** — the shared
  `theme.backgroundColor` / `backgroundOpacity` fill lane **and** per-icon backgrounds.
- A **lane background** decl carries only `paddingX` / `paddingY` / `radius` (px); a
  **spacer** carries `width` (**% of the player container's width**); both are unique
  `CUSTOM_*` ids, so per-instance. A **per-icon size/background** rides in each
  viewport's `styles`, not the decl.
- A stock built-in and an author-overridden one serialize **identically**
  (`{ "icon": <name> }`) — by design. `isOverridden` is a studio-side concept (it
  drives the palette's ↺ reset affordance, §6d); the player only needs the glyph.
- `buildViewportStyles` may also emit an **`icon`** per viewport — the wire format
  reserves it as a per-viewport glyph override that wins over the `controls` decl.
  The studio doesn't write it (icon edits are global, §2b). The slot is documented
  now so renderers implement the `??` in their current release: a shipped mobile
  SDK lives on devices for months, so the reader has to be in the field before the
  studio can start authoring it.

### Whole-document build

```ts
function buildRegionSpec(state: RegionState) {
  const theme = state.getTheme();
  const viewports = {};
  for (const vp of ["default", "490", "300", "vertical"] as const) {
    const regions = {};
    for (const region of ["top", "center", "bottom"] as const)
      regions[region] = state.rowsOf(vp, region).map(serializeRow);
    const styles = buildViewportStyles(state, vp); // §7e in the player doc
    viewports[vp] = {
      regions,
      collapseInSetting: state.collapsedOf(vp),
      ...(Object.keys(styles).length ? { styles } : {}),
    };
  }
  const controls = buildControlDecls(collectUsedIds(state));
  return {
    layoutModel: "region", // names the layout MODEL, not a version
    theme: {
      primary: theme.primary,
      secondary: theme.secondary,
      iconSize: DEFAULT_ICON_SIZE, // 20 — the SAME constant the canvas renders at
      gap: 8,
      backgroundColor: theme.bgColor, // shared across all backgrounds
      backgroundOpacity: theme.bgOpacity,
      paddingX: theme.playerPadX, // container padding, % of its WIDTH
      paddingY: theme.playerPadY, // ...and % of its HEIGHT
    },
    ...(Object.keys(controls).length ? { controls } : {}), // only empty if nothing is placed
    viewports,
  };
}
```

Re-serialized and shown live in the code panel (and `console.log`) on every change;
later a `PUT` to the layout API. This is exactly the shape in
[`PLAYER_IMPLEMENTATION.md` §2](./PLAYER_IMPLEMENTATION.md#2-json-shape-what-the-player-receives).

---

## 6. UI — canvas, popovers, palette, toolbar

### 6a. Canvas (the player mock)

Render the **active viewport's** regions against a realistic preview. (Reference:
[`src/modes/region/editor.ts`](./src/modes/region/editor.ts).)

Per render: apply the theme CSS vars — `--primary`, `--secondary`, the player box
`--player-w` / `--player-h`, and the container padding `--pad-x` / `--pad-y`; for
each region emit a `gap`, each row (3 lanes), and a trailing `gap`; an empty region
shows a "Drop here" placeholder that is itself a `gap` target. Each placed control
renders **by `kind`**:

> **The two percentage vars resolve against the player box.** `--pad-x` / `--pad-y`
> are **unitless percentages**, not lengths; the stylesheet turns them into padding
> with `calc(var(--player-h) * var(--pad-y) / 100) calc(var(--player-w) * var(--pad-x) / 100)`,
> and a spacer's width is `calc(var(--player-w) * <width> / 100)`. Plain CSS `%`
> padding would resolve **both** axes against the width, which is why the Y axis
> goes through `--player-h` explicitly. Switching viewports rewrites `--player-w` /
> `--player-h`, so every padding and spacer rescales with no layout edit.

| kind         | rendered as                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| `icon`       | `renderIcon(registry.iconOf(id), state.sizeOf(id))` + optional per-icon background (both per-viewport) |
| `text`       | the resolved `def.text` string (`00:00`, chapter title, …)                  |
| `slider`     | a decorative `<input range>` that flex-fills                                |
| `spacer`     | a blank stretch-height block, `width`% of the player width (§6g)            |
| `background` | an absolutely-positioned backdrop layer, rendered specially (§6g)           |

plus a `×` remove button. The canvas re-renders on **registry** changes too (not
just layout), so an icon swap / resize / background edit updates an already-placed
control immediately. Between the three lanes there is **no column gap** (a filled
`VideoProgress` butts up to its neighbours); items within a lane are spaced by
`theme.gap`.

**Volume hover-slider preview.** A placed `Volume` chip previews the player's
on-demand slider ([`PLAYER_IMPLEMENTATION.md` §7a](./PLAYER_IMPLEMENTATION.md#7a-volume--the-hover-slider);
`appendVolumeFlyout` in [`src/ui/controlbody.ts`](./src/ui/controlbody.ts)):
hovering slides out an **inline** range as a flex child (side + width measured per
hover; it pushes neighbours and shrinks a fill slider rather than overlapping).
It's the one interactive slider on the canvas; holding its thumb suspends the
chip's HTML5 drag, and it's hidden entirely during DnD.

### 6b. Property popovers (click a placed control)

Clicking a placed control (not its remove ×, not a resize handle, not after a drag)
opens a small anchored **popover** ([`src/ui/popover.ts`](./src/ui/popover.ts)) with
live preview (direct DOM writes) and commit-on-release (one undo step per gesture):

- **Icon** → **Size** slider (12–48) **and** a **Background** toggle (Padding +
  Radius for a circle/badge behind that one icon, §6g). These write to the **active
  viewport's** `styles` (`state.setSize` / `state.setIconBg`), so the same icon can
  look different per viewport. Radius renders as `min(radius, 50%)` on a square box,
  so a high value is a perfect circle.
- **Spacer** → a **Width** slider, in **% of the player width** (1–90, 0.5 steps);
  a right-edge resize handle works too. The handle drags in px (that's what the
  pointer measures) and converts back to a percentage on release.
- **Background** (lane) → **Padding X** / **Padding Y** / **Radius** sliders (px).
  Color and opacity are _not_ here — they're the shared toolbar tool (§7).

> Slider rows take `{ min, max, value, unit, step }`: `step` is 1 for the px
> sliders and 0.5 for the percentage ones — a whole percent of the player is a
> ~6px jump at the default width, too coarse to land on.

### 6c. Viewport switcher

A segmented control above the player (`Default · ≤490 · ≤300 · 9:16`). Switching
swaps the active design **and resizes the preview**: `VIEWPORT_PX = { default: 640,
"490": 490, "300": 300, vertical: 320 }` sets the width; landscape viewports render
16:9 (`height = w·9/16`), while **`vertical` renders portrait 9:16**
(`height = w·16/9`, taller than wide). **Each viewport keeps its own independent
layout + collapse set** — a control dropped in one viewport is not added to the
others, and switching shows only that viewport's placed controls.
`resetToDefault()` seeds only `default`; the other three (`490` / `300` / `vertical`)
start blank (author from scratch, or leave blank to inherit on the player — see
[`PLAYER_IMPLEMENTATION.md` §3](./PLAYER_IMPLEMENTATION.md#3-viewports--choosing-which-layout-to-render)).

### 6d. Custom controls & icon overrides (palette)

The palette iterates **`registry.list()`** (built-ins ++ custom), rebuilding on
every change. Affordances:

- **"+ Add custom control"** — `pickIcon` (§6e) + a name → `registry.addCustom`.
- Per-chip inline actions: **change icon** (built-in → override; custom → edit),
  **reset** an override (↺), **delete** a custom (× — pairs `purge` + `removeCustom`).
- The **Setting** chip is disabled (`managesSetting`); it's auto-driven by
  `reconcileSetting` (§3a). Spacer/background chips skip the change-icon action
  (their glyph is cosmetic).

### 6e. Icon picker (`pickIcon`)

A modal over the full Material catalog (~2,100 glyphs;
[`src/ui/iconpicker.ts`](./src/ui/iconpicker.ts)); `pickIcon(opts?): Promise<string | null>`
resolves the chosen Material **name**. Used by "Add custom control" and "Change
icon". Search normalizes both sides (lowercase, non-alphanumerics stripped), so
"full screen", "fullscreen" and "full_screen" all find `fullscreen`.

### 6f. Text controls ("+ Add text")

Opens the **text picker** ([`src/ui/textpicker.ts`](./src/ui/textpicker.ts)) and, on
pick, calls `registry.addText(descriptor)` (a `kind: "text"` control):

| flavour          | id form      | preview         | extra input                              |
| ---------------- | ------------ | --------------- | ---------------------------------------- |
| Time Left        | `CUSTOM_*`   | `00:00`         | —                                        |
| Time Consumed    | `CUSTOM_*`   | `00:00`         | —                                        |
| Time Duration    | `CUSTOM_*`   | `00:00`         | —                                        |
| Time All         | `CUSTOM_*`   | `00:00 / 00:00` | **separator** (default `" / "`)          |
| Current Chapter  | `CUSTOM_*`   | `Chapter Name`  | **switch** — append the `02/14` number   |
| Dynamic Text     | `cdt_<name>` | `cdt_<name>`    | **variable** name (auto-prefixed `cdt_`) |
| Title            | `CUSTOM_*`   | `Video Title`   | —                                        |

Text chips render an **icon** in the palette but a **text** string on the canvas, so
they never collapse into Setting (icon-only). Dynamic Text is keyed by its
`cdt_`-prefixed variable (both id and SDK handle). Each is serialized with its
`textType` + extras (§5), rendered player-side by `textType`
([`PLAYER_IMPLEMENTATION.md` §7c](./PLAYER_IMPLEMENTATION.md#7c-text-controls)).

### 6g. Spacers & backgrounds

Two one-click creator buttons — **"+ Add spacer"** and **"+ Add background"**. Both
mint a `CUSTOM_*` control and appear as normal draggable chips.

- **Spacer** (`addSpacer`, `kind: "spacer"`) — a blank block that stretches to the
  lane/row height and adds horizontal space. Its `width` is a **percentage of the
  player container's width** (default `4`), so the gap keeps its proportion when
  you switch viewports — and on the real player at any size. Resize it by dragging
  its right edge, or click it for a **Width** slider (§6b). Serializes as
  `{ custom, kind: "spacer", label, icon, width }`.
- **Background** (`addBackground`, `kind: "background"`) — a translucent color layer
  behind a lane's controls. Dropped into a lane's items array like any control, it
  renders as an absolutely-positioned layer that:
  - **snaps horizontally** to that lane's controls (their box + `paddingX`), so it
    hugs exactly the icons in the lane (and re-snaps wider as controls are added);
  - **fills the full row height** vertically (+ `paddingY`);
  - sits **behind** the lane's items (lanes carry a higher z-index);
  - is colored from the shared `theme.backgroundColor` / `backgroundOpacity` and
    rounded by its own `radius`.

  Click it for **Padding X / Padding Y / Radius** (§6b). Serializes as
  `{ custom, kind: "background", label, icon, paddingX?, paddingY?, radius? }`
  (padding/radius only when non-default; **no** per-control color/width).

- **Per-icon background** (`state.setIconBg`, **per active viewport**) is the _other_
  way to get a backdrop: a circle/badge drawn directly behind **one icon**, hugging
  just that glyph regardless of lane spacers or row height. Toggle it in the icon
  popover (§6b); it serializes into that viewport's `styles[id].background`. Use a
  **lane background** for a wide segment backdrop; a **per-icon background** for a
  circle behind a single button (e.g. the transport Play/Backward/Forward circles).

---

## 7. Toolbar (theme, background, padding, undo/redo, reset)

Rendered by [`src/ui/toolbar.ts`](./src/ui/toolbar.ts):

- **Undo / Redo** — `history.undo()` / `redo()`, enabled off `canUndo/canRedo`
  (§3b); also Cmd/Ctrl+Z and Shift/Ctrl+Y.
- **Primary / Secondary** color pickers → `state.setTheme({ primary | secondary })`.
- **Background** — a shared color swatch + opacity slider →
  `state.setTheme({ bgColor, bgOpacity })`. Drives **every** background (lane +
  per-icon) at once; previews live, commits on release (one undo step).
- **Padding** — opens a popover with **Padding X / Padding Y** sliders for the
  `.Player` container → `state.setTheme({ playerPadX | playerPadY })`. Both are
  **percentages** (0–10%, 0.5 steps): X of the player's width, Y of its height.
  Preview writes `--pad-x` / `--pad-y` live and re-snaps the lane backgrounds
  (padding shifts the lanes); commit stores it (one undo step).
- **Reset** → `state.resetToDefault()` — restores the full canonical default
  (registry seed + default viewport + default theme, incl. the transport circles).
- **Clear all** → `state.clear()` (empties the **active** viewport only).

---

## 8. Build order / checklist

- [ ] `RegionState` with per-viewport `Layouts` + active pointer + the API in §3
      (single-occurrence, prune-empty, persist under version-suffixed keys). Theme carries
      background color/opacity + player padding (**percentages** of the container).
      `snapshot`/`restore` for undo (§3b).
- [ ] `reconcileSetting()` on every change (§3a).
- [ ] `ControlRegistry`: 17 built-ins + custom (icon/text/spacer/background) +
      overrides (identity/glyph only — **no** per-icon size/background), persisted to
      the version-suffixed registry key; `snapshot`/`restore`; `seedDefaults()` seeds the
      default's custom controls on fresh install + reset (§2b). Glyphs are Material
      names throughout.
- [ ] Per-viewport icon **`styles`** (size + background) in each `ViewportLayout`
      (§2), with `sizeOf`/`setSize`/`iconBgOf`/`setIconBg`/`clearIconBg` on the active
      viewport (§3); the default viewport seeds the transport look.
- [ ] `History` combining registry + state snapshots, microtask-coalesced; wire
      Undo/Redo buttons + Cmd/Ctrl+Z (§3b).
- [ ] Palette iterates `registry.list()`; "+ Add custom / text / spacer /
      background"; per-chip change-icon / reset / delete; disable `Setting` (§6d–g).
- [ ] Canvas: regions → gaps + rows → 3 lanes with `data-drop`; render by kind
      (icon+size+iconBg / text / slider / spacer / lane-background); no inter-lane
      gap; publish `--player-w` / `--player-h` so the % padding and spacer widths
      resolve; re-render on registry changes (§6a).
- [ ] Property popovers: icon (size + background, px), spacer (width, **%**),
      background (padding X/Y + radius, px) — live preview + commit-on-release (§6b).
- [ ] Expanded drop targets while dragging; clear `dnd-active` before the drop
      re-render so backgrounds snap to the settled lane (§4, §6g).
- [ ] Toolbar: shared Background color/opacity, Padding tool, Undo/Redo (§7).
- [ ] Viewport switcher + resize (§6c). Collapse bin (§3a).
- [ ] `serializeRow` + `buildControlDecls` (identity) + `buildViewportStyles`
      (per-viewport `size`/`background`) + `buildRegionSpec` (**no version field** —
      `layoutModel: "region"` only);
      theme with background* + padding*; decls carry spacer `width` / background
      `paddingX/paddingY/radius`; each viewport carries its own `styles`; `controls`
      omitted only when nothing is placed (§5).
- [ ] **Declare every used id in `controls`, each with its `icon`** — stock
      built-ins included, not just customs and overrides. Assert it: for the
      default document, every id in any viewport's `regions` / `collapseInSetting`
      resolves to a `controls[id].icon` (22 entries — 8 custom + 14 built-in) (§5).
- [ ] `state.subscribe` → code panel / `console.log` (swap for API later).
- [ ] Verify the default output round-trips through the player
      ([`PLAYER_IMPLEMENTATION.md` §9c](./PLAYER_IMPLEMENTATION.md#9c-full-document-the-canonical-fixture)).
