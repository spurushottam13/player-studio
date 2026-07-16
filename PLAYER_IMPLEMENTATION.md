# Player Implementation — Regional Layout

How the **player** consumes the Regional Layout JSON delivered in the metadata API
and renders the control bar from it. This is the consumer side of the contract
defined in [`spec.md`](./spec.md). The authoring side (dashboard) is in
[`DASHBOARD_IMPLEMENTATION.md`](./DASHBOARD_IMPLEMENTATION.md).

> **Scope:** layout + style only. _Behavior_ (what `PlayNPause` does) is wired
> natively per platform, keyed by the control's `gridIdentifier`. The JSON never
> carries behavior — see [§7](#7-controls-grididentifier).

> **Schema:** this document describes **`schemaVersion` "3.1"** — the single
> current version. Per-**viewport** entries (`default | 490 | 300 | vertical` —
> three landscape width breakpoints plus a portrait 9:16 design),
> **collapse-in-Setting**, one shared **`theme`** (colors, sizes, shared background
> color/opacity, player-container padding), **lane-keyed rows** (`start | center |
> end`; fill items flagged in a per-lane `fill` list), and an optional top-level
> **`controls`** block declaring custom controls, text/spacer/background elements,
> icon overrides, and per-icon appearance (`size`, `background`) — see
> [§7b](#7b-the-controls-block).

> **17 reserved built-ins.** All time readouts and three text elements are **text
> controls** in the `controls` block ([§7c](#7c-text-controls)); the two
> blank/decorative elements are **spacers** and **lane backgrounds**
> ([§7d](#7d-spacers--backgrounds)). A **per-icon background** (a circle/badge behind
> one glyph) rides on an icon's declaration ([§7d](#7d-spacers--backgrounds)).

---

## 1. Where the layout comes from

The Regional Layout JSON is embedded in the **metadata API** response the player
already fetches at init, under a `playerLayout` key:

```jsonc
// GET /api/meta/{videoId}
{
  "videoId": "abc123",
  "duration": 612.4,
  // ...existing fields...
  "playerLayout": {
    "schemaVersion": "3.1",
    "layoutModel": "region",
    "theme": { /* shared across viewports */ },
    "controls": { /* OPTIONAL — see §7b */ },
    "viewports": { /* default | 490 | 300 | vertical */ }
  }
}
```

Player init flow:

```
fetch metadata ─► read playerLayout ─► pick viewport (by width) ─► apply theme ─► build bar ─► attach behavior
                        │                                              │             │            │
              (read `controls` decls)                 (container padding)  (resolve id via `controls`)  (bind by gridIdentifier)
```

The server is the source of truth and always sends a correct, current-version
`region` layout — the player does **not** version-gate or validate the schema. The
only fallback is when `playerLayout` is entirely **absent** (an older video with no
layout): use the player's built-in default. Otherwise render as received.

---

## 2. JSON shape (what the player receives)

```jsonc
{
  "schemaVersion": "3.1",
  "layoutModel": "region", // always "region"
  "theme": {
    // ONE theme, shared by every viewport
    "primary": "#1e90ff",        // progress fill / active accents
    "secondary": "#ffffff",      // icon + text color
    "iconSize": 22,              // default icon size (px/dp/pt); a control's `size` overrides it
    "barHeight": 40,
    "gap": 8,                    // spacing between items INSIDE a lane
    "backgroundColor": "#000000",// shared fill for EVERY background (lane + per-icon)
    "backgroundOpacity": 0.5,    // 0–1, shared
    "paddingX": 9,               // .Player container padding, left+right
    "paddingY": 4                // top+bottom
  },
  "controls": {
    // OPTIONAL — IDENTITY only (kind/label/icon/text + spacer width + lane-bg
    // padding/radius) + icon overrides. Per-icon size/background are PER-VIEWPORT
    // (viewports[].styles), not here. — see §7b
    "CUSTOM_spacer": { "custom": true, "kind": "spacer", "label": "Spacer", "icon": "RectangleHorizontal", "width": 200 }
  },
  "viewports": {
    "default":  {
      "regions": { /* ... */ }, "collapseInSetting": [ /* ids */ ],
      "styles": { "PlayNPause": { "size": 48, "background": { "padding": 10, "radius": 40 } } } // §7e
    },
    "490":      { "regions": { /* ... */ }, "collapseInSetting": [] },
    "300":      { "regions": { /* ... */ }, "collapseInSetting": [] },
    "vertical": { "regions": { /* ... */ }, "collapseInSetting": [] } // portrait 9:16
  }
}
```

### The model in one line

```
viewports → regions → rows (stacked) → lanes (start | center | end) → items (ids, ordered L→R)
                                                                    + collapseInSetting (icons in the Setting menu)
```

- **`theme`** is global. `backgroundColor` / `backgroundOpacity` apply to every
  background element (lane backgrounds **and** per-icon backgrounds). `paddingX` /
  `paddingY` are the inner padding of the whole player container. `iconSize` is the
  default; a control may override it with its own `size` (§7b).
- **`controls`** (optional, global) is a deduped **identity table**, keyed by id: what
  each used id _is_ (custom controls' kind/label/icon/text extras, icon overrides,
  spacer width, lane-background padding/radius) — §7b. It does **not** place or render
  anything, and it carries **no** per-icon size/background (those are per-viewport).
- **Per-icon appearance is per-viewport.** Each viewport carries its own optional
  **`styles`** map (`{ [id]: { size?, background? } }`, §7e), so the _same_ built-in
  icon (e.g. `Forward`) can be one size with a circle in `default` and a different
  size with no circle in `vertical`. Editing it in one viewport never changes another.
- **Each viewport is independent.** A control appears in a viewport **only** where its
  id is in that viewport's `regions` (or `collapseInSetting`), and looks how that
  viewport's `styles` say. A control placed in one viewport is **not** added to the
  others — e.g. a lane background placed in `default` is absent from `vertical` / `490`
  / `300` unless placed there too.
- A **region** is an ordered array of **rows**, stacked top→bottom.
- A **row** is an object keyed by **lane** (`start | center | end`); empty lanes are
  omitted. A **lane** has ordered `items` and an optional `fill` list.
- A region may be omitted or `[]` when empty.

---

## 3. Viewports — choosing which layout to render

Four viewport keys of the _rendered player_ (not the device screen). Three are
**landscape max-width breakpoints** (in CSS px); `vertical` is a **portrait 9:16
design** selected by orientation, not width:

| key        | applies when the player renders…             |
| ---------- | -------------------------------------------- |
| `vertical` | **portrait** (taller than wide, ~9:16)       |
| `300`      | landscape, width ≤ 300 px                     |
| `490`      | landscape, width ≤ 490 px                     |
| `default`  | landscape, anything wider (base)             |

Selection: if the player is **portrait** and `vertical` is authored, use it;
otherwise pick the **smallest** landscape breakpoint whose threshold is ≥ the
current width (`default` is the base). A viewport with no rows in any region is
"not authored" and falls through. **Re-pick on resize / rotation / fullscreen.**

```ts
const LANDSCAPE = ["300", "490", "default"] as const; // narrow → wide
const authored = (vp) => vp && (vp.regions.top.length || vp.regions.center.length || vp.regions.bottom.length);

function resolveViewport(viewports, { width, height }) {
  // Portrait prefers the vertical design when authored.
  if (height > width && authored(viewports.vertical)) return viewports.vertical;
  // Landscape: smallest breakpoint ≥ width; fall through blanks; `default` is base.
  const start = width <= 300 ? 0 : width <= 490 ? 1 : 2;
  for (let i = start; i < LANDSCAPE.length; i++) {
    if (authored(viewports[LANDSCAPE[i]])) return viewports[LANDSCAPE[i]];
  }
  return viewports.default;
}
```

> **Why fall through?** The dashboard may author only some viewports; a blank one
> means "inherit the next wider design" (landscape) or "use the landscape design"
> (an unauthored `vertical`). `default` is always the base.

---

## 4. Collapse in Setting

Each viewport's **`collapseInSetting`** is an ordered list of **icon** controls that
live _inside the Setting menu_ instead of on the bar — a responsive way to shed
buttons on narrow players.

- Only **icon**-kind controls appear here (never sliders/text/spacer/background,
  never `Setting`). Custom icon controls qualify; resolve their glyph from `controls`.
- **`Setting` is auto-managed by the authoring tool:** when `collapseInSetting` is
  non-empty, `Setting` is present in that viewport's `regions`; when empty, it's
  absent. The player just renders what's there.
- Collapsed ids are **not** in `regions`.

Render `regions` normally (the `Setting` icon is just another icon on the bar);
activating `Setting` opens a menu populated from `collapseInSetting`, each id
rendered through the same registry (§7b). Empty list ⇒ no `Setting` icon, no menu.

---

## 5. Row shape (lane-keyed)

A `Row` is an object keyed by lane; each lane has ordered `items` and, when any
stretch, a `fill` list. Empty lanes omitted.

```jsonc
{
  "start": { "items": ["Backward", "VideoProgress"], "fill": ["VideoProgress"] },
  "end":   { "items": ["Forward"] }
}
```

```ts
type Lane = "start" | "center" | "end";
interface LaneGroup {
  items: ControlId[]; // ids: built-in or CUSTOM_* / cdt_*, ordered L→R (may include spacer/background)
  fill?: ControlId[]; // subset of items that stretch; omitted when none
}
type Row = Partial<Record<Lane, LaneGroup>>;
```

A **fill item stays inline in `items`** — its position is the layout information;
`fill` only says "this item absorbs the row's remaining space". Only the
`VideoProgress` slider ever appears in `fill`. **Spacers and lane backgrounds are
also inline in `items`**, but render specially (a blank gap / a backdrop layer —
§7d); their position in the sequence still matters.

---

## 6. Alignment semantics (lanes + `fill`)

| lane        | Meaning                                          | Web (flexbox)       | Android (Compose)     | iOS (SwiftUI)                 |
| ----------- | ------------------------------------------------ | ------------------- | --------------------- | ----------------------------- |
| `start`     | Packed to the leading (left) edge                | default order       | leading children      | leading                       |
| `center`    | Centered within the row                          | `margin: auto`      | `Arrangement.Center`  | `Spacer()` both sides         |
| `end`       | Packed to the trailing (right) edge              | `margin-left: auto` | `Spacer()` before     | `Spacer()` before             |
| `fill` item | Expands to absorb all remaining horizontal space | `flex: 1`           | `Modifier.weight(1f)` | `.frame(maxWidth: .infinity)` |

- A row with `start` + `end` lanes reads as **space-between**.
- A `fill` item absorbs the slack from its own position in `items`. A lane holding a
  fill item must itself grow (`flex: 1` on the lane, on web).
- **Item gap inside a lane = `theme.gap`.** There is no extra gap _between_ lanes —
  they're edge/center aligned, so a fill item butts right up to a neighbouring lane.

| Concept      | Web                      | Android  | iOS      |
| ------------ | ------------------------ | -------- | -------- |
| region stack | `flex-direction: column` | `Column` | `VStack` |
| row          | `display: flex`          | `Row`    | `HStack` |
| player pad   | `padding: paddingY paddingX` | container inset | container inset |

---

## 7. Controls (`gridIdentifier`)

Each item in a lane is a control **id** — the stable, cross-platform key the player
binds rendering _and behavior_ to. Usually one of the **17 reserved
`gridIdentifier`s**; it may also be a **`CUSTOM_*`** custom/text/spacer/background id
or a **`cdt_*`** dynamic-text id declared in `controls` (§7b). A control absent from
the JSON is simply not rendered.

### The 17-control catalog (the contract)

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
| 14  | `Setting`          | icon   | menu container — auto-managed ([§4](#4-collapse-in-setting))     |
| 15  | `Speed`            | icon   |                                                                  |
| 16  | `VideoProgress`    | slider | typically `fill`                                                 |
| 17  | `Volume`           | icon   | on-demand hover slider — [§7a](#7a-volume--the-hover-slider)     |

> Time readouts, Current Chapter, Dynamic Text, and Title are **not** built-ins —
> they're **text controls** in `controls` ([§7c](#7c-text-controls)). Spacers and
> backgrounds are also `controls` entries ([§7d](#7d-spacers--backgrounds)).

> A built-in's **kind** is _not_ in the JSON — the player knows it from this
> catalog. Custom / text / spacer / background controls _do_ carry their `kind` in
> `controls`, since the player has no catalog entry for them.

### kind → how to render

| kind         | Web                       | Android (Compose)      | iOS (SwiftUI)       |
| ------------ | ------------------------- | ---------------------- | ------------------- |
| `icon`       | `<svg>` button            | `Icon` in `IconButton` | `Image` in `Button` |
| `text`       | `<span>`                  | `Text`                 | `Text`              |
| `slider`     | `<input range>`           | `Slider`               | `Slider`            |
| `spacer`     | fixed-width blank box     | `Spacer`/`Box(width)`  | `Spacer().frame`    |
| `background` | absolute backdrop layer   | `Box` behind lane      | `ZStack` background |

### Recommended player-side registry

One map from `gridIdentifier` → render kind + behavior. The layout engine stays
dumb; the same registry renders a control on the bar or in the Setting menu.

```ts
const REGISTRY: Record<ControlId, ControlEntry> = {   // 17 built-ins; host may add CUSTOM_* / cdt_* ids
  PlayNPause:    { kind: "icon", icon: PlayIcon, onActivate: (p) => p.toggle() },
  Forward:       { kind: "icon", icon: FwdIcon,  onActivate: (p) => p.seek(+10) },
  Setting:       { kind: "icon", icon: GearIcon, onActivate: (p) => p.toggleSettingMenu() },
  VideoProgress: { kind: "slider", /* seek to ratio */ },
  Volume:        { kind: "icon", icon: VolumeIcon, /* toggle mute + hover slider §7a */ },
  // …all 17 (time readouts are text controls — §7c)…
};
```

> Iconography for the **17 built-ins** is not shipped in the JSON — native teams
> provide matching glyphs. **Custom controls, overrides, spacers, and backgrounds**
> _do_ ship a Lucide icon **name** (a string, never raw SVG); map it to your glyph
> set (placeholder if unknown). The spacer/background chip glyph is cosmetic
> (dashboard-only) — the player renders those elements as a gap / a layer, not as an
> icon.

---

## 7a. `Volume` — the hover slider

`Volume` sits on the bar as a plain icon; its slider appears **on demand**. Not in
the JSON — behavior, implemented per platform:

- **Trigger:** hover (desktop) / press (touch).
- **Inline, not overlay** — takes real row space; neighbours shift and a `fill`
  `VideoProgress` shrinks. Never overlaps.
- **Side:** toward the side with ≥150px free, else the roomier one; re-measure per
  reveal.
- **Width:** 150px capped to the row's slack (down to ~60px floor).
- **Lifecycle:** collapses when the pointer leaves; stays open while the thumb is
  held. **Look:** bare range, thumb/track accented with `theme.primary`.

---

## 7b. The `controls` block

An **optional** top-level object, keyed by id, carrying the extra information a stock
player can't infer. Untouched built-ins never appear; the block is **omitted when
empty**. Only **used** ids (on a bar or in `collapseInSetting`) are declared. An
entry can carry any mix of:

> **Declares, doesn't place.** `controls` is a shared lookup table — **one entry per
> used id**, no matter how many viewports use it. A control **renders in a viewport
> only where its id appears in that viewport's `regions` / `collapseInSetting`**; it
> is never drawn just because it has a `controls` entry. So a background / spacer /
> icon added to one viewport does **not** show in the others.

```jsonc
"controls": {
  "CUSTOM_like": { "custom": true, "kind": "icon", "label": "Like", "icon": "Heart" }, // custom control
  "FullScreen": { "icon": "Maximize2" },                                               // icon override
  "CUSTOM_spacer": { "custom": true, "kind": "spacer", "label": "Spacer", "icon": "RectangleHorizontal", "width": 200 },
  "CUSTOM_bg": { "custom": true, "kind": "background", "label": "Background", "icon": "PaintBucket", "paddingX": 4, "radius": 24 },
  "CUSTOM_time_left": { "custom": true, "kind": "text", "label": "Time Left", "icon": "ClockArrowDown", "textType": "timeLeft" }
}
```

**Field reference** (all optional unless noted):

| field            | on                        | meaning                                                                 |
| ---------------- | ------------------------- | ----------------------------------------------------------------------- |
| `custom: true`   | custom/text/spacer/background | this id has no local catalog entry — fully declared                 |
| `kind`           | custom entries            | `icon` \| `text` \| `spacer` \| `background`                            |
| `label`          | custom entries            | display name                                                            |
| `icon`           | any                       | a Lucide **name**; overrides the catalog glyph for a built-in           |
| `textType`+extras| text                      | see [§7c](#7c-text-controls)                                            |
| `width`          | spacer                    | spacer width (px)                                                       |
| `paddingX/Y`,`radius` | background           | lane-background inset + corner radius (§7d)                             |

> **Per-icon `size` and `background` are NOT here** — they are per-viewport, in
> `viewports[].styles` (§7e), so the same icon can differ across viewports.
> **Color/opacity are never per-control** — every background (lane and per-icon) is
> filled with `theme.backgroundColor` at `theme.backgroundOpacity`.

### Resolution rules

For any item id (in `items` **or** `collapseInSetting`), pass the **identity** decl
(`controls = layout.controls ?? {}`) **and** the selected viewport's per-icon
**style** (`style = vp.styles?.[id]`, §7e):

```ts
function resolveControl(id, controls, style) {
  const decl = controls[id];
  const kind = decl?.custom ? (decl.kind ?? "icon") : REGISTRY[id].kind;
  const iconName = decl?.icon ?? CATALOG_ICON[id];            // declared icon WINS
  const icon = resolveLucide(iconName) ?? PLACEHOLDER_ICON;
  const size = style?.size ?? theme.iconSize;                 // per-VIEWPORT size override
  const iconBg = style?.background;                           // per-VIEWPORT { padding, radius } | undefined
  const width = decl?.width;                                  // spacer
  const bgPad = { x: decl?.paddingX, y: decl?.paddingY, r: decl?.radius }; // lane background
  const textFormat = decl?.custom && decl.kind === "text" ? textFormatFor(decl) : REGISTRY[id]?.textFormat;
  return { kind, icon, size, iconBg, width, bgPad, textFormat, onActivate: REGISTRY[id]?.onActivate };
}
```

- **`icon` is always a Lucide name string.** Map it to your glyph set; placeholder if
  unknown.
- A declared `icon` **overrides** the catalog glyph; the id, `kind`, and behavior are
  otherwise unchanged.
- **No built-in behavior for customs.** A custom control renders but does nothing
  unless the **host app** registers a handler for its `CUSTOM_*` id.

---

## 7c. Text controls

A **text control** is a `controls` entry with `"kind": "text"` and a **`textType`**.
Rendered on the ordinary `kind: "text"` path (a `<span>`/`Text`); the formatter comes
from the declaration, not a catalog entry.

| `textType`       | id form      | renders                              | extra field           |
| ---------------- | ------------ | ------------------------------------ | --------------------- |
| `timeConsumed`   | `CUSTOM_*`   | elapsed time `HH:MM`                 | —                     |
| `timeLeft`       | `CUSTOM_*`   | remaining time `HH:MM`               | —                     |
| `timeDuration`   | `CUSTOM_*`   | total duration `HH:MM`               | —                     |
| `timeAll`        | `CUSTOM_*`   | `elapsed` + `separator` + `duration` | `separator` (`" / "`) |
| `currentChapter` | `CUSTOM_*`   | current chapter **title**            | `showNumber` (bool)   |
| `dynamicText`    | `cdt_*`      | value of the `variable`, set at load | `variable` (`cdt_*`)  |
| `title`          | `CUSTOM_*`   | the video title                      | —                     |

```ts
function textFormatFor(decl) {
  switch (decl.textType) {
    case "timeConsumed":   return (s) => fmt(s.t);
    case "timeLeft":       return (s) => fmt(s.dur - s.t);
    case "timeDuration":   return (s) => fmt(s.dur);
    case "timeAll":        return (s) => `${fmt(s.t)}${decl.separator ?? " / "}${fmt(s.dur)}`;
    case "currentChapter": return (s) => decl.showNumber
      ? `${s.chapter.title} ${pad(s.chapter.index)}/${pad(s.chapter.count)}` : s.chapter.title;
    case "dynamicText":    return (s) => s.variables[decl.variable] ?? "";
    case "title":          return (s) => s.title;
  }
}
```

- A text control has **no `onActivate`** (passive readout; never collapsible).
- `dynamicText` renders host-supplied text: its id **and** `variable` are a
  `cdt_`-prefixed name; the host provides the value at load
  (`player.setVariable("cdt_promoName", "Summer Sale")`). Render empty until set.
- `separator` / `showNumber` / `variable` appear only on the relevant `textType`.

---

## 7d. Spacers & backgrounds

Two ways to shape the bar with blank/decorative elements. Both are `controls` entries
and, for lane elements, appear inline in a lane's `items`.

**Spacer** (`kind: "spacer"`). A blank block that adds horizontal space; it stretches
to the lane/row height and is `width` px wide. Render it as an empty fixed-width box
inline at its position in `items` (no glyph, no behavior).

```ts
case "spacer": return spacerBox(c.width); // width px; full height; transparent
```

**Lane background** (`kind: "background"`). A translucent color layer behind a lane's
controls. It's inline in `items`, but **not** rendered inline — pull it out and draw
it as a backdrop for its lane:

- **snaps horizontally** to that lane's other controls (their bounding box grown by
  `paddingX` — default `2`);
- **fills the full row height** (grown by `paddingY` — default `4`);
- sits **behind** the lane's items;
- filled with `theme.backgroundColor` at `theme.backgroundOpacity`, corners rounded by
  `radius` (default `4`).

```ts
// Web sketch: lane is position:relative; the layer is an absolute child behind items.
function renderLaneBackground(c, laneEl /* holds the non-background items */) {
  const layer = div("bg");
  layer.style.background = rgba(theme.backgroundColor, theme.backgroundOpacity);
  layer.style.borderRadius = `${c.bgPad.r ?? 4}px`;
  // inset: -paddingX left/right (hug the lane's items), -paddingY top/bottom to the row box
  positionBehind(layer, laneEl, { x: c.bgPad.x ?? 2, y: c.bgPad.y ?? 4 });
  return layer; // z-index below the lane's items
}
```

**Per-icon background** (the `background` field in a viewport's `styles[id]`, §7e —
**per-viewport**). A shape drawn directly behind **one glyph** — a circle or badge
that hugs just that icon, independent of lane spacers or row height. `{ padding,
radius }`, filled with the same shared `theme.backgroundColor` / `backgroundOpacity`;
render `border-radius` as `min(radius, 50%)` on the (square) icon+padding box so a
large radius is a full circle.

```ts
case "icon": {
  const btn = iconButton(c.icon, c.size, () => c.onActivate?.(player));
  if (c.iconBg) drawBehindGlyph(btn, {                    // a circle/badge behind THIS icon
    padding: c.iconBg.padding, radius: c.iconBg.radius,
    fill: rgba(theme.backgroundColor, theme.backgroundOpacity),
  });
  return btn;
}
```

> **Which to use?** A **lane background** for a wide segment backdrop (e.g. a pill
> behind a group of top-bar icons). A **per-icon background** for a circle behind a
> single button (e.g. the transport Play / Backward / Forward circles).

---

## 7e. Per-viewport icon styles

Each viewport carries an optional **`styles`** map, keyed by control id, holding the
**per-icon appearance** for icons placed in _that_ viewport. It is how the same
built-in icon can look different across viewports (a bigger `Forward` with a circle in
`default`, a plain `Forward` in `vertical`). Omitted when a viewport has no styled
icons.

```jsonc
"default": {
  "regions": { /* ... */ },
  "collapseInSetting": [],
  "styles": {
    "PlayNPause": { "size": 48, "background": { "padding": 10, "radius": 40 } },
    "Forward":    { "size": 30, "background": { "padding": 10, "radius": 24 } }
  }
}
```

| field        | meaning                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| `size`       | per-icon size (px) for this viewport; overrides `theme.iconSize`            |
| `background` | `{ padding, radius }` — a shape behind this glyph (§7d); shared theme fill  |

- Resolve appearance from **the selected viewport's** `styles[id]`, not the global
  `controls` block (identity only). Missing `styles` / entry ⇒ `theme.iconSize`, no
  per-icon background.
- Only icons carry styles. Spacer width and lane-background padding/radius stay in the
  `controls` decl (they're unique per-instance ids, so already per-viewport in
  practice).

---

## 8. Render algorithm (web reference)

```ts
function renderPlayer(layout, root, player) {
  applyTheme(root, layout.theme);
  const controls = layout.controls ?? {};
  const render = () => {
    const vp = resolveViewport(layout.viewports, player.width); // re-run on resize
    const styles = vp.styles ?? {}; // §7e — per-viewport icon appearance
    root.replaceChildren();
    renderRegions(vp.regions, controls, styles, root, player);
    renderSettingMenu(vp.collapseInSetting, controls, styles, settingHost, player);
  };
  render();
  player.onResize(render);
}

function applyTheme(root, t) {
  root.style.setProperty("--primary", t.primary);
  root.style.setProperty("--secondary", t.secondary);
  root.style.setProperty("--gap", `${t.gap}px`);
  root.style.setProperty("--bar-height", `${t.barHeight}px`);
  root.style.setProperty("--icon-size", `${t.iconSize}px`);
  // shared background + player container padding
  root.style.setProperty("--bg-fill", rgba(t.backgroundColor, t.backgroundOpacity));
  root.style.padding = `${t.paddingY}px ${t.paddingX}px`;
}

function renderLane(lane, group, controls, styles, player) {
  const laneEl = makeLane(lane); // position: relative; items sit above backgrounds
  const backgrounds = [];
  for (const id of group.items) {
    const c = resolveControl(id, controls, styles[id]); // §7e — per-viewport style
    if (c.kind === "background") { backgrounds.push(c); continue; } // draw as backdrop, not inline
    const el = renderControl(id, c, player);
    if (group.fill?.includes(id)) el.classList.add("fill"); // flex: 1
    laneEl.append(el);
  }
  for (const c of backgrounds) laneEl.prepend(renderLaneBackground(c, laneEl)); // behind items
  return laneEl;
}

function renderControl(id, c, player) {
  switch (c.kind) {
    case "icon":   return iconWithOptionalBg(c, player);       // §7d — size + per-icon background
    case "text":   return textReadout(id, c.textFormat);       // §7c
    case "slider": return slider(id, player);
    case "spacer": return spacerBox(c.width);                  // §7d
    // "background" is handled in renderLane (backdrop), never here
  }
}
```

Native renderers follow the same walk (`Column/Row` or `VStack/HStack`), map lanes
and `fill` per [§6](#6-alignment-semantics-lanes--fill), draw spacers as fixed-width
spacers and backgrounds as `Box`/`ZStack` layers, and re-resolve the viewport on
size-class / configuration changes.

---

## 9. Samples

### 9a. Space-between row (`start` + `end` lanes)

```json
{
  "regions": {
    "top": [], "center": [],
    "bottom": [{ "start": { "items": ["Chapters"] },
                "end": { "items": ["Speed", "Quality", "Setting", "FullScreen"] } }]
  },
  "collapseInSetting": []
}
```

### 9b. Narrow viewport — controls folded into Setting

At `≤300`, `Speed` + `Quality` are in the Setting menu; `Setting` appears in `regions`
because `collapseInSetting` is non-empty:

```json
{
  "regions": {
    "top": [], "center": [],
    "bottom": [
      { "start": { "items": ["VideoProgress"], "fill": ["VideoProgress"] } },
      { "start": { "items": ["PlayNPause"] }, "end": { "items": ["Setting", "FullScreen"] } }
    ]
  },
  "collapseInSetting": ["Speed", "Quality"]
}
```

### 9c. Full document (the canonical fixture)

Exactly what the studio emits for its default. It exercises the whole schema:
**both** the landscape `default` and the portrait `vertical` viewport carry a full
design (`490` / `300` fall through), **lane backgrounds** with per-background padding,
per-viewport **`styles`** (the transport circles; note `PlayNPause` differs between
`default` and `vertical`), **200px spacers**, a **fill** slider, a **Time Left** text
control, shared **background** color/opacity, player-container **padding**, and
**collapseInSetting**. Use as the golden fixture for parser tests:

```json
{
  "schemaVersion": "3.1",
  "layoutModel": "region",
  "theme": {
    "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8,
    "backgroundColor": "#000000", "backgroundOpacity": 0.5, "paddingX": 9, "paddingY": 4
  },
  "controls": {
    "CUSTOM_background_3": { "custom": true, "kind": "background", "label": "Background", "icon": "PaintBucket", "paddingX": 4 },
    "CUSTOM_background_2": { "custom": true, "kind": "background", "label": "Background", "icon": "PaintBucket", "paddingX": 5, "paddingY": 5, "radius": 0 },
    "CUSTOM_background": { "custom": true, "kind": "background", "label": "Background", "icon": "PaintBucket", "paddingX": 4 },
    "CUSTOM_background_4": { "custom": true, "kind": "background", "label": "Background", "icon": "PaintBucket", "paddingX": 5, "paddingY": 3, "radius": 0 },
    "CUSTOM_background_5": { "custom": true, "kind": "background", "label": "Background", "icon": "PaintBucket", "paddingX": 5, "paddingY": 5, "radius": 0 },
    "CUSTOM_spacer_3": { "custom": true, "kind": "spacer", "label": "Spacer", "icon": "RectangleHorizontal", "width": 200 },
    "CUSTOM_spacer_2": { "custom": true, "kind": "spacer", "label": "Spacer", "icon": "RectangleHorizontal", "width": 200 },
    "CUSTOM_time_left": { "custom": true, "kind": "text", "label": "Time Left", "icon": "ClockArrowDown", "textType": "timeLeft" }
  },
  "viewports": {
    "490": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "300": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "default": {
      "regions": {
        "top": [
          {
            "start": { "items": ["CUSTOM_background_3", "Cast", "AirPlay"] },
            "end": { "items": ["PictureInPicture", "CUSTOM_background_2", "FullScreen"] }
          }
        ],
        "center": [
          {
            "start": { "items": ["CUSTOM_spacer_3", "Backward"] },
            "center": { "items": ["PlayNPause"] },
            "end": { "items": ["Forward", "CUSTOM_spacer_2"] }
          }
        ],
        "bottom": [
          {
            "center": {
              "items": ["Volume", "VideoProgress", "CUSTOM_background", "CUSTOM_time_left", "Captions", "Setting"],
              "fill": ["VideoProgress"]
            }
          }
        ]
      },
      "collapseInSetting": ["Speed", "CaptionSearch"],
      "styles": {
        "Backward": { "size": 30, "background": { "padding": 10, "radius": 24 } },
        "PlayNPause": { "size": 48, "background": { "padding": 10, "radius": 40 } },
        "Forward": { "size": 30, "background": { "padding": 10, "radius": 24 } }
      }
    },
    "vertical": {
      "regions": {
        "top": [
          {
            "start": { "items": ["CUSTOM_background_3", "Volume"] },
            "end": { "items": ["FullScreen", "CUSTOM_background"] }
          }
        ],
        "center": [
          { "end": { "items": ["CUSTOM_background_5", "Captions"] } },
          { "center": { "items": ["PlayNPause"] }, "end": { "items": ["CUSTOM_background_4", "CaptionSearch"] } },
          { "end": { "items": ["SaveVideoOffline", "CUSTOM_background_2"] } }
        ],
        "bottom": [
          {
            "start": { "items": ["VideoProgress"], "fill": ["VideoProgress"] },
            "end": { "items": ["CUSTOM_time_left"] }
          }
        ]
      },
      "collapseInSetting": [],
      "styles": { "PlayNPause": { "size": 48, "background": { "padding": 6, "radius": 11 } } }
    }
  }
}
```

### 9d. Custom control + icon override

A `CUSTOM_like` button (Lucide `Heart`) and `FullScreen` overridden to `Maximize2`:

```json
{
  "schemaVersion": "3.1",
  "layoutModel": "region",
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8,
             "backgroundColor": "#000000", "backgroundOpacity": 0.5, "paddingX": 9, "paddingY": 4 },
  "controls": {
    "CUSTOM_like": { "custom": true, "kind": "icon", "label": "Like", "icon": "Heart" },
    "FullScreen": { "icon": "Maximize2" }
  },
  "viewports": {
    "default": {
      "regions": {
        "top": [], "center": [],
        "bottom": [
          { "start": { "items": ["VideoProgress"], "fill": ["VideoProgress"] } },
          { "start": { "items": ["PlayNPause"] }, "end": { "items": ["CUSTOM_like", "FullScreen"] } }
        ]
      },
      "collapseInSetting": []
    },
    "490": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "300": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "vertical": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] }
  }
}
```

### 9e. Text controls (Time All + Dynamic Text)

```json
{
  "schemaVersion": "3.1",
  "layoutModel": "region",
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8,
             "backgroundColor": "#000000", "backgroundOpacity": 0.5, "paddingX": 9, "paddingY": 4 },
  "controls": {
    "CUSTOM_time_all": { "custom": true, "kind": "text", "label": "Time All", "icon": "Clock",
                         "textType": "timeAll", "separator": " / " },
    "cdt_promoName": { "custom": true, "kind": "text", "label": "cdt_promoName", "icon": "Braces",
                       "textType": "dynamicText", "variable": "cdt_promoName" }
  },
  "viewports": {
    "default": {
      "regions": {
        "top": [], "center": [],
        "bottom": [
          { "start": { "items": ["VideoProgress"], "fill": ["VideoProgress"] } },
          { "start": { "items": ["CUSTOM_time_all"] }, "end": { "items": ["cdt_promoName", "FullScreen"] } }
        ]
      },
      "collapseInSetting": []
    },
    "490": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "300": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] },
    "vertical": { "regions": { "top": [], "center": [], "bottom": [] }, "collapseInSetting": [] }
  }
}
```

---

## 10. Resilience (player-side rules)

The server guarantees a valid `region` layout, so the player does **not** validate
the schema. Cases it still handles:

| Situation                                  | Player behavior                                               |
| ------------------------------------------ | ------------------------------------------------------------- |
| `playerLayout` missing from metadata       | use built-in default layout                                   |
| Selected viewport has no rows              | fall through to the next wider; `default` is base             |
| Empty/omitted region                       | render nothing for it (valid)                                 |
| `collapseInSetting` empty                  | no Setting menu (and `Setting` absent from bar)               |
| `controls` block absent                    | render every id from the local catalog                        |
| Declared `icon` name unknown to this build | draw a placeholder glyph (don't fail)                         |
| `CUSTOM_*` control with no host handler    | render its glyph; activation is a no-op (decorative)          |
| Text control (`kind: "text"`, `textType`)  | render by `textType` (§7c); passive readout                   |
| `dynamicText` variable not set by host     | render empty until the host sets the `cdt_*` variable         |
| Spacer / background element                | render as a blank gap / a backdrop layer (§7d), never a glyph |
| Missing `size` / `background` / padding     | fall back to `theme.iconSize` / no per-icon bg / default insets |

---

## 11. Checklist for the player team

- [ ] Read `playerLayout` from metadata; default only if absent.
- [ ] Apply the global `theme`: colors, gap, `iconSize`/`barHeight`, the shared
      background fill (`backgroundColor` @ `backgroundOpacity`), and the container
      **padding** (`paddingX` / `paddingY`).
- [ ] Resolve the viewport by player width; **re-resolve on resize** (§3).
- [ ] Walk each row's lanes `start → center → end`; item gap = `theme.gap`, no gap
      between lanes; implement the three alignments + `fill` (§6).
- [ ] Build the `gridIdentifier → {kind, icon, behavior}` registry (all 17).
- [ ] Parse `controls` for identity (glyph/kind/label/text extras, spacer width,
      lane-bg padding/radius) — §7b — with a declared `icon` overriding the catalog
      glyph (placeholder if unknown).
- [ ] Render `kind: "text"` by `textType`; wire `dynamicText` to host `cdt_*`
      variables (§7c).
- [ ] Render **spacers** as fixed-width gaps and **lane backgrounds** as backdrop
      layers behind their lane (snap to the lane's items + padding, fill row height,
      shared fill color) — §7d.
- [ ] Apply per-icon **`size`** and **`background`** from the **selected viewport's
      `styles`** (§7e) — the circle/badge behind the glyph (shared fill,
      `min(radius, 50%)`, §7d); default to `theme.iconSize` / none when absent.
- [ ] Render `Setting` as the menu container; populate from `collapseInSetting` (§4).
- [ ] `Volume`: on-demand inline slider — side + width per reveal, pushes neighbours,
      pinned while dragging (§7a).
- [ ] Bind built-in behavior by id; never read behavior from JSON.
- [ ] Test against the golden fixtures in [§9c](#9c-full-document-the-canonical-fixture),
      [§9d](#9d-custom-control--icon-override), and [§9e](#9e-text-controls-time-all--dynamic-text).
