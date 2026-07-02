# Player Implementation — Regional Layout

How the **player** consumes the Regional Layout JSON delivered in the metadata
API and renders the control bar from it. This is the consumer side of the
contract defined in [`spec.md`](./spec.md). The authoring side (dashboard) is in
[`DASHBOARD_IMPLEMENTATION.md`](./DASHBOARD_IMPLEMENTATION.md).

> **Scope:** layout + style only. _Behavior_ (what `PlayNPause` does) is wired
> natively per platform, keyed by the control's `gridIdentifier`. The JSON never
> carries behavior — see [§7](#7-controls-grididentifier).

> **Schema:** this document describes **`schemaVersion` 2.1**, which wraps the
> layout in per-**viewport** entries, adds **collapse-in-Setting**, and adds an
> optional top-level **`controls`** block carrying **custom controls** and
> **icon overrides** (see [§7b](#7b-custom-controls--icon-overrides-the-controls-block)).
> The flat 1.0 shape (single `regions` block, no viewports) is superseded; 2.0
> layouts (no `controls` block) render unchanged under 2.1.

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
    "schemaVersion": "2.1",
    "layoutModel": "region",
    "theme": {
      /* shared across viewports */
    },
    "controls": {
      /* OPTIONAL: custom controls + icon overrides — see §7b */
    },
    "viewports": {
      /* default | 490 | 300 | 200 */
    },
  },
}
```

Player init flow:

```
fetch metadata ──► read playerLayout ──► pick viewport (by width) ──► build bar ──► attach behavior
                              │                                          │              │
                  (read `controls` decls)              (resolve icon via `controls`)  (bind by gridIdentifier)
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
  "schemaVersion": "2.1",
  "layoutModel": "region", // always "region"
  "theme": {
    // ONE theme, shared by every viewport
    "primary": "#1e90ff", // progress fill / active accents
    "secondary": "#ffffff", // icon + text color
    "iconSize": 22, // density-independent (px / dp / pt)
    "barHeight": 40,
    "gap": 8, // spacing between items inside a group
  },
  "controls": {
    // OPTIONAL — declarations for custom controls
    "CUSTOM_like": {
      "custom": true,
      "kind": "icon",
      "label": "Like",
      "icon": "Heart",
    },
    "FullScreen": { "icon": "Maximize2" }, // and icon overrides — see §7b
  },
  "viewports": {
    "default": {
      "regions": {
        /* ... */
      },
      "collapseInSetting": [
        /* ids */
      ],
    },
    "490": {
      "regions": {
        /* ... */
      },
      "collapseInSetting": [
        /* ids */
      ],
    },
    "300": {
      "regions": {
        /* ... */
      },
      "collapseInSetting": [
        /* ids */
      ],
    },
    "200": {
      "regions": {
        /* ... */
      },
      "collapseInSetting": [
        /* ids */
      ],
    },
  },
}
```

Each **viewport** is a self-contained design:

```jsonc
{
  "regions": {
    "top": [
      /* Row[] */
    ], // top bar      (PiP, Cast, Settings…)
    "center": [
      /* Row[] */
    ], // center overlay (big Play, Back/Fwd…)
    "bottom": [
      /* Row[] */
    ], // control bar  (progress, transport, time…)
  },
  "collapseInSetting": ["Quality", "Speed"], // icons folded into the Setting menu
}
```

### The model in one line

```
viewports → regions → rows (stacked) → groups (horizontal) → items (gridIdentifiers, ordered L→R)
                                                            + collapseInSetting (icons in the Setting menu)
```

- **`theme`** is global (one set of tokens for all viewports).
- **`controls`** (optional, global) declares **custom controls** and **icon
  overrides** used anywhere in the document — see [§7b](#7b-custom-controls--icon-overrides-the-controls-block).
- Each **viewport** has its own `regions` **and** its own `collapseInSetting` list.
- A **region** is an ordered array of **rows**, stacked top→bottom.
- A **row** is one or more **groups** laid out horizontally.
- A **group** has an `align` and an ordered list of control ids (`items`).
- A region may be omitted or `[]` when it has no controls.

---

## 3. Viewports — choosing which layout to render

The four viewport keys are **max-width breakpoints** in CSS px of the _rendered
player_, not the device screen:

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

const hasAnyRow = (r: Regions) =>
  r.top.length || r.center.length || r.bottom.length;
```

