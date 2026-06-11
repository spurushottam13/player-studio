# Player Layout Spec (v1) — Stack / Regions Model

Cross-platform contract for describing a video-player control layout once and
rendering it identically on **Web**, **Android**, and **iOS**.

This is the recommended model. The earlier grid-coordinate approach is preserved
in [`old_spec.md`](./old_spec.md) and is **superseded** by this document — see
[Why this replaces the grid model](#why-this-replaces-the-grid-model).

---

## 1. Goals

- **One source of truth.** Player Studio (web) exports a single `player.json`.
  Web, Android, and iOS each render it with a thin, idiomatic layer.
- **Reproducible on native.** Every concept maps to a first-class primitive on
  every platform (no custom layout engine required anywhere).
- **Responsive by intent.** Layout expresses *left / center / right / fill*, not
  pixel coordinates, so it adapts from a 320 px phone to a 1080 px web player.
- **Layout + style only.** Behavior (what `PlayNPause` does) is implemented
  natively, keyed by the control's stable `id`. See [§8](#8-out-of-scope).

---

## 2. Architecture

```
                 ┌─────────────────────────┐
                 │   Player Studio (web)   │   authoring tool
                 │   exports player.json   │
                 └────────────┬────────────┘
                              │  one versioned contract
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
      Web renderer      Android renderer      iOS renderer
      (flexbox)         (Compose Row/Col)     (SwiftUI HStack/VStack)
```

The JSON carries **regions → rows → groups → items** plus **design tokens**.
The control `id`s are the API contract shared across all platforms.

---

## 3. The layout model

A player is a stack of **regions** positioned over the video surface, top to
bottom:

| Region   | Typical use                                              |
| -------- | -------------------------------------------------------- |
| `top`    | Top bar: Cast, PiP, Settings (usually `end`-aligned)     |
| `center` | Center overlay: large Play/Pause, Backward/Forward       |
| `bottom` | Control bar: progress, transport buttons, time, controls |

Each region holds an **ordered list of rows** (stacked vertically). Each **row**
holds one or more **groups**. Each **group** has an `align` and an ordered list
of **items** (control ids).

```
region
└── row (stacked vertically)
    └── group (laid out horizontally)
        ├── align: start | center | end | fill
        └── items: [ "PlayNPause", "Forward", ... ]   ← ordered, left → right
```

### Alignment semantics

| `align`  | Behavior                                                       |
| -------- | -------------------------------------------------------------- |
| `start`  | Packed against the leading (left) edge                         |
| `center` | Centered within the row                                        |
| `end`    | Packed against the trailing (right) edge                       |
| `fill`   | Expands to consume all remaining horizontal space in the row   |

A row with `start` + `end` groups behaves like *space-between*. A row containing
a `fill` group (e.g. `VideoProgress`) lets that control absorb the slack instead
of an empty spacer.

---

## 4. JSON shape

```jsonc
{
  "schemaVersion": "1.0",
  "theme": {
    "primary":   "#1e90ff",   // progress / active accents
    "secondary": "#ffffff",   // icons / text
    "iconSize":  22,           // dp/pt/px (density-independent)
    "barHeight": 40,
    "gap":       8             // spacing between items in a group
  },
  "regions": {
    "top":    [ /* Row[] */ ],
    "center": [ /* Row[] */ ],
    "bottom": [ /* Row[] */ ]
  }
}
```

A **Row** is either the shorthand single-group form:

```jsonc
{ "align": "fill", "items": ["VideoProgress"] }
```

or the multi-group form:

```jsonc
{
  "groups": [
    { "align": "start", "items": ["Backward", "PlayNPause", "Forward"] },
    { "align": "end",   "items": ["Speed", "Quality", "FullScreen"] }
  ]
}
```

A region may be omitted or be an empty array if it has no controls.

---

## 5. Worked example (Player Studio default layout)

The current default layout, expressed in this model:

```json
{
  "schemaVersion": "1.0",
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22, "barHeight": 40, "gap": 8 },
  "regions": {
    "top": [
      { "align": "end", "items": ["PictureInPicture"] }
    ],
    "center": [],
    "bottom": [
      {
        "groups": [
          { "align": "start", "items": ["Backward", "PlayNPause", "Forward"] },
          { "align": "fill",  "items": ["VideoProgress"] }
        ]
      },
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

## 6. Control catalog (the contract)

The `id` is the **gridIdentifier** — the stable key every platform binds behavior
to. Controls absent from the JSON are simply not rendered (no explicit "hidden"
flag needed).

| #  | id                 | kind   | notes                          |
| -- | ------------------ | ------ | ------------------------------ |
| 1  | `AirPlay`          | icon   |                                |
| 2  | `Backward`         | icon   |                                |
| 3  | `CaptionSearch`    | icon   |                                |
| 4  | `Captions`         | icon   |                                |
| 5  | `Cast`             | icon   |                                |
| 6  | `Chapters`         | icon   |                                |
| 7  | `Forward`          | icon   |                                |
| 8  | `FullScreen`       | icon   |                                |
| 9  | `Notification`     | icon   |                                |
| 10 | `PictureInPicture` | icon   |                                |
| 11 | `PlayNPause`       | icon   |                                |
| 12 | `Quality`          | icon   |                                |
| 13 | `SaveVideoOffline` | icon   |                                |
| 14 | `Setting`          | icon   |                                |
| 15 | `Speed`            | icon   |                                |
| 16 | `TimeConsumed`     | text   | `HH:MM`                        |
| 17 | `TimeLeft`         | text   | `HH:MM`                        |
| 18 | `TimeDuration`     | text   | `HH:MM`                        |
| 19 | `TimeAll`          | text   | `HH:MM / HH:MM`                |
| 20 | `VideoProgress`    | slider | typically `fill`               |
| 21 | `Volume`           | slider | `fill`-capable                 |

### Control kinds → rendering

| kind     | Web              | Android (Compose)        | iOS (SwiftUI)            |
| -------- | ---------------- | ------------------------ | ------------------------ |
| `icon`   | `<svg>` button   | `Icon` in `IconButton`   | `Image` in `Button`      |
| `text`   | `<span>`         | `Text`                   | `Text`                   |
| `slider` | `<input range>`  | `Slider`                 | `Slider`                 |

> **Iconography:** the studio uses Lucide. Native teams must ship matching
> glyphs (same SVGs, or agreed SF Symbols / Material equivalents) for visual
> parity. See [§8](#8-out-of-scope).

---

## 7. Cross-platform rendering map

Every primitive in this model is idiomatic on every target — no custom layout
engine:

| Concept            | Web (CSS flexbox)            | Android (Compose)            | iOS (SwiftUI)                   |
| ------------------ | ---------------------------- | ---------------------------- | ------------------------------- |
| region stack       | `flex-direction: column`     | `Column`                     | `VStack`                        |
| row                | `display: flex`              | `Row`                        | `HStack`                        |
| group `start`      | default order                | leading children             | leading                         |
| group `center`     | `margin: auto` / centered    | `Arrangement.Center`         | `Spacer()` both sides           |
| group `end`        | `margin-left: auto`          | `Spacer()` before            | `Spacer()` before               |
| group `fill`       | `flex: 1`                    | `Modifier.weight(1f)`        | `.frame(maxWidth: .infinity)`   |
| item gap           | `gap`                        | `Arrangement.spacedBy(gap)`  | `HStack(spacing: gap)`          |

UIKit / Android View equivalents: `UIStackView` and `LinearLayout` with weights
behave identically if a team is not on SwiftUI/Compose.

---

## 8. Out of scope

This spec defines **layout and style**, not:

- **Behavior** — seeking, play/pause, quality switching, etc. Implemented per
  platform, bound to the control `id`.
- **Iconography assets** — the spec names *which* control; teams must agree on
  the actual glyphs for pixel parity.
- **Player chrome** — video surface, buffering spinner, gesture zones.

---

## 9. Versioning & validation

- `schemaVersion` is **required**. Bump the major on breaking changes; renderers
  must reject a major they don't understand.
- Ship a JSON Schema (`player.schema.json`) so the studio's export and each
  native parser validate against one definition. Validate in CI on both ends.

---

## Why this replaces the grid model

The [grid model](./old_spec.md) placed each control at an absolute `row / col /
colSpan` on a fixed 13×5 grid. It works, but for a control bar it is the wrong
primitive:

- **Not responsive** — fixed-px columns don't adapt across player widths.
- **No intent** — `col: 13` doesn't mean "pinned right," it just lands there at
  one width.
- **Custom layout on Android** — Compose has no arbitrary-span grid; the grid
  model forces a hand-written `Layout`. The stack model uses `Row`/`Column`.
- **Reflow complexity** — preventing overlaps needs non-trivial shifting logic
  that disappears entirely under ordered groups.

The stack model is what production players (YouTube, video.js, ExoPlayer
`PlayerControlView`, AVKit) actually use. Trade-off: it gives up *arbitrary 2D
placement* — which, for a control bar, prevents layouts the native teams can't
reproduce anyway.
