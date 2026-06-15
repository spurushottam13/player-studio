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

> **Schema:** the dashboard emits **`schemaVersion` 2.0** — per-**viewport**
> layouts (`default | 490 | 300 | 200`), each with its own `collapseInSetting`
> list, under one shared `theme`.

---

## 1. What we're building

```
┌──────────────────────┐  drag  ┌──────────────────────────────┐  serialize ┌─────────────┐
│  Control palette      │ ─────► │  Player canvas (one viewport) │ ─────────► │ console.log │
│  (21 chips)           │  drop  │  regions → rows → lanes        │  on change  │ / code panel│
│  + "Collapse in       │ ◄───── │  (top / center / bottom)       │             │  (the JSON) │
│     Setting" bin (L)  │drag-back└──────────────────────────────┘             └─────────────┘
└──────────────────────┘            ▲  Viewport switcher: Default · ≤490 · ≤300 · ≤200
```

Pieces:

1. **Palette (left)** — the 21 draggable control chips (drag source + remove
   target), **plus** a "Collapse in Setting" bin below them.
2. **Canvas (center)** — a player mock split into three regions; drop zones build
   the layout. A **viewport switcher** above it swaps which viewport you're
   editing and resizes the preview.
3. **State + serializer** — a per-viewport in-memory model that drops/collapses
   mutate, serialized to the Regional Layout JSON on every change.

---

## 2. The authoring model (state ≠ output)

The dashboard keeps an **edit-friendly** internal model and *derives* the output
JSON from it. Don't author directly against the wire format — lanes are far
easier to drag into than the `groups`/`align` output shape.

### Internal model

```ts
type Lane = "start" | "center" | "end";              // the three alignment lanes
type RegionName = "top" | "center" | "bottom";
type Viewport = "default" | "490" | "300" | "200";   // max-width breakpoints

interface Row {
  start:  GridIdentifier[];   // ordered L→R
  center: GridIdentifier[];
  end:    GridIdentifier[];
}
type Regions = Record<RegionName, Row[]>;             // each region = stacked rows

// One viewport's design: the placed regions PLUS the icons folded into Setting.
interface ViewportLayout {
  regions: Regions;
  collapse: GridIdentifier[];   // serialized as `collapseInSetting`
}
type Layouts = Record<Viewport, ViewportLayout>;

interface Theme { primary: string; secondary: string; }  // shared across viewports
```

- The store holds **four independent viewport layouts** + one **active viewport**
  pointer. All mutating ops act on the active viewport only.
- A region is an **ordered list of rows**; each row has **three lanes**
  (`start` / `center` / `end`), each an ordered list of `gridIdentifier`s.
- A control appears **at most once** within a viewport, across its regions **and**
  its collapse list.
- Empty rows are **pruned** automatically after every edit.
- `theme` is global (one set of tokens for all viewports).

> Why lanes instead of groups? A lane is a fixed, always-present drop target, so
> the user can drop into "the right edge of row 2" directly. The serializer
> collapses lanes back into the `align`/`groups` output (§5).

### A control's identity: `gridIdentifier`