> **Why fall through?** The dashboard may author only some viewports (e.g. a
> custom `default` and `200`, leaving `490`/`300` blank). A blank viewport means
> "inherit the next wider design," and `default` is always present as the base.

---

## 4. Collapse in Setting

Each viewport's **`collapseInSetting`** is an ordered list of **icon** controls
that live _inside the Setting menu_ instead of on the bar — a responsive way to
shed buttons on narrow players.

Contract:

- Only **icon**-kind controls appear here (never sliders/text, never `Setting`
  itself). This includes **custom** icon controls — resolve their glyph from the
  `controls` block, same as on the bar ([§7b](#7b-custom-controls--icon-overrides-the-controls-block)).
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
function renderSettingMenu(
  ids: ControlId[],
  controls: Controls,
  host: SettingMenu,
  player: Player,
) {
  if (ids.length === 0) return; // no Setting icon exists either
  for (const id of ids) {
    const c = resolveControl(id, controls); // glyph via override / custom decl (§7b)
    host.append(menuItem(c, () => c.onActivate?.(player)));
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
    { "align": "end", "items": ["Speed", "Quality", "FullScreen"] },
  ],
}
```

Normalize both to `Group[]` before rendering:

```ts
type Align = "start" | "center" | "end" | "fill";
interface Group {
  align: Align;
  items: ControlId[];
} // ids: built-in or CUSTOM_*
type Row = Group | { groups: Group[] };

function rowGroups(row: Row): Group[] {
  return "groups" in row ? row.groups : [row];
}
```

---

## 6. Alignment semantics (`align`)

| `align`  | Meaning                                          | Web (flexbox)       | Android (Compose)     | iOS (SwiftUI)                 |
| -------- | ------------------------------------------------ | ------------------- | --------------------- | ----------------------------- |
| `start`  | Packed to the leading (left) edge                | default order       | leading children      | leading                       |
| `center` | Centered within the row                          | `margin: auto`      | `Arrangement.Center`  | `Spacer()` both sides         |
| `end`    | Packed to the trailing (right) edge              | `margin-left: auto` | `Spacer()` before     | `Spacer()` before             |
| `fill`   | Expands to absorb all remaining horizontal space | `flex: 1`           | `Modifier.weight(1f)` | `.frame(maxWidth: .infinity)` |

- A row with `start` + `end` groups reads as **space-between**.
- A `fill` group (typically `VideoProgress`) absorbs the slack so you never need
  an empty spacer element.
- Item gap inside a group = `theme.gap`.

Every primitive maps to a first-class layout type on each platform — no custom
layout engine required:

| Concept      | Web                      | Android  | iOS      |
| ------------ | ------------------------ | -------- | -------- |
| region stack | `flex-direction: column` | `Column` | `VStack` |
| row          | `display: flex`          | `Row`    | `HStack` |

---

## 7. Controls (`gridIdentifier`)

Each item in a group is a control **id** — the stable, cross-platform key the
player binds rendering _and behavior_ to. Usually it's one of the **21 reserved
`gridIdentifier`s** below (shared by the authoring tool, web, Android, and iOS); it
may also be a **`CUSTOM_*`** id declared in the `controls` block
([§7b](#7b-custom-controls--icon-overrides-the-controls-block)). A control absent
from the JSON is simply not rendered (no explicit "hidden" flag).

### The 21-control catalog (the contract)

| #   | gridIdentifier     | kind   | render hint                                                      |
| --- | ------------------ | ------ | ---------------------------------------------------------------- |
| 1   | `AirPlay`          | icon   |                                                                  |
| 2   | `Backward`         | icon   |                                                                  |
| 3   | `CaptionSearch`    | icon   |                                                                  |
| 4   | `Captions`         | icon   |                                                                  |
| 5   | `Cast`             | icon   |                                                                  |
| 6   | `Chapters`         | icon   |                                                                  |
| 7   | `Forward`          | icon   |                                                                  |
| 8   | `FullScreen`       | icon   |                                                                  |
| 9   | `Notification`     | icon   |                                                                  |
| 10  | `PictureInPicture` | icon   |                                                                  |
| 11  | `PlayNPause`       | icon   |                                                                  |
| 12  | `Quality`          | icon   |                                                                  |
| 13  | `SaveVideoOffline` | icon   |                                                                  |
| 14  | `Setting`          | icon   | menu container — auto-managed (see [§4](#4-collapse-in-setting)) |
| 15  | `Speed`            | icon   |                                                                  |
| 16  | `TimeConsumed`     | text   | `HH:MM`                                                          |
| 17  | `TimeLeft`         | text   | `HH:MM`                                                          |
| 18  | `TimeDuration`     | text   | `HH:MM`                                                          |
| 19  | `TimeAll`          | text   | `HH:MM / HH:MM`                                                  |
| 20  | `VideoProgress`    | slider | typically `fill`                                                 |
| 21  | `Volume`           | slider | `fill`-capable                                                   |

> The **kind** is _not_ in the JSON — it is a property of the id, known to the
> player from this static catalog. The JSON only ships ids; the player looks up
> kind, icon, and behavior locally.

### kind → how to render

| kind     | Web             | Android (Compose)      | iOS (SwiftUI)       |
| -------- | --------------- | ---------------------- | ------------------- |
| `icon`   | `<svg>` button  | `Icon` in `IconButton` | `Image` in `Button` |
| `text`   | `<span>`        | `Text`                 | `Text`              |
| `slider` | `<input range>` | `Slider`               | `Slider`            |

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

const REGISTRY: Record<ControlId, ControlEntry> = {   // 21 built-ins; host may add CUSTOM_* ids
  PlayNPause: { kind: "icon", icon: PlayIcon, onActivate: (p) => p.toggle() },
  Forward:    { kind: "icon", icon: FwdIcon,  onActivate: (p) => p.seek(+10) },
  Setting:    { kind: "icon", icon: GearIcon, onActivate: (p) => p.toggleSettingMenu() },
  VideoProgress: { kind: "slider", onActivate: /* seek to ratio */ },
  TimeAll:    { kind: "text", textFormat: (s) => `${fmt(s.t)} / ${fmt(s.dur)}` },
  // …all 21…
};
```

> Iconography for the **21 built-ins** is **not** shipped in the JSON — native
> teams provide matching glyphs (same SVGs, or agreed SF Symbols / Material
> equivalents) for parity. **Custom controls and icon overrides** _do_ ship a
> Lucide icon **name** (a string, never raw SVG) in the `controls` block; map that
> name to your platform's glyph set ([§7b](#7b-custom-controls--icon-overrides-the-controls-block)).

---

## 7b. Custom controls & icon overrides (the `controls` block)

`schemaVersion` 2.1 adds an **optional** top-level `controls` object, keyed by id,
carrying the _extra_ information a stock player can't infer for two authoring
features. Untouched built-ins never appear here; the block is **omitted entirely
when empty** (so a layout with no customs/overrides is a 2.0 document plus the
version bump). Only **used** controls (placed on a bar or in `collapseInSetting`)
are declared.

```jsonc
"controls": {
  "CUSTOM_like": {            // 1) CUSTOM CONTROL — full declaration
    "custom": true,
    "kind":   "icon",         // currently always "icon"
    "label":  "Like",
    "icon":   "Heart"         // a Lucide icon NAME (never raw SVG)
  },
  "FullScreen": { "icon": "Maximize2" }   // 2) ICON OVERRIDE — new glyph only
}
```

**1. Custom controls.** A user-defined control whose id is `CUSTOM_<slug>` (the
`CUSTOM_` prefix guarantees no collision with the 21 reserved ids). The player has
no local catalog entry for it, so it is **fully declared**: `kind` (currently
always `icon`), `label`, and `icon`. It sits in `items` / `collapseInSetting`
exactly like a built-in id.

> **No built-in behavior.** A custom control carries layout + glyph only. The
> player renders it, but activation does nothing unless the **host app** registers
> a handler for its `CUSTOM_*` id. Treat an unhandled custom control as decorative.
>
> ```ts
> // Host opt-in: give a custom control behavior by registering its id.
> REGISTRY["CUSTOM_like"] = {
>   kind: "icon",
>   onActivate: (p) => like(p.videoId),
> };
> ```

**2. Icon overrides.** A reserved built-in whose glyph the user swapped. The id
stays a built-in — `kind` and behavior are still resolved from the local catalog —
and only the replacement `icon` (a Lucide name) rides along.

### Resolution rules (what the player must do)

For any item id seen while rendering (in `items` **or** `collapseInSetting`), with
`controls = layout.controls ?? {}`:

```ts
function resolveControl(id: ControlId, controls: Controls): RenderEntry {
  const decl = controls[id];

  // kind: declared for customs; from the local catalog for built-ins.
  const kind = decl?.custom ? (decl.kind ?? "icon") : REGISTRY[id].kind;

  // icon: a declared `icon` (override or custom) WINS over the catalog default.
  const iconName = decl?.icon ?? CATALOG_ICON[id]; // a Lucide name
  const icon = resolveLucide(iconName) ?? PLACEHOLDER_ICON; // map name → glyph asset

  // behavior: only built-ins (and host-registered customs) have one.
  return {
    kind,
    icon,
    onActivate: REGISTRY[id]?.onActivate,
    textFormat: REGISTRY[id]?.textFormat,
  };
}
```

- **`icon` is always a Lucide name string**, never raw SVG. Map it to your
  platform's glyph set (Lucide on web; the agreed Lucide-equivalent SF Symbol /
  Material asset on native). If the name is unknown to your build, draw a
  **placeholder glyph** rather than failing.
- A declared `icon` **overrides** the local catalog glyph for that id — this is how
  the override feature reaches the player; the id, `kind`, and behavior are
  otherwise unchanged.
- Render every control — bar and Setting menu — through `resolveControl`, so custom
  glyphs and overrides apply uniformly.

---

## 8. Render algorithm (web reference)

```ts
function renderPlayer(layout: PlayerLayout, root: HTMLElement, player: Player) {
  applyTheme(root, layout.theme); // shared tokens

  const controls = layout.controls ?? {}; // §7b — custom + overrides
  const render = () => {
    const vp = resolveViewport(layout.viewports, player.width); // §3 — re-run on resize
    root.replaceChildren();
    renderRegions(vp.regions, controls, root, player); // bar
    renderSettingMenu(vp.collapseInSetting, controls, settingHost, player); // §4 — Setting menu
  };

  render();
  player.onResize(render); // re-pick viewport on width change
}

function applyTheme(root: HTMLElement, t: Theme) {
  root.style.setProperty("--primary", t.primary);
  root.style.setProperty("--secondary", t.secondary);
  root.style.setProperty("--gap", `${t.gap}px`);
  root.style.setProperty("--bar-height", `${t.barHeight}px`);
  root.style.setProperty("--icon-size", `${t.iconSize}px`);
}

function renderRegions(
  regions: Regions,
  controls: Controls,
  root: HTMLElement,
  player: Player,
) {
  for (const region of ["top", "center", "bottom"] as const) {
    const regionEl = makeRegion(region); // flex column
    for (const row of regions[region] ?? []) {
      const rowEl = makeRow(); // flex row, gap
      for (const group of rowGroups(row)) {
        const groupEl = makeGroup(group.align); // start|center|end|fill
        for (const id of group.items) {
          groupEl.append(renderControl(id, controls, player)); // id known: catalog or `controls`
        }
        rowEl.append(groupEl);
      }
      regionEl.append(rowEl);
    }
    root.append(regionEl);
  }
}

function renderControl(id: ControlId, controls: Controls, player: Player) {
  const c = resolveControl(id, controls); // §7b — glyph/kind/behavior
  switch (c.kind) {
    case "icon":
      return iconButton(c.icon, () => c.onActivate?.(player)); // custom: no-op unless host-bound
    case "text":
      return textReadout(id, c.textFormat!); // subscribe to player time
    case "slider":
      return slider(id, player); // progress / volume
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
          {
            "align": "end",
            "items": ["Speed", "Quality", "Setting", "FullScreen"]
          }
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
          { "align": "end", "items": ["Setting", "FullScreen"] }
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
`default`, per [§3](#3-viewports--choosing-which-layout-to-render)). No custom
controls or overrides, so the `controls` block is omitted. Use as the golden
fixture for parser tests:

```json
{
  "schemaVersion": "2.1",
  "layoutModel": "region",
  "theme": {
    "primary": "#1e90ff",
    "secondary": "#ffffff",
    "iconSize": 22,
    "barHeight": 40,
    "gap": 8
  },
  "viewports": {
    "default": {
      "regions": {
        "top": [{ "align": "end", "items": ["PictureInPicture"] }],
        "center": [],
        "bottom": [
          { "align": "start", "items": ["VideoProgress"] },
          { "align": "start", "items": ["Backward", "PlayNPause", "Forward"] },
          {
            "groups": [
              { "align": "start", "items": ["TimeAll"] },
              {
                "align": "end",
                "items": ["Speed", "Quality", "Setting", "FullScreen"]
              }
            ]
          }
        ]
      },
      "collapseInSetting": []
    },
    "490": {
      "regions": { "top": [], "center": [], "bottom": [] },
      "collapseInSetting": []
    },
    "300": {
      "regions": { "top": [], "center": [], "bottom": [] },
      "collapseInSetting": []
    },
    "200": {
      "regions": { "top": [], "center": [], "bottom": [] },
      "collapseInSetting": []
    }
  }
}
```

### 9d. With a custom control + an icon override

A `CUSTOM_like` button (Lucide `Heart`) placed on the bar, and `FullScreen`'s glyph
overridden to `Maximize2`. Both ids appear in `items`; both are declared in the
top-level `controls` block. The player renders `CUSTOM_like` with the `Heart`
glyph (no behavior unless the host binds the id), and `FullScreen` with `Maximize2`
while keeping its native fullscreen behavior:

```json
{
  "schemaVersion": "2.1",
  "layoutModel": "region",
  "theme": {
    "primary": "#1e90ff",
    "secondary": "#ffffff",
    "iconSize": 22,
    "barHeight": 40,
    "gap": 8
  },
  "controls": {
    "CUSTOM_like": {
      "custom": true,
      "kind": "icon",
      "label": "Like",
      "icon": "Heart"
    },
    "FullScreen": { "icon": "Maximize2" }
  },
  "viewports": {
    "default": {
      "regions": {
        "top": [],
        "center": [],
        "bottom": [
          { "align": "fill", "items": ["VideoProgress"] },
          {
            "groups": [
              { "align": "start", "items": ["PlayNPause"] },
              { "align": "end", "items": ["CUSTOM_like", "FullScreen"] }
            ]
          }
        ]
      },
      "collapseInSetting": []
    },
    "490": {
      "regions": { "top": [], "center": [], "bottom": [] },
      "collapseInSetting": []
    },
    "300": {
      "regions": { "top": [], "center": [], "bottom": [] },
      "collapseInSetting": []
    },
    "200": {
      "regions": { "top": [], "center": [], "bottom": [] },
      "collapseInSetting": []
    }
  }
}
```

---

## 10. Resilience (player-side rules)

The server guarantees a valid, current-version `region` layout, so the player
does **not** validate the schema or gate on `schemaVersion` / `layoutModel`. The
cases it still handles:

| Situation                                  | Player behavior                                               |
| ------------------------------------------ | ------------------------------------------------------------- |
| `playerLayout` missing from metadata       | use built-in default layout                                   |
| Selected viewport has no rows              | fall through to the next wider; `default` is base             |
| Empty/omitted region                       | render nothing for it (valid)                                 |
| `collapseInSetting` empty                  | no Setting menu (and `Setting` is absent from bar)            |
| `controls` block absent (a 2.0 document)   | render every id from the local catalog (no customs/overrides) |
| Declared `icon` name unknown to this build | draw a placeholder glyph (don't fail)                         |
| `CUSTOM_*` control with no host handler    | render its glyph; activation is a no-op (decorative)          |

Because correctness is enforced upstream (dashboard validates against the shared
`player.schema.json` before save — see [`spec.md` §9](./spec.md)), the player can
trust that every id in `items`/`collapseInSetting` is either a known
`gridIdentifier` **or** a `CUSTOM_*` id declared in `controls`, that declared icon
names are well-formed, rows are well-formed, and ids are unique within a viewport.
No defensive skipping is required on the render path beyond the placeholder-glyph
fallback above.

---

## 11. Checklist for the player team

- [ ] Read `playerLayout` from the metadata response; default only if absent.
- [ ] Apply the global `theme` tokens (colors, gap, sizes).
- [ ] Resolve the viewport by player width; **re-resolve on resize** (§3).
- [ ] Normalize both row forms (shorthand + `groups`) to `Group[]`.
- [ ] Implement the four `align` modes per platform.
- [ ] Build the `gridIdentifier → {kind, icon, behavior}` registry (all 21).
- [ ] Parse the optional `controls` block; resolve every item's glyph/kind through it (§7b).
- [ ] Let a declared `icon` (override or custom) replace the catalog glyph; map the Lucide name to your glyph set (placeholder if unknown).
- [ ] Render `CUSTOM_*` controls from their declaration; bind behavior only when the host registered a handler for the id.
- [ ] Render `Setting` as the menu container; populate it from `collapseInSetting` (§4).
- [ ] Bind built-in behavior by id; never read behavior from JSON.
- [ ] Test against the golden fixtures in [§9c](#9c-full-document-the-canonical-fixture) and [§9d](#9d-with-a-custom-control--an-icon-override).

```

```
