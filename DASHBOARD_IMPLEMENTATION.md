# Dashboard Implementation — Regional Layout Authoring (Drag & Drop)

How the **dashboard** lets a user drag controls onto a player mock and emit the
Regional Layout JSON. For now the output target is `console.log`; later it posts
to the layout API. The consumer side (player) is in
[`PLAYER_IMPLEMENTATION.md`](./PLAYER_IMPLEMENTATION.md); the contract is
[`spec.md`](./spec.md).

This doc generalizes the working POC in [`src/modes/region/`](./src/modes/region/)
(editor, state, spec) and [`src/dnd.ts`](./src/dnd.ts).

---

## 1. What we're building

```
┌───────────────┐   drag   ┌──────────────────────────────┐   serialize   ┌─────────────┐
│  Control      │ ───────► │  Player canvas                │ ────────────► │ console.log │
│  palette      │  drop    │  regions → rows → lanes        │   on change    │  (the JSON) │
│  (21 chips)   │ ◄─────── │  (top / center / bottom)       │                │             │
└───────────────┘ drag-back└──────────────────────────────┘                └─────────────┘
```

Three pieces:

1. **Palette** — the 21 draggable control chips (drag source + remove target).
2. **Canvas** — a player mock split into the three regions; drop zones build the
   layout.
3. **State + serializer** — an in-memory model that drops mutate, serialized to
   the Regional Layout JSON on every change.

---

## 2. The authoring model (state ≠ output)

The dashboard keeps an **edit-friendly** internal model and *derives* the
output JSON from it. Don't author directly against the wire format — lanes are
far easier to drag into than the `groups`/`align` output shape.

### Internal model

```ts
type Lane = "start" | "center" | "end";          // the three alignment lanes
type RegionName = "top" | "center" | "bottom";

interface Row {
  start:  GridIdentifier[];   // ordered L→R
  center: GridIdentifier[];
  end:    GridIdentifier[];
}
type Regions = Record<RegionName, Row[]>;          // each region = stacked rows

interface Theme { primary: string; secondary: string; }
```

- A region is an **ordered list of rows**.
- Each row has **three lanes** (`start` / `center` / `end`); each lane is an
  ordered list of `gridIdentifier`s.
- A control appears **at most once** across the whole layout.
- Empty rows are **pruned** automatically after every edit.

> Why lanes instead of groups? A lane is a fixed, always-present drop target, so
> the user can drop into "the right edge of row 2" directly. The serializer
> collapses lanes back into the `align`/`groups` output (§5).

### A control's identity: `gridIdentifier`

Every chip and every placed item is keyed by its `gridIdentifier` — the stable
cross-platform id (`PlayNPause`, `VideoProgress`, …). The full 21-id catalog and
each id's render `kind` (`icon` / `text` / `slider`) live in
[`src/controls.ts`](./src/controls.ts) and are listed in
[`PLAYER_IMPLEMENTATION.md` §5](./PLAYER_IMPLEMENTATION.md#5-controls-grididentifier).
The dashboard uses `kind` only to render the chip/preview — it never writes
`kind` into the output JSON (the player knows it from the id).

---

## 3. State API

A small store the canvas drives and the serializer reads. (POC reference:
[`src/modes/region/state.ts`](./src/modes/region/state.ts).)

```ts
interface ItemPath { region: RegionName; row: number; lane: Lane; index: number; }

class RegionState {
  rows(region: RegionName): Row[];
  getTheme(): Theme;

  find(id: GridIdentifier): ItemPath | null;   // where is this control now?
  has(id: GridIdentifier): boolean;

  // Drop into an existing lane at a position (moves it if already placed).
  place(id: GridIdentifier, target: ItemPath): void;

  // Drop into a brand-new row inserted at `atRow` in a region.
  placeInNewRow(id: GridIdentifier, region: RegionName, atRow: number, lane?: Lane): void;

  remove(id: GridIdentifier): void;
  setTheme(partial: Partial<Theme>): void;
  clear(): void;
  resetToDefault(): void;

  subscribe(fn: () => void): () => void;        // fires after every mutation
}
```

Mutation rules baked into `place` / `placeInNewRow`:

- Placing a control that's already somewhere **removes it from its old spot
  first** (single-occurrence invariant), with index adjustment when moving
  within the same lane.
- After any mutation, **prune empty rows** and notify subscribers.
- Persist to `localStorage` (POC key `player-studio:region-layout`) so a refresh
  keeps the work-in-progress; sanitize on load.

---

## 4. Drag & drop wiring

Uses native HTML5 DnD. Key trick: `dataTransfer` payloads are **not readable
during `dragover`**, so the dragged id is stashed in a module variable and read
back on drop. (POC reference: [`src/dnd.ts`](./src/dnd.ts).)

### 4a. Sources — palette chips & placed controls

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
    document.body.classList.add("dnd-active");   // highlight drop zones
  });
  el.addEventListener("dragend", () => { draggingId = null; /* clear highlight */ });
}
```

Both palette chips **and** already-placed controls are draggable — dragging a
placed control moves it; dragging it back to the palette removes it.

### 4b. Drop targets on the canvas

Two target types, marked with `data-drop`:

| `data-drop` | element        | meaning                                            |
| ----------- | -------------- | -------------------------------------------------- |
| `"lane"`    | a lane in a row| insert into this lane at the caret position        |
| `"gap"`     | gap between rows| create a **new row** at this position             |

Each lane carries `data-region`, `data-row`, `data-lane`; each gap carries
`data-region`, `data-row`.

```ts
canvas.addEventListener("dragover", (e) => {
  if (!draggingId) return;
  const dropEl = (e.target as HTMLElement).closest<HTMLElement>("[data-drop]");
  if (!dropEl) return;
  e.preventDefault();                              // allow drop
  e.dataTransfer!.dropEffect = "move";

  if (dropEl.dataset.drop === "lane") {
    const index = laneIndexAt(dropEl, e.clientX);  // caret between items by x-midpoint
    showCaretIn(dropEl, index);
    pending = { kind: "lane", region: dropEl.dataset.region as RegionName,
                row: +dropEl.dataset.row!, lane: dropEl.dataset.lane as Lane, index };
  } else {
    pending = { kind: "gap", region: dropEl.dataset.region as RegionName, row: +dropEl.dataset.row! };
  }
});

