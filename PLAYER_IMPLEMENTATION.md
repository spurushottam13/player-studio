# Player Implementation — Regional Layout

How the **player** consumes the Regional Layout JSON delivered in the metadata
API and renders the control bar from it. This is the consumer side of the
contract defined in [`spec.md`](./spec.md). The authoring side (dashboard) is in
[`DASHBOARD_IMPLEMENTATION.md`](./DASHBOARD_IMPLEMENTATION.md).

> **Scope:** layout + style only. *Behavior* (what `PlayNPause` does) is wired
> natively per platform, keyed by the control's `gridIdentifier`. The JSON never
> carries behavior — see [§7](#7-controls-grididentifier).

> **Schema:** this document describes **`schemaVersion` 2.0**, which wraps the
> layout in per-**viewport** entries and adds **collapse-in-Setting**. The flat
> 1.0 shape (single `regions` block, no viewports) is superseded.

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
    "schemaVersion": "2.0",
    "layoutModel": "region",
    "theme":     { /* shared across viewports */ },
    "viewports": { /* default | 490 | 300 | 200 */ }
  }
}
```

Player init flow:

```
fetch metadata ──► read playerLayout ──► pick viewport (by width) ──► build bar ──► attach behavior
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
  "schemaVersion": "2.0",
  "layoutModel": "region",          // always "region"
  "theme": {                        // ONE theme, shared by every viewport
    "primary":   "#1e90ff",         // progress fill / active accents
    "secondary": "#ffffff",         // icon + text color
    "iconSize":  22,                // density-independent (px / dp / pt)
    "barHeight": 40,
    "gap":       8                  // spacing between items inside a group
  },
  "viewports": {
    "default": { "regions": { /* ... */ }, "collapseInSetting": [ /* ids */ ] },
    "490":     { "regions": { /* ... */ }, "collapseInSetting": [ /* ids */ ] },
    "300":     { "regions": { /* ... */ }, "collapseInSetting": [ /* ids */ ] },
    "200":     { "regions": { /* ... */ }, "collapseInSetting": [ /* ids */ ] }
  }
}
```

Each **viewport** is a self-contained design:

```jsonc
{
  "regions": {
    "top":    [ /* Row[] */ ],      // top bar      (PiP, Cast, Settings…)
    "center": [ /* Row[] */ ],      // center overlay (big Play, Back/Fwd…)
    "bottom": [ /* Row[] */ ]       // control bar  (progress, transport, time…)
  },
  "collapseInSetting": [ "Quality", "Speed" ]   // icons folded into the Setting menu
}
```

### The model in one line

```
viewports → regions → rows (stacked) → groups (horizontal) → items (gridIdentifiers, ordered L→R)
                                                            + collapseInSetting (icons in the Setting menu)
```

- **`theme`** is global (one set of tokens for all viewports).
- Each **viewport** has its own `regions` **and** its own `collapseInSetting` list.
- A **region** is an ordered array of **rows**, stacked top→bottom.
- A **row** is one or more **groups** laid out horizontally.
- A **group** has an `align` and an ordered list of control ids (`items`).
- A region may be omitted or `[]` when it has no controls.

---

## 3. Viewports — choosing which layout to render

The four viewport keys are **max-width breakpoints** in CSS px of the *rendered
player*, not the device screen:

| key       | applies when player width is… |
| --------- | ----------------------------- |
| `200`     | ≤ 200 px                      |
| `300`     | ≤ 300 px                      |
| `490`     | ≤ 490 px                      |
| `default` | anything wider (desktop base) |

### Selection rule

Pick the **smallest** breakpoint whose threshold is ≥ the current width; if the
width exceeds 490, use `default`. The player must **re-pick on resize** (window
resize, rotation, fullscreen enter/exit).

```ts
const ORDER = ["200", "300", "490", "default"] as const; // narrow → wide

