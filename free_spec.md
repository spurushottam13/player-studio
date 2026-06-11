# Player Layout Spec (v2) — Free Canvas / Anchored Normalized Coordinates

The cross-platform contract for a video-player layout designed on a **free
drag-anywhere canvas**, exported once and rendered identically on **Web**,
**Android**, and **iOS**.

This is the **current model**. It preserves the canvas builder's core promise —
place any control anywhere — while staying portable, by storing positions as
resolution-independent anchored coordinates rather than raw pixels.

Supersedes the earlier structured approaches:
[`spec.md`](./spec.md) (region/stack) and [`old_spec.md`](./old_spec.md) (grid).
See [§9](#9-why-free-beats-grid--region-here).

---

## 1. The idea in one line

> A control is stored as a **normalized point** `(x, y)` in `0..1` of the canvas,
> plus an **anchor** saying which edge/center of the control sits at that point.

No grid, no rows, no lanes. Drop a control anywhere; we record *where* (as a
fraction) and *how it pins* (anchor). That fraction is exactly what native layout
engines already speak — so "anywhere" survives the handoff to Android and iOS.

```
canvas (0,0) ────────────── x → 1
   │   ┌───────────────────────────┐
   │   │ Cast◳                  ◳PiP│   PiP: x=1.0 y=0.0 anchor right/top
   y   │                            │
   ↓   │           ▶                │   Play: x=0.5 y=0.5 anchor center/center
   1   │ ░░░░░░ progress ░░░░░░░     │   Progress: x=0.5 y=0.82 center, width 0.92
       │ 0:00      ◀ ❚❚ ▶      ⚙ ⛶ │   FullScreen: x=1.0 y=0.92 anchor right/bottom
       └───────────────────────────┘
```

---

## 2. Goals & non-goals

**Goals**
- **Total placement freedom** — pixel-free drag to any point (the product USP).
- **Reproducible on native** — fraction → first-class native primitive on each
  platform (no custom layout engine).
- **Survives resize** — controls pin to their nearest edge/center, so corners
  stay in corners and centered things stay centered across screen sizes.

**Non-goals (the honest trade)**
- **No automatic reflow / overlap prevention.** Free placement means the author
  owns the layout; the tool will not rearrange controls to avoid collisions on a
  drastically different screen. Mitigated by edge-anchoring + a safe-area inset,
  not eliminated. This is the deliberate cost of freedom over auto-layout.
- **Behavior** (what `PlayNPause` does) is implemented per platform, keyed by the
  control `id`. The spec is layout + style only.

---

## 3. The coordinate model

### 3.1 Canvas

The canvas is the player's content box, inset by a uniform **safe-area margin**
(`safeInset`, in density-independent units). All `(x, y)` are fractions of this
inset box, so edge-anchored controls never clip against the frame.

### 3.2 Per-control placement

| Field          | Type                              | Meaning                                                              |
| -------------- | --------------------------------- | ------------------------------------------------------------------- |
| `x`            | number `0..1`                     | Horizontal position of the control's **anchor point**.              |
| `y`            | number `0..1`                     | Vertical position of the anchor point.                              |
| `anchorX`      | `"left" \| "center" \| "right"`   | Which vertical edge/center of the control sits at `x`, and pins to. |
| `anchorY`      | `"top" \| "center" \| "bottom"`   | Which horizontal edge/center of the control sits at `y`.            |
| `width`        | `{ "fraction": 0..1 }` (optional) | Sliders only — width as a fraction of the canvas.                   |

The anchor does double duty: it places the control's own reference edge at
`(x, y)` **and** declares which container edge it stays glued to on resize.

### 3.3 Anchor derivation (authoring convenience)

When a control is dropped or moved, the studio auto-derives the anchor from the
position — edge thirds pin to that edge, the middle band stays centered:

```
anchorX = x < 0.33 ? "left"   : x > 0.67 ? "right"  : "center"
anchorY = y < 0.33 ? "top"    : y > 0.67 ? "bottom" : "center"
```

A control dropped in the bottom-right third therefore pins bottom-right and hugs
that corner at any size. (The anchor is a stored field, so a tool may also let the
user override it explicitly.)

---

## 4. JSON shape

```jsonc
{
  "schemaVersion": "2.0",
  "layoutModel": "free",
  "canvas": {
    "aspectRatio": "16:9",
    "safeInset": 14          // dp/pt/px — uniform safe-area margin for (x,y) space
  },
  "theme": {
    "primary": "#1e90ff",    // progress / active accents
    "secondary": "#ffffff",  // icons / text
    "iconSize": 24
  },
  "controls": [
    {
      "id": "FullScreen",    // stable cross-platform id (the gridIdentifier)
      "kind": "icon",        // icon | text | slider
      "x": 1.0, "y": 0.92,
      "anchorX": "right", "anchorY": "bottom"
    },
    {
      "id": "VideoProgress",
      "kind": "slider",
      "x": 0.5, "y": 0.78,
      "anchorX": "center", "anchorY": "center",
      "width": { "fraction": 0.92 }
    }
  ]
}
```

Controls absent from the array are simply not rendered.

---

## 5. Worked example (Player Studio default layout)

```json
{
  "schemaVersion": "2.0",
  "layoutModel": "free",
  "canvas": { "aspectRatio": "16:9", "safeInset": 14 },
  "theme": { "primary": "#1e90ff", "secondary": "#ffffff", "iconSize": 24 },
  "controls": [
    { "id": "PictureInPicture", "kind": "icon",   "x": 1.0,  "y": 0.0,  "anchorX": "right",  "anchorY": "top" },
    { "id": "VideoProgress",    "kind": "slider", "x": 0.5,  "y": 0.78, "anchorX": "center", "anchorY": "center", "width": { "fraction": 0.92 } },
    { "id": "Backward",         "kind": "icon",   "x": 0.43, "y": 0.92, "anchorX": "center", "anchorY": "bottom" },
    { "id": "PlayNPause",       "kind": "icon",   "x": 0.5,  "y": 0.92, "anchorX": "center", "anchorY": "bottom" },
    { "id": "Forward",          "kind": "icon",   "x": 0.57, "y": 0.92, "anchorX": "center", "anchorY": "bottom" },
    { "id": "TimeAll",          "kind": "text",   "x": 0.0,  "y": 0.92, "anchorX": "left",   "anchorY": "bottom" },
    { "id": "Speed",            "kind": "icon",   "x": 0.78, "y": 0.92, "anchorX": "right",  "anchorY": "bottom" },
    { "id": "Quality",          "kind": "icon",   "x": 0.85, "y": 0.92, "anchorX": "right",  "anchorY": "bottom" },
    { "id": "Setting",          "kind": "icon",   "x": 0.92, "y": 0.92, "anchorX": "right",  "anchorY": "bottom" },
    { "id": "FullScreen",       "kind": "icon",   "x": 1.0,  "y": 0.92, "anchorX": "right",  "anchorY": "bottom" }
  ]
}
```

---

## 6. Rendering rules (the same math on every platform)

Given canvas content size `W × H` (after `safeInset`), place each control so its
anchored edge lands at `(x·W, y·H)`:

| `anchorX` | horizontal placement        |
| --------- | --------------------------- |
| `left`    | control left edge at `x·W`  |
| `center`  | control center at `x·W`     |
| `right`   | control right edge at `x·W` |

(`anchorY` is the vertical analogue with top/center/bottom.)

### Reference: web (CSS)

```css
.control {
  position: absolute;
  left: calc(var(--x) * 100%);
  top:  calc(var(--y) * 100%);
  /* translate by the control's OWN size — no width math needed in code */
  transform: translate(var(--tx), var(--ty)); /* tx/ty ∈ {0, -50%, -100%} */
}
```

`left → 0`, `center → -50%`, `right → -100%` (and top/center/bottom for the
vertical axis). The browser resolves the `%` translate against the element's own
box, so the anchored edge lands exactly on `(x, y)` regardless of the control's
intrinsic size.

---

## 7. Cross-platform mapping (why fractions are portable)

The fraction is not a hack — it is the native idiom for resize-safe free
positioning on every platform:

| Concept                | Web (CSS)                       | Android (ConstraintLayout)              | iOS (SwiftUI)                          |
| ---------------------- | ------------------------------- | --------------------------------------- | -------------------------------------- |
| `x` fraction           | `left: x%`                      | `layout_constraintHorizontal_bias = x`  | `.position(x: width * x)`              |
| `y` fraction           | `top: y%`                       | `layout_constraintVertical_bias = y`    | `.position(y: height * y)`             |
| anchor `right`         | `transform: translateX(-100%)`  | `constraintEnd_toEndOf = parent`        | `.frame(alignment: .trailing)`         |
| anchor `center`        | `translateX(-50%)`              | bias handles centering                  | default `.position` centers            |
| `safeInset`            | container `padding` / inset box | `ConstraintLayout` padding              | `.padding(safeInset)`                  |
| `width.fraction` (sld) | `width: f%`                     | `layout_constraintWidth_percent = f`    | `.frame(width: containerWidth * f)`    |

Android's `bias` is **literally a `0..1` fraction**, SwiftUI's `.position` takes
absolute points derived from the fraction, and CSS uses `%` — so a control at
`x: 0.5` is dead-center on a 320 dp phone and a 1280 px web player alike, and an
`anchorX: "right"` control hugs the right edge on both.

UIKit / Android Views fall back cleanly too: `NSLayoutConstraint` multipliers and
`Guideline` percentages express the same fractions.

---

## 8. Control catalog & kinds

The `id` (gridIdentifier) is the stable contract every platform binds behavior to.

| kind     | Controls                                                      | Renders as       | Notes                              |
| -------- | ------------------------------------------------------------ | ---------------- | ---------------------------------- |
| `icon`   | AirPlay, Backward, CaptionSearch, Captions, Cast, Chapters, Forward, FullScreen, Notification, PictureInPicture, PlayNPause, Quality, SaveVideoOffline, Setting, Speed | single glyph     | intrinsic-sized                    |
| `text`   | TimeConsumed, TimeLeft, TimeDuration, TimeAll                | `HH:MM` readout  | intrinsic-sized                    |
| `slider` | VideoProgress, Volume                                        | horizontal range | carries `width.fraction`           |

> **Iconography:** the studio uses Lucide. Native teams must ship matching glyphs
> (same SVGs, or agreed SF Symbols / Material equivalents) for pixel parity. The
> spec names *which* control, not the asset.

---

## 9. Why free beats grid / region here

This model exists because a drag-and-drop canvas builder's value *is* freedom.
The "pick two of three" tension:

```
                 FREEDOM (drop anywhere)
                  /                  \
       PORTABILITY ───────────── AUTO-REFLOW
   (exact on all 3)          (adapts to any size)
```

- **Grid** ([`old_spec.md`](./old_spec.md)) and **Region** ([`spec.md`](./spec.md))
  chose Portability + Auto-reflow, and **sacrificed Freedom** — they dictate where
  controls may sit.
- **Absolute pixels** would give Freedom but lose Portability (breaks across
  densities / sizes).
- **This model** takes **Freedom + Portability**. The price is that "responsive"
  becomes *anchored scaling* (corners hug, center holds) rather than automatic
  reflow — the right trade for a design tool.

---

## 10. Versioning & validation

- `schemaVersion` is **required**; `layoutModel: "free"` distinguishes this from
  the legacy structured models. Renderers must reject a major they don't know.
- Ship a JSON Schema (`player.schema.json`) so the studio's export and each native
  parser validate against one definition, in CI on both ends.
- `x`, `y`, and `width.fraction` are clamped to `0..1`. Coordinates are rounded to
  3 decimals on export.