Every chip and placed item is keyed by its `gridIdentifier` — the stable
cross-platform id (`PlayNPause`, `VideoProgress`, …). The full 21-id catalog and
each id's render `kind` (`icon` / `text` / `slider`) live in
[`src/controls.ts`](./src/controls.ts) and are listed in
[`PLAYER_IMPLEMENTATION.md` §7](./PLAYER_IMPLEMENTATION.md#7-controls-grididentifier).
The dashboard uses `kind` only to render the chip/preview and to decide what may
collapse — it never writes `kind` into the output JSON.

---

## 3. State API

A store the canvas + palette drive and the serializer reads. (POC reference:
[`src/modes/region/state.ts`](./src/modes/region/state.ts).)

```ts
interface ItemPath { region: RegionName; row: number; lane: Lane; index: number; }

class RegionState {
  // ---- viewports -----------------------------------------------------------
  getViewports(): readonly Viewport[];
  getViewport(): Viewport;              // active
  setViewport(v: Viewport): void;       // switch which viewport is being edited

  // ---- active-viewport regions --------------------------------------------
  rows(region: RegionName): Row[];      // of the ACTIVE viewport
  find(id: GridIdentifier): ItemPath | null;
  has(id: GridIdentifier): boolean;     // on the bar OR collapsed in this viewport
  place(id: GridIdentifier, target: ItemPath): void;       // into an existing lane
  placeInNewRow(id, region, atRow, lane?): void;           // into a new row
  remove(id: GridIdentifier): void;

  // ---- collapse-in-Setting (active viewport) ------------------------------
  getCollapsed(): GridIdentifier[];
  isCollapsed(id: GridIdentifier): boolean;
  collapse(id: GridIdentifier): void;   // bar → Setting menu
  uncollapse(id: GridIdentifier): void; // out of Setting (does NOT re-place on bar)

  // ---- non-mutating reads of ANY viewport, for serialization --------------
  rowsOf(vp: Viewport, region: RegionName): Row[];
  collapsedOf(vp: Viewport): GridIdentifier[];

  // ---- theme + lifecycle ---------------------------------------------------
  getTheme(): Theme;
  setTheme(partial: Partial<Theme>): void;
  clear(): void;            // empties the ACTIVE viewport
  resetToDefault(): void;   // seeds `default`; narrow viewports blank
  subscribe(fn: () => void): () => void;
}

// Standalone: only icons (and never `Setting` itself) may be collapsed.
function isCollapsible(id: GridIdentifier): boolean;  // kind === "icon" && id !== "Setting"
```

Invariants baked into the store:

- **Single occurrence per viewport:** `place` / `placeInNewRow` / `collapse` first
  drop the id from wherever it was (bar lane *or* collapse list).
- **Prune empty rows** and notify subscribers after every mutation.
- **Setting is auto-managed** — see §3a.
- **Persist** to `localStorage` (POC key `player-studio:region-layout`) as
  `{ layouts, theme, active }`; sanitize + migrate the legacy flat `{ regions }`
  shape into the `default` viewport on load.

### 3a. `reconcileSetting()` — the Setting-icon rule

Runs on **every** change, on the active viewport:

```ts
// Setting is mandatory iff this viewport has ≥1 collapsed icon.
const wantSetting = layout.collapse.length > 0;
if (wantSetting && !find("Setting"))  addSettingToLastBottomRow();   // show it
if (!wantSetting && find("Setting"))  removeSetting();               // hide it
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
let draggingId: GridIdentifier | null = null;
const MIME = "application/x-player-control";

function makeDraggable(el: HTMLElement, id: GridIdentifier, dragImage?: HTMLElement) {
  el.setAttribute("draggable", "true");
  el.addEventListener("dragstart", (e) => {
    draggingId = id;
    e.dataTransfer?.setData(MIME, id);
    e.dataTransfer!.effectAllowed = "copyMove";
    if (dragImage) e.dataTransfer!.setDragImage(dragImage, 18, 18);
    document.body.classList.add("dnd-active");
  });
  el.addEventListener("dragend", () => { draggingId = null; /* clear highlight */ });
}

// Force-end a drag whose source element was rebuilt away by a re-render, so its
// own `dragend` never fires (used after collapse/lane commits).
function endDrag() { draggingId = null; document.body.classList.remove("dnd-active"); }
```

Palette chips, placed controls, **and** collapsed chips in the Setting bin are all
draggable.

### 4b. Drop targets on the canvas

Two target types, marked with `data-drop`:

| `data-drop` | element         | meaning                                     |
| ----------- | --------------- | ------------------------------------------- |
| `"lane"`    | a lane in a row | insert into this lane at the caret position |
| `"gap"`     | gap between rows| create a **new row** at this position       |

Each lane carries `data-region`, `data-row`, `data-lane`; each gap carries
`data-region`, `data-row`. On drop, lane → `state.place(...)`, gap →
`state.placeInNewRow(...)`. (Unchanged from the original lane/caret logic.)

### 4c. Remove (drag back to palette)

```ts
function makeRemoveTarget(panel: HTMLElement, state: RemoveTarget) {
  panel.addEventListener("dragover", (e) => { if (draggingId) e.preventDefault(); });
  panel.addEventListener("drop", (e) => {
    const id = (e.dataTransfer?.getData(MIME) || draggingId) as GridIdentifier | null;
    draggingId = null;
    if (id && state.has(id)) { e.preventDefault(); state.remove(id); }  // ignore fresh palette drags
  });
}
```

### 4d. Collapse (drag into the Setting bin)

```ts
interface CollapseTarget {
  canCollapse(id: GridIdentifier): boolean;
  collapse(id: GridIdentifier): void;
}

function makeCollapseTarget(bin: HTMLElement, target: CollapseTarget) {
  bin.addEventListener("dragover", (e) => {
    if (!draggingId || !target.canCollapse(draggingId)) return;
    e.preventDefault();
    bin.classList.add("collapse--over");
  });
  bin.addEventListener("dragleave", () => bin.classList.remove("collapse--over"));
  bin.addEventListener("drop", (e) => {
    bin.classList.remove("collapse--over");
    const id = (e.dataTransfer?.getData(MIME) || draggingId) as GridIdentifier | null;
    draggingId = null;
    if (id && target.canCollapse(id)) { e.preventDefault(); target.collapse(id); }
  });
}
```

`canCollapse(id) = isCollapsible(id) && !isCollapsed(id)`. Accepts drags from the
bar **and** straight from the palette.

---

## 5. Serializer — internal model → output JSON

The serializer turns each viewport's lanes back into `align` + `groups`, and
emits its collapse list as `collapseInSetting`. (POC reference:
[`src/modes/region/spec.ts`](./src/modes/region/spec.ts).)

### Per-row rule

Walk lanes `start → center → end`. A contiguous run of non-`fill` controls becomes
one group with that lane's `align`. A `fill` control (a slider — `VideoProgress` /
`Volume`) breaks the run into its own `align: "fill"` group. A single-group row
collapses to the shorthand form.

