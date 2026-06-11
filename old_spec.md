# Player Layout Spec — Grid Coordinate Model (JSON) — SUPERSEDED

> **Status:** superseded by [`spec.md`](./spec.md) (stack / regions model).
> Kept for reference. This document describes exporting the current Player Studio
> grid as platform-neutral JSON. See [§5](#5-why-this-was-superseded) for why we
> moved on.

This model serializes the studio's existing 13×5 CSS grid directly: every placed
control carries an absolute `row / col / colSpan`. It is the smallest possible
change from today's CSS output, because the studio's internal state is already
this shape.

---

## 1. Architecture

```
   Player Studio (web)  ──exports──>  player.json
        │
        ├── cssgen      → CSS grid-area rules (web)
        ├── Android     → custom Compose grid Layout
        └── iOS         → SwiftUI Grid / LazyVGrid
```

The JSON carries a **grid definition**, **design tokens**, and a flat list of
**placed controls**. Unplaced controls are simply absent.

---

## 2. The grid: semantic tracks (not raw pixels)

The web grid is `35px 35px 35px 105px auto 35px ×8`. Do **not** ship literal px —
that loses the `auto` column and span semantics. Express each track
semantically so it maps to all platforms:

| Track form                              | CSS      | Android (Compose)       | iOS (SwiftUI)            |
| --------------------------------------- | -------- | ----------------------- | ------------------------ |
| `{ "type": "fixed", "value": 35 }`      | `35px`   | `Modifier.width(35.dp)` | `GridItem(.fixed(35))`   |
| `{ "type": "flex", "weight": 1 }`       | `1fr`    | `Modifier.weight(1f)`   | `GridItem(.flexible())`  |

Values are density-independent design points (web px ≈ Android dp ≈ iOS pt).
Spans stay integer cell counts.

---

## 3. JSON shape

```jsonc
{
  "schemaVersion": "1.0",
  "grid": {
    "columns": [ /* Track[] */ ],   // 13 tracks
    "rows":    [ /* Track[] */ ]    // 5 tracks
  },
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22 },
  "controls": [
    { "id": "PlayNPause", "row": 4, "col": 2, "colSpan": 1, "align": "center" }
  ]
}
```

`row` / `col` are 1-indexed. `colSpan` defaults to 1.

---

## 4. Worked example (default layout)

```json
{
  "schemaVersion": "1.0",
  "grid": {
    "columns": [
      { "type": "fixed", "value": 35 }, { "type": "fixed", "value": 35 },
      { "type": "fixed", "value": 35 }, { "type": "fixed", "value": 105 },
      { "type": "flex",  "weight": 1 },
      { "type": "fixed", "value": 35 }, { "type": "fixed", "value": 35 },
      { "type": "fixed", "value": 35 }, { "type": "fixed", "value": 35 },
      { "type": "fixed", "value": 35 }, { "type": "fixed", "value": 35 },
      { "type": "fixed", "value": 35 }, { "type": "fixed", "value": 35 }
    ],
    "rows": [
      { "type": "fixed", "value": 40 }, { "type": "flex", "weight": 1 },
      { "type": "fixed", "value": 25 }, { "type": "fixed", "value": 25 },
      { "type": "fixed", "value": 25 }
    ]
  },
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 22 },
  "controls": [
    { "id": "Backward",         "row": 4, "col": 1,  "colSpan": 1,  "align": "center" },
    { "id": "PlayNPause",       "row": 4, "col": 2,  "colSpan": 1,  "align": "center" },
    { "id": "Forward",          "row": 4, "col": 3,  "colSpan": 1,  "align": "center" },
    { "id": "VideoProgress",    "row": 4, "col": 4,  "colSpan": 10, "kind": "slider" },
    { "id": "PictureInPicture", "row": 1, "col": 13, "colSpan": 1,  "align": "center" },
    { "id": "TimeAll",          "row": 5, "col": 1,  "colSpan": 3,  "kind": "text" },
    { "id": "Speed",            "row": 5, "col": 10, "colSpan": 1,  "align": "center" },
    { "id": "Quality",          "row": 5, "col": 11, "colSpan": 1,  "align": "center" },
    { "id": "Setting",          "row": 5, "col": 12, "colSpan": 1,  "align": "center" },
    { "id": "FullScreen",       "row": 5, "col": 13, "colSpan": 1,  "align": "center" }
  ]
}
```

This is a 1:1 serialization of `DEFAULT_LAYOUT` in `src/state.ts`, so `cssgen.ts`
could be refactored to consume the JSON — proving the JSON is sufficient for the
native teams too.

---

## 5. Why this was superseded

The grid model is faithful to the current studio but is the wrong primitive for a
control bar handed to native teams:

- **Not responsive** — fixed-px columns don't adapt across player widths; the
  `auto` column is a single escape hatch.
- **No intent** — `col: 13` doesn't say "pin right," it just lands there.
- **Custom layout on Android** — Compose has no arbitrary-span grid, so each
  native team must hand-write a `Layout` to interpret tracks + spans.
- **Reflow complexity** leaks — span math and overlap handling must be
  re-implemented per platform.

The [stack / regions model](./spec.md) removes all four by describing the bar as
ordered, aligned groups (`start` / `center` / `end` / `fill`) that map directly
to `Row` / `Column` / `HStack` / flexbox. Adopt `spec.md` for the cross-platform
contract; keep this only if arbitrary 2D placement is a hard requirement.
