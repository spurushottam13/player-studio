# Player Implementation — Regional Layout

How the **player** consumes the Regional Layout JSON delivered in the metadata
API and renders the control bar from it. This is the consumer side of the
contract defined in [`spec.md`](./spec.md). The authoring side (dashboard) is in
[`DASHBOARD_IMPLEMENTATION.md`](./DASHBOARD_IMPLEMENTATION.md).

> **Scope:** layout + style only. *Behavior* (what `PlayNPause` does) is wired
> natively per platform, keyed by the control's `gridIdentifier`. The JSON never
> carries behavior — see [§5](#5-controls-grididentifier).

---

## 1. Where the layout comes from

The Regional Layout JSON is embedded in the **metadata API** response that the
player already fetches at init, under a `playerLayout` (or equivalently named)
key:

```jsonc
// GET /api/meta/{videoId}  (existing metadata call)
{
  "videoId": "abc123",
  "duration": 612.4,
  "title": "...",
  // ...existing fields...
  "playerLayout": {
    "schemaVersion": "1.0",
    "layoutModel": "region",
    "theme":   { /* ... */ },
    "regions": { /* ... */ }
  }
}
```

Player init flow:

```
fetch metadata ──► read playerLayout ──► build control bar ──► attach behavior
                                                                     │
                                                          (bind by gridIdentifier)
```

The server is the source of truth and always sends a correct, current-version
`region` layout — the player does **not** version-gate or validate the schema.
The only fallback is when `playerLayout` is entirely **absent** from the metadata
(e.g. an older video with no layout configured): use the player's built-in
default layout. Otherwise render the layout as received.

---

## 2. JSON shape (what the player receives)

```jsonc
{
  "schemaVersion": "1.0",         // informational; server guarantees a version the player ships
  "layoutModel": "region",        // always "region"
  "theme": {
    "primary":   "#1e90ff",       // progress fill / active accents
    "secondary": "#ffffff",       // icon + text color
    "iconSize":  22,              // density-independent (px / dp / pt)
    "barHeight": 40,
    "gap":       8                // spacing between items inside a group
  },
  "regions": {
    "top":    [ /* Row[] */ ],    // top bar      (PiP, Cast, Settings…)
    "center": [ /* Row[] */ ],    // center overlay (big Play, Back/Fwd…)
    "bottom": [ /* Row[] */ ]     // control bar  (progress, transport, time…)
  }
}
```

### The model in one line

```
regions → rows (stacked vertically) → groups (laid horizontally) → items (gridIdentifiers, ordered L→R)
```

- A **region** is an ordered array of **rows**, stacked top→bottom.
- A **row** is one or more **groups** laid out horizontally.
- A **group** has an `align` and an ordered list of control ids (`items`).
- A region may be omitted or `[]` when it has no controls.

---

## 3. Row forms — the two shapes you must parse

A `Row` is **either** the single-group shorthand **or** the multi-group form.
The player must accept both (the dashboard emits the shorthand whenever a row has
exactly one group).

**Shorthand (single group):**

```jsonc
{ "align": "fill", "items": ["VideoProgress"] }
```

**Full (multiple groups):**

```jsonc
{
  "groups": [
    { "align": "start", "items": ["Backward", "PlayNPause", "Forward"] },
    { "align": "end",   "items": ["Speed", "Quality", "FullScreen"] }
  ]
}
```

Normalize both to `Group[]` before rendering:

```ts
type Align = "start" | "center" | "end" | "fill";
interface Group { align: Align; items: GridIdentifier[]; }
type Row = Group | { groups: Group[] };

function rowGroups(row: Row): Group[] {
  return "groups" in row ? row.groups : [row];
}
```

---

## 4. Alignment semantics (`align`)

| `align`  | Meaning                                              | Web (flexbox)                 | Android (Compose)           | iOS (SwiftUI)                  |
| -------- | ---------------------------------------------------- | ----------------------------- | --------------------------- | ------------------------------ |
| `start`  | Packed to the leading (left) edge                    | default order                 | leading children            | leading                        |
| `center` | Centered within the row                              | `margin: auto`                | `Arrangement.Center`        | `Spacer()` both sides          |
| `end`    | Packed to the trailing (right) edge                  | `margin-left: auto`           | `Spacer()` before           | `Spacer()` before              |
| `fill`   | Expands to absorb all remaining horizontal space     | `flex: 1`                     | `Modifier.weight(1f)`       | `.frame(maxWidth: .infinity)`  |

- A row with `start` + `end` groups reads as **space-between**.
- A `fill` group (typically `VideoProgress`) absorbs the slack so you never need
  an empty spacer element.
- Item gap inside a group = `theme.gap`.

Every primitive maps to a first-class layout type on each platform — no custom
layout engine required:

| Concept      | Web                       | Android        | iOS      |
| ------------ | ------------------------- | -------------- | -------- |
| region stack | `flex-direction: column`  | `Column`       | `VStack` |
| row          | `display: flex`           | `Row`          | `HStack` |

---

## 5. Controls (`gridIdentifier`)

Each item in a group is a **`gridIdentifier`** — the stable, cross-platform key
the player binds rendering *and behavior* to. The authoring tool, web, Android,
and iOS all share this exact string set. A control absent from the JSON is simply
not rendered (no explicit "hidden" flag).

### The 21-control catalog (the contract)

| #  | gridIdentifier     | kind   | render hint        |
| -- | ------------------ | ------ | ------------------ |
| 1  | `AirPlay`          | icon   |                    |
| 2  | `Backward`         | icon   |                    |
| 3  | `CaptionSearch`    | icon   |                    |
| 4  | `Captions`         | icon   |                    |
| 5  | `Cast`             | icon   |                    |
| 6  | `Chapters`         | icon   |                    |
| 7  | `Forward`          | icon   |                    |
| 8  | `FullScreen`       | icon   |                    |
| 9  | `Notification`     | icon   |                    |
| 10 | `PictureInPicture` | icon   |                    |
| 11 | `PlayNPause`       | icon   |                    |
| 12 | `Quality`          | icon   |                    |
| 13 | `SaveVideoOffline` | icon   |                    |
| 14 | `Setting`          | icon   |                    |
| 15 | `Speed`            | icon   |                    |
| 16 | `TimeConsumed`     | text   | `HH:MM`            |
| 17 | `TimeLeft`         | text   | `HH:MM`            |
| 18 | `TimeDuration`     | text   | `HH:MM`            |
| 19 | `TimeAll`          | text   | `HH:MM / HH:MM`    |
| 20 | `VideoProgress`    | slider | typically `fill`   |
| 21 | `Volume`           | slider | `fill`-capable     |

> The **kind** is *not* in the JSON — it is a property of the id, known to the
> player from this static catalog. The JSON only ships ids; the player looks up
> kind, icon, and behavior locally.

### kind → how to render

| kind     | Web              | Android (Compose)      | iOS (SwiftUI)       |
| -------- | ---------------- | ---------------------- | ------------------- |
| `icon`   | `<svg>` button   | `Icon` in `IconButton` | `Image` in `Button` |
| `text`   | `<span>`         | `Text`                 | `Text`              |
| `slider` | `<input range>`  | `Slider`               | `Slider`            |

### Recommended player-side registry

Keep one map from `gridIdentifier` → render kind + behavior. This is the single
integration point; the layout engine stays dumb.

```ts
type ControlKind = "icon" | "text" | "slider";

interface ControlEntry {
  kind: ControlKind;
  icon?: IconAsset;                 // for kind "icon"
  textFormat?: (s: PlayerState) => string;  // for kind "text"
  onActivate?: (player: Player) => void;    // behavior — bound here, not in JSON
}

const REGISTRY: Record<GridIdentifier, ControlEntry> = {
  PlayNPause: { kind: "icon", icon: PlayIcon, onActivate: (p) => p.toggle() },
  Forward:    { kind: "icon", icon: FwdIcon,  onActivate: (p) => p.seek(+10) },
  VideoProgress: { kind: "slider", onActivate: /* seek to ratio */ },
  TimeAll:    { kind: "text", textFormat: (s) => `${fmt(s.t)} / ${fmt(s.dur)}` },
  // …all 21…
};
```

> Iconography is **not** shipped in the JSON. Native teams must provide matching
> glyphs (same SVGs, or agreed SF Symbols / Material equivalents) for parity.

---

## 6. Render algorithm (web reference)

```ts
function renderLayout(layout: PlayerLayout, root: HTMLElement, player: Player) {
  // 1. theme tokens (no schema gate — server guarantees a valid region layout)
  root.style.setProperty("--primary", layout.theme.primary);
  root.style.setProperty("--secondary", layout.theme.secondary);
  root.style.setProperty("--gap", `${layout.theme.gap}px`);
  root.style.setProperty("--bar-height", `${layout.theme.barHeight}px`);
  root.style.setProperty("--icon-size", `${layout.theme.iconSize}px`);

  // 2. regions → rows → groups → items
  for (const region of ["top", "center", "bottom"] as const) {
    const regionEl = makeRegion(region);                 // flex column
    for (const row of layout.regions[region] ?? []) {
      const rowEl = makeRow();                            // flex row, gap
      for (const group of rowGroups(row)) {
        const groupEl = makeGroup(group.align);          // start|center|end|fill
        for (const id of group.items) {
          const entry = REGISTRY[id];                    // id is always known (server-validated)
          groupEl.append(renderControl(id, entry, player));
        }
        rowEl.append(groupEl);
      }
      regionEl.append(rowEl);
    }
    root.append(regionEl);
  }
}

function renderControl(id: GridIdentifier, entry: ControlEntry, player: Player) {
  switch (entry.kind) {
    case "icon":   return iconButton(entry.icon!, () => entry.onActivate?.(player));
    case "text":   return textReadout(id, entry.textFormat!);   // subscribe to player time
    case "slider": return slider(id, player);                   // progress / volume
  }
}
```

Native renderers follow the same four-level walk with `Column/Row` (Compose) or
`VStack/HStack` (SwiftUI), mapping `align` per [§4](#4-alignment-semantics-align).

---

## 7. Types of regional layout (samples)

"Types" here are the layout **shapes** the regions can take. The player must
handle all of them.

### 7a. Minimal — single shorthand row

```json
{
  "schemaVersion": "1.0",
  "layoutModel": "region",
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8 },
  "regions": {
    "top": [],
    "center": [],
    "bottom": [
      { "align": "fill", "items": ["VideoProgress"] }
    ]
  }
}
```

### 7b. Space-between row (`start` + `end` groups)

```json
{
  "groups": [
    { "align": "start", "items": ["TimeAll"] },
    { "align": "end",   "items": ["Speed", "Quality", "Setting", "FullScreen"] }
  ]
}
```

Renders `TimeAll` pinned left, the settings cluster pinned right, gap between.

### 7c. Transport + fill in one row

```json
{
  "groups": [
    { "align": "start", "items": ["Backward", "PlayNPause", "Forward"] },
    { "align": "fill",  "items": ["VideoProgress"] }
  ]
}
```

### 7d. Center overlay (big play / skip)

```json
{
  "regions": {
    "center": [
      { "align": "center", "items": ["Backward", "PlayNPause", "Forward"] }
    ]
  }
}
```

### 7e. Full default layout (the canonical sample)

This is exactly what the POC's region mode emits for its default — use it as the
golden fixture for player parsing tests:

```json
{
  "schemaVersion": "1.0",
  "layoutModel": "region",
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8 },
  "regions": {
    "top": [
      { "align": "end", "items": ["PictureInPicture"] }
    ],
    "center": [],
    "bottom": [
      { "align": "start", "items": ["VideoProgress"] },
      { "align": "start", "items": ["Backward", "PlayNPause", "Forward"] },
      {
        "groups": [
          { "align": "start", "items": ["TimeAll"] },
          { "align": "end",   "items": ["Speed", "Quality", "Setting", "FullScreen"] }
        ]
      }
    ]
  }
}
```

---

## 8. Resilience (player-side rules)

The server guarantees a valid, current-version `region` layout, so the player
does **not** validate the schema or gate on `schemaVersion` / `layoutModel`. The
only cases it still handles:

| Situation                                   | Player behavior                          |
| ------------------------------------------- | ---------------------------------------- |
| `playerLayout` missing from metadata        | use built-in default layout              |
| Empty/omitted region                        | render nothing for it (valid)            |

Because correctness is enforced upstream (dashboard validates against the shared
`player.schema.json` before save — see [`spec.md` §9](./spec.md)), the player can
trust `items` contain known `gridIdentifier`s, rows are well-formed, and ids are
unique. No defensive skipping is required on the render path.

---

## 9. Checklist for the player team

- [ ] Read `playerLayout` from the metadata response; default only if absent.
- [ ] Normalize both row forms (shorthand + `groups`) to `Group[]`.
- [ ] Implement the four `align` modes per platform.
- [ ] Build the `gridIdentifier → {kind, icon, behavior}` registry (all 21).
- [ ] Bind behavior by id; never read behavior from JSON.
- [ ] Apply `theme` tokens (colors, gap, sizes).
- [ ] Test against the golden fixture in [§7e](#7e-full-default-layout-the-canonical-sample).