canvas.addEventListener("drop", (e) => {
  if (!draggingId || !pending) return;
  e.preventDefault();
  if (pending.kind === "lane") {
    state.place(draggingId, pending);              // existing lane
  } else {
    const lane = pending.region === "center" ? "center" : "start";
    state.placeInNewRow(draggingId, pending.region, pending.row, lane);  // new row
  }
  pending = null;
  draggingId = null;
});
```

`laneIndexAt` finds the insertion index by comparing `clientX` against each
placed item's horizontal midpoint — the caret renders between items.

### 4c. Remove (drag back to palette)

```ts
function makeRemoveTarget(palette: HTMLElement, state: RegionState) {
  palette.addEventListener("dragover", (e) => { if (draggingId) { e.preventDefault(); } });
  palette.addEventListener("drop", (e) => {
    const id = (e.dataTransfer?.getData(MIME) || draggingId) as GridIdentifier | null;
    draggingId = null;
    if (id && state.has(id)) { e.preventDefault(); state.remove(id); }  // ignore fresh palette drags
  });
}
```

Also expose a small `×` button on each placed control for click-to-remove.

---

## 5. Serializer — internal model → output JSON

The serializer turns lanes back into the wire format's `align` + `groups`. (POC
reference: [`src/modes/region/spec.ts`](./src/modes/region/spec.ts).)

### Per-row rule

Walk lanes in order `start → center → end`. Within a lane, a contiguous run of
non-`fill` controls becomes one group with that lane's `align`. A `fill` control
(a slider — `VideoProgress` / `Volume`) breaks the run and becomes its own group
with `align: "fill"`.

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
  // single-group rows collapse to the shorthand form
  return groups.length === 1 ? groups[0] : { groups };
}
```

`isFill(id)` = the control's `kind === "slider"`.

### Whole-layout build

```ts
function buildRegionSpec(state: RegionState) {
  const theme = state.getTheme();
  const regions: Record<string, unknown[]> = {};
  for (const region of ["top", "center", "bottom"] as const) {
    regions[region] = state.rows(region).map(serializeRow);
  }
  return {
    schemaVersion: "1.0",
    layoutModel: "region",
    theme: { primary: theme.primary, secondary: theme.secondary, iconSize: 22, barHeight: 40, gap: 8 },
    regions,
  };
}
```

### Emit on every change (current target: `console.log`)

```ts
state.subscribe(() => {
  const json = JSON.stringify(buildRegionSpec(state), null, 2);
  console.log(json);          // ← for now
  // later: PUT /api/player-layout/{id}  with this body
});
```

This produces exactly the shape documented in
[`PLAYER_IMPLEMENTATION.md` §7](./PLAYER_IMPLEMENTATION.md#7-types-of-regional-layout-samples).

---

## 6. Canvas rendering (the player mock)

Render the regions so the user authors against a realistic preview. (POC
reference: [`src/modes/region/editor.ts`](./src/modes/region/editor.ts).)

```
player
├── region--top
│   ├── row-gap (drop: gap, row 0)
│   ├── player-row → lane--start | lane--center | lane--end   (each drop: lane)
│   ├── row-gap (drop: gap, row 1)
│   └── …
├── region--center
└── region--bottom
```

Per render:

1. Apply theme via CSS custom props: `--primary`, `--secondary`.
2. For each region: emit a `gap` drop zone, then each row (3 lanes), then a `gap`
   after it. Empty region → a single "Drop here" placeholder that is itself a
   `gap` target for row 0.
3. A row containing a `fill` control gets a modifier class so the slider lane
   stretches in the preview.
4. Each placed control renders its body by `kind`:
   - `icon` → the Lucide glyph,
   - `text` → a `00:00` / `00:00 / 00:00` readout,
   - `slider` → an `<input type="range">`,
   plus a `×` remove button.

The palette syncs a `placed` style on chips whose id is currently on the canvas
(`state.has(id)`), so the user sees what's already used.

---

## 7. Toolbar (theme + reset)

Minimal controls wired to state:

- **Primary / Secondary** color pickers → `state.setTheme({ primary | secondary })`.
- **Reset** → `state.resetToDefault()` (loads the canonical default layout).
- **Clear** → `state.clear()` (empties all regions).

These flow into the serialized `theme` block.

---

## 8. Build order / checklist

- [ ] Define `RegionState` with the model in §2 + the API in §3 (single-
      occurrence, prune-empty, persist).
- [ ] Render the palette: 21 chips from the control catalog, each `makeDraggable`.
- [ ] Render the canvas: regions → gaps + rows → 3 lanes, with `data-drop` attrs.
- [ ] Wire `dragover` / `drop` (lane vs gap) + caret positioning (§4b).
- [ ] Wire palette as a remove target + per-control `×` (§4c).
- [ ] Implement `serializeRow` + `buildRegionSpec` (§5).
- [ ] `state.subscribe` → `console.log(JSON)` (swap for API call later).
- [ ] Verify output validates against `player.schema.json` and round-trips
      through the player ([`PLAYER_IMPLEMENTATION.md` §7e](./PLAYER_IMPLEMENTATION.md#7e-full-default-layout-the-canonical-sample)).