function resolveViewport(viewports: Viewports, width: number): ViewportLayout {
  const start = width <= 200 ? 0 : width <= 300 ? 1 : width <= 490 ? 2 : 3;
  // Walk widening: a viewport with no rows in any region is "not authored" for
  // this width — fall through to the next wider one. `default` is the base.
  for (let i = start; i < ORDER.length; i++) {
    const vp = viewports[ORDER[i]];
    if (vp && hasAnyRow(vp.regions)) return vp;
  }
  return viewports.default;
}

const hasAnyRow = (r: Regions) => r.top.length || r.center.length || r.bottom.length;
```

> **Why fall through?** The dashboard may author only some viewports (e.g. a
> custom `default` and `200`, leaving `490`/`300` blank). A blank viewport means
> "inherit the next wider design," and `default` is always present as the base.

---

## 4. Collapse in Setting

Each viewport's **`collapseInSetting`** is an ordered list of **icon** controls
that live *inside the Setting menu* instead of on the bar — a responsive way to
shed buttons on narrow players.

Contract:

- Only **icon**-kind controls appear here (never sliders/text, never `Setting`
  itself).
- **The `Setting` control is auto-managed by the authoring tool:** when
  `collapseInSetting` is **non-empty**, `Setting` is guaranteed to be present in
  that viewport's `regions`; when it is **empty**, `Setting` is **absent**. The
  player does not add or remove `Setting` itself — it just renders what's there.
- The collapsed ids are **not** in `regions` (they were taken off the bar).

### Player behavior

- Render `regions` normally — the `Setting` icon (when present) is just another
  icon control on the bar.
- Activating `Setting` opens a menu/popover/sheet; populate it from
  `collapseInSetting`, rendering each id with the same registry (icon + behavior)
  used on the bar.
- If `collapseInSetting` is empty there is no `Setting` icon and no menu.

```ts
function renderSettingMenu(ids: GridIdentifier[], host: SettingMenu, player: Player) {
  if (ids.length === 0) return;                 // no Setting icon exists either
  for (const id of ids) {
    const entry = REGISTRY[id];                 // icon kind
    host.append(menuItem(entry, () => entry.onActivate?.(player)));
  }
}
```

---

## 5. Row forms — the two shapes you must parse

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

## 6. Alignment semantics (`align`)

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

## 7. Controls (`gridIdentifier`)

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
| 14 | `Setting`          | icon   | menu container — auto-managed (see [§4](#4-collapse-in-setting)) |
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
integration point; the layout engine stays dumb. The same registry renders a
control whether it sits on the bar or inside the Setting menu.

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
  Setting:    { kind: "icon", icon: GearIcon, onActivate: (p) => p.toggleSettingMenu() },
  VideoProgress: { kind: "slider", onActivate: /* seek to ratio */ },
  TimeAll:    { kind: "text", textFormat: (s) => `${fmt(s.t)} / ${fmt(s.dur)}` },
  // …all 21…
};
```

> Iconography is **not** shipped in the JSON. Native teams must provide matching
> glyphs (same SVGs, or agreed SF Symbols / Material equivalents) for parity.

---

## 8. Render algorithm (web reference)