```ts
interface Group { align: Lane | "fill"; items: GridIdentifier[]; }

function serializeRow(row: Row): Group | { groups: Group[] } {
  const groups: Group[] = [];
  for (const lane of ["start", "center", "end"] as const) {
    let run: GridIdentifier[] = [];
    const flush = () => { if (run.length) groups.push({ align: lane, items: run }); run = []; };
    for (const id of row[lane]) {
      if (isFill(id)) { flush(); groups.push({ align: "fill", items: [id] }); }
      else run.push(id);
    }
    flush();
  }
  return groups.length === 1 ? groups[0] : { groups };   // shorthand when single group
}
```

`isFill(id)` = the control's `kind === "slider"`.

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
  return {
    schemaVersion: "2.0",
    layoutModel: "region",
    theme: { primary: theme.primary, secondary: theme.secondary, iconSize: 22, barHeight: 40, gap: 8 },
    viewports,
  };
}
```

### Emit on every change (current target: `console.log` / code panel)

```ts
state.subscribe(() => {
  const json = JSON.stringify(buildRegionSpec(state), null, 2);
  console.log(json);          // ← for now (the POC also shows it live in a code panel)
  // later: PUT /api/player-layout/{id}  with this body
});
```

This produces exactly the shape documented in
[`PLAYER_IMPLEMENTATION.md` §2](./PLAYER_IMPLEMENTATION.md#2-json-shape-what-the-player-receives).

---

## 6. UI — viewport switcher + Collapse-in-Setting bin

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
(icon glyph / `00:00` text / `<input range>`) plus a `×` remove button.

### 6b. Viewport switcher

A segmented control above the player. Switching swaps the active design **and
resizes the preview** so the responsive bar is visible:

```ts
const VIEWPORT_PX = { default: 640, "490": 490, "300": 300, "200": 200 };

for (const vp of state.getViewports()) {
  const btn = segButton(label(vp));           // "Default" · "≤490" · "≤300" · "≤200"
  btn.onclick = () => state.setViewport(vp);
}

// in render():
const w = VIEWPORT_PX[state.getViewport()];
player.style.width  = `${w}px`;
player.style.height = `${Math.round(w * 9 / 16)}px`;   // keep 16:9
highlightActive(state.getViewport());
```

Each viewport keeps its own layout + collapse set, so the bar you see changes as
you switch. `resetToDefault()` seeds only `default`; the narrow ones start blank
(author from scratch, or leave blank to inherit on the player — see
[`PLAYER_IMPLEMENTATION.md` §3](./PLAYER_IMPLEMENTATION.md#3-viewports--choosing-which-layout-to-render)).

### 6c. Collapse-in-Setting bin (left palette)

Below the 21 chips, the **left palette** hosts the collapse bin (POC reference:
[`src/ui/palette.ts`](./src/ui/palette.ts)):

```ts
const bin = el("div", { class: "collapse-bin" }, [collapseItems]);
makeCollapseTarget(bin, {
  canCollapse: (id) => active.canCollapse?.(id) ?? false,    // isCollapsible && !isCollapsed
  collapse:    (id) => { active.collapse?.(id); endDrag(); },
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

---

## 7. Toolbar (theme + reset)

- **Primary / Secondary** color pickers → `state.setTheme({ primary | secondary })`
  (global — affects all viewports).
- **Reset** → `state.resetToDefault()` (seeds the canonical `default` viewport).
- **Clear** → `state.clear()` (empties the **active** viewport only).

---

## 8. Build order / checklist

- [ ] `RegionState` with per-viewport `Layouts` + active pointer + the API in §3
      (single-occurrence, prune-empty, persist + legacy migration).
- [ ] `reconcileSetting()` on every change — derive the `Setting` icon from the
      collapse list (§3a).
- [ ] Palette: 21 chips, each `makeDraggable`; disable the `Setting` chip.
- [ ] Canvas: regions → gaps + rows → 3 lanes with `data-drop`; lane/gap drops.
- [ ] Viewport switcher: `setViewport` + resize the preview (§6b).
- [ ] Collapse bin in the left palette: `makeCollapseTarget` + collapsed chips +
      `stopPropagation` vs the remove target (§6c).
- [ ] `serializeRow` + `buildRegionSpec` over all four viewports → `schemaVersion`
      2.0 (§5).
- [ ] `state.subscribe` → `console.log(JSON)` / code panel (swap for API later).
- [ ] Verify output validates against `player.schema.json` and round-trips through
      the player ([`PLAYER_IMPLEMENTATION.md` §9c](./PLAYER_IMPLEMENTATION.md#9c-full-document-the-canonical-fixture)).
```