```ts
function renderPlayer(layout: PlayerLayout, root: HTMLElement, player: Player) {
  applyTheme(root, layout.theme);                              // shared tokens

  const render = () => {
    const vp = resolveViewport(layout.viewports, player.width); // §3 — re-run on resize
    root.replaceChildren();
    renderRegions(vp.regions, root, player);                    // bar
    renderSettingMenu(vp.collapseInSetting, settingHost, player); // §4 — Setting menu
  };

  render();
  player.onResize(render);                                     // re-pick viewport on width change
}

function applyTheme(root: HTMLElement, t: Theme) {
  root.style.setProperty("--primary", t.primary);
  root.style.setProperty("--secondary", t.secondary);
  root.style.setProperty("--gap", `${t.gap}px`);
  root.style.setProperty("--bar-height", `${t.barHeight}px`);
  root.style.setProperty("--icon-size", `${t.iconSize}px`);
}

function renderRegions(regions: Regions, root: HTMLElement, player: Player) {
  for (const region of ["top", "center", "bottom"] as const) {
    const regionEl = makeRegion(region);                       // flex column
    for (const row of regions[region] ?? []) {
      const rowEl = makeRow();                                 // flex row, gap
      for (const group of rowGroups(row)) {
        const groupEl = makeGroup(group.align);                // start|center|end|fill
        for (const id of group.items) {
          const entry = REGISTRY[id];                          // id is always known (server-validated)
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

Native renderers follow the same walk with `Column/Row` (Compose) or
`VStack/HStack` (SwiftUI), mapping `align` per [§6](#6-alignment-semantics-align),
and re-resolve the viewport on size-class / configuration changes.

---

## 9. Samples

### 9a. One viewport — space-between row (`start` + `end` groups)

```json
{
  "regions": {
    "top": [],
    "center": [],
    "bottom": [
      {
        "groups": [
          { "align": "start", "items": ["TimeAll"] },
          { "align": "end",   "items": ["Speed", "Quality", "Setting", "FullScreen"] }
        ]
      }
    ]
  },
  "collapseInSetting": []
}
```

### 9b. Narrow viewport — controls folded into Setting

At `≤300`, `Speed` + `Quality` are collapsed into the Setting menu. Note
`Setting` **appears in `regions`** because `collapseInSetting` is non-empty:

```json
{
  "regions": {
    "top": [],
    "center": [],
    "bottom": [
      { "align": "fill", "items": ["VideoProgress"] },
      {
        "groups": [
          { "align": "start", "items": ["PlayNPause"] },
          { "align": "end",   "items": ["Setting", "FullScreen"] }
        ]
      }
    ]
  },
  "collapseInSetting": ["Speed", "Quality"]
}
```

### 9c. Full document (the canonical fixture)

Exactly what the studio's region mode emits for its default — `default` carries
the canonical bar, narrow viewports are left blank (player falls through to
`default`, per [§3](#3-viewports--choosing-which-layout-to-render)). Use as the
golden fixture for parser tests:

```json
{
  "schemaVersion": "2.0",
  "layoutModel": "region",
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8 },
  "viewports": {
    "default": {
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
      },
      "collapseInSetting": []
    },
    "490": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "300": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "200": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] }
  }
}
```

---

## 10. Resilience (player-side rules)

The server guarantees a valid, current-version `region` layout, so the player
does **not** validate the schema or gate on `schemaVersion` / `layoutModel`. The
cases it still handles:

| Situation                                   | Player behavior                                  |
| ------------------------------------------- | ------------------------------------------------ |
| `playerLayout` missing from metadata        | use built-in default layout                      |
| Selected viewport has no rows               | fall through to the next wider; `default` is base|
| Empty/omitted region                        | render nothing for it (valid)                    |
| `collapseInSetting` empty                   | no Setting menu (and `Setting` is absent from bar)|

Because correctness is enforced upstream (dashboard validates against the shared
`player.schema.json` before save — see [`spec.md` §9](./spec.md)), the player can
trust `items`/`collapseInSetting` contain known `gridIdentifier`s, rows are
well-formed, and ids are unique within a viewport. No defensive skipping is
required on the render path.

---

## 11. Checklist for the player team

- [ ] Read `playerLayout` from the metadata response; default only if absent.
- [ ] Apply the global `theme` tokens (colors, gap, sizes).
- [ ] Resolve the viewport by player width; **re-resolve on resize** (§3).
- [ ] Normalize both row forms (shorthand + `groups`) to `Group[]`.
- [ ] Implement the four `align` modes per platform.
- [ ] Build the `gridIdentifier → {kind, icon, behavior}` registry (all 21).
- [ ] Render `Setting` as the menu container; populate it from `collapseInSetting` (§4).
- [ ] Bind behavior by id; never read behavior from JSON.
- [ ] Test against the golden fixture in [§9c](#9c-full-document-the-canonical-fixture).
```
