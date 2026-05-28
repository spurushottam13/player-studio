# Player Studio — Implementation Plan

A drag‑and‑drop studio where a user composes a custom video‑player UI by dragging
the 21 available controls into a 13×5 CSS‑Grid `.Player` container. Most controls
occupy a single cell; wide controls (`VideoProgress`, `Volume`, …) can be **resized
horizontally** to span multiple cells. The output is a live preview plus the
generated CSS (`grid-area` rules per placed control, `display: none` for the rest).

## 0. Gaps in `task.md` this plan fills

`task.md` describes placement only as `grid-area: row / col / auto / auto` — i.e.
every control is **exactly one cell** and can never grow. It omits:

- **Horizontal resize / column span.** The `column-end` line is always `auto`, so
  there is no way to widen a control. Controls that are inherently wide
  (`VideoProgress` scrubber, `Volume` slider, time clusters) have no special handling.
- **A resize affordance** (handle, snapping to cell boundaries, clamping at the grid
  edge) and how it maps back to generated CSS.
- **Default-span metadata** — which controls start wider than one cell.

This plan adds a `colSpan` to placement state, a right-edge resize handle, and
extends the generated `grid-area` to encode the span. Vertical resize is left out of
scope for v1 (the controls live on single-height rows); only **horizontal** resize is
supported, per the requirement.

## 1. Tech stack & constraints (from the current repo)

- **Build:** Vite 8 + TypeScript 6 (`npm run dev` / `build` / `preview`).
- **No UI framework** — vanilla TS + DOM, matching the existing `src/main.ts`
  that only does `import "./style.css"`.
- **Icons:** the installed `lucide` (v1.17) vanilla package. It exports named
  `IconNode`s plus `createElement(iconNode)` which returns an `SVGElement`. We use
  `createElement` per icon rather than the `data-lucide` + `createIcons()` scan, so
  icons render deterministically as we build chips/controls in code.
- **TS is strict-ish:** `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`. Keep types `import type`, avoid enums (use `as const` unions).

## 2. File structure (new files under `src/`)

```
src/
  main.ts              # entry: mount studio into #app
  style.css            # all studio + .Player grid styles (currently empty)
  controls.ts          # CONTROLS registry: gridIdentifier, label, lucide icon, defaultSpan, maxSpan
  grid.ts              # grid geometry constants (cols/rows) + cell<->grid-area helpers
  state.ts             # PlacementState: Map<gridIdentifier, {row,col,colSpan}>, pub/sub
  dnd.ts               # HTML5 drag-and-drop wiring (palette source + cell targets)
  resize.ts            # pointer-driven horizontal resize of placed controls (cell-snapped)
  cssgen.ts            # generate the output CSS string from PlacementState
  ui/
    palette.ts         # renders the 21 draggable control chips
    player.ts          # renders .Player grid + drop-zone overlay + placed controls (+ resize handle)
    codepanel.ts       # renders the generated-CSS panel (with copy button)
```

`index.html` `#app` becomes the studio shell (palette | stage | code panel).

## 3. Control registry (`controls.ts`)

One source of truth for all 21 controls. Each entry maps the `gridIdentifier`
(also the CSS class) to a Lucide icon plus span hints: `defaultSpan` (cells the
control occupies when first dropped) and `maxSpan` (cap for resize; `Infinity` =
to grid edge). Most controls are `defaultSpan: 1`; wide ones start larger.

| gridIdentifier   | Lucide icon (import name) | Notes |
| ---------------- | ------------------------- | ----- |
| AirPlay          | `Airplay`                 | |
| Backward         | `Rewind`                  | |
| CaptionSearch    | `TextSearch`              | captions + search |
| Captions         | `Captions`                | |
| Cast             | `Cast`                    | |
| Chapters         | `ListVideo`               | |
| Forward          | `FastForward`             | |
| FullScreen       | `Fullscreen`              | |
| Notification     | `Bell`                    | |
| PictureInPicture | `PictureInPicture`        | |
| PlayNPause       | `Play`                    | |
| Quality          | `Gauge`                   | |
| SaveVideoOffline | `Download`                | |
| Setting          | `Settings`                | |
| Speed            | `Timer`                   | |
| TimeConsumed     | `Clock`                   | |
| TimeLeft         | `ClockArrowDown`          | |
| TimeDuration     | `Clock3`                  | |
| TimeAll          | `Clock`                   | text cluster |
| VideoProgress    | `SlidersHorizontal`       | **wide**: `defaultSpan` ≈ 5, resizable to grid edge |
| Volume           | `Volume2`                 | **wide**: `defaultSpan` ≈ 3, resizable |

```ts
import { Airplay, Rewind, /* … */ Volume2 } from "lucide";
import type { IconNode } from "lucide";

export type GridIdentifier = "AirPlay" | "Backward" | /* … */ "Volume";

export interface ControlDef {
  id: GridIdentifier;     // == CSS class
  label: string;
  icon: IconNode;         // pass to lucide createElement()
  defaultSpan: number;    // cells consumed on first drop (most = 1)
  maxSpan: number;        // resize cap; Number.POSITIVE_INFINITY = to grid edge
}

export const CONTROLS: readonly ControlDef[] = [ /* 21 entries */ ] as const;
```

Icon names are verified against `node_modules/lucide/dist/lucide.d.ts` (all listed
names above exist as exports). If we want PlayNPause to visually toggle, that is a
runtime nicety, not required by the task.

## 4. Grid model (`grid.ts`)

The `.Player` grid from the task, kept verbatim:

```
columns: 35 35 35 105 auto 35 35 35 35 35 35 35 35   → 13 columns
rows:    40 auto 25 25 25                              → 5 rows
```

```ts
export const COLS = 13;
export const ROWS = 5;

// grid-area is 1-indexed: row-start / col-start / row-end / col-end
// 1 cell  -> "r / c / auto / auto"        (matches task.md exactly)
// N cells -> "r / c / auto / span N"      (horizontal resize)
export const toGridArea = (row: number, col: number, colSpan = 1) =>
  colSpan <= 1
    ? `${row} / ${col} / auto / auto`
    : `${row} / ${col} / auto / span ${colSpan}`;

// largest span that still fits starting at `col` (1-indexed)
export const maxFitSpan = (col: number) => COLS - col + 1;
```

Using `span N` (rather than an absolute end line like `col + N`) keeps the rule
robust if the column template ever changes, and degrades to the spec's exact
`auto / auto` form when `colSpan === 1`. Drop coordinates are derived from which
**drop-zone cell** receives the drop (see §6), so we never reverse-engineer row/col
from pixels.

## 5. Rendering the stage (`ui/player.ts`)

The `.Player` container is rendered exactly per spec, plus an **edit‑mode overlay**
so the user can see and target cells:

- `.Player` — `display:grid`, the template above. Start with `.SHOW-CONTROLS` added
  so the studio preview is visible (`opacity:1`); offer a "Preview (hide grid)" toggle
  that removes the overlay to show the true end-state.
- Two structural background children, taken straight from the task example:
  - `.Player-Visible-Component-Area` → `grid-area: 1 / 1 / 4 / -1` (the video surface).
  - `.Player-Hidden-Component-Area` → `grid-area: 1 / 1 / -1 / -1`.
- **Drop-zone overlay:** 65 transparent `<div class="cell" data-row data-col>` each
  pinned to one grid cell via `grid-area: r / c / auto / auto`. These capture
  `dragover`/`drop`. They sit above the background areas (z-index) but only react
  during a drag; placed controls render above them and remain re-draggable.
- **Placed controls:** flat direct children of `.Player`, one `<div class="<id>">`
  per placed control, each carrying its Lucide SVG, centered with
  `display:flex; justify-content:center; align-items:center`, and an inline
  `grid-area` set from its placement (`row`, `col`, `colSpan`).
- **Resize handle:** each placed control renders a thin grab strip on its right edge
  (`.resize-handle`, shown in edit mode). Dragging it widens/narrows the control in
  whole-cell steps (see §6b). Wide-by-default controls (`VideoProgress`, `Volume`)
  already render multi-cell on first drop.

This matches the spec's requirement that all controls are direct children of
`.Player` in a flat DOM tree.

## 6. Drag-and-drop flow (`dnd.ts`) — native HTML5 DnD

**Source (palette chip):**
- `draggable="true"`; on `dragstart` set `dataTransfer` payload to the
  `gridIdentifier` and `effectAllowed = "copyMove"`.

**Already-placed control (re-drag):**
- Same payload so it can be moved to a new cell.

**Target (overlay cell):**
- `dragover` → `preventDefault()` + highlight cell (`.cell--over`).
- `drop` → read `gridIdentifier`, read `data-row`/`data-col` from the cell, and the
  control's `defaultSpan`. The span is clamped with `maxFitSpan(col)` so a wide
  control dropped near the right edge doesn't overflow the grid. Call
  `state.place(id, {row, col, colSpan})`. State change re-renders that control's
  `grid-area` and the code panel.

**Remove:** dragging a placed control onto a "trash"/palette area (or pressing a ×
on the chip) calls `state.remove(id)` → control returns to `display:none`.

Edge cases handled: dropping where a control already sits just relocates it
(placements keyed by `gridIdentifier`, so one instance per control); dropping the
same control elsewhere moves it.

## 6b. Horizontal resize (`resize.ts`)

Lets the user extend a placed control beyond one cell — required for
`VideoProgress`/`Volume` but available to any control.

- **Affordance:** a `.resize-handle` on the right edge of each placed control,
  `cursor: ew-resize`, visible only in edit mode.
- **Interaction:** Pointer Events (`pointerdown` → capture → `pointermove` →
  `pointerup`). On `pointerdown` record the start cell-column and the control's
  current `colSpan`. On `pointermove`, convert horizontal pointer delta to a number
  of columns crossed and snap to whole cells. Because the grid is non-uniform
  (`35px … 105px … auto …`), compute cell boundaries from the live cell DOM rects
  (`getBoundingClientRect()` of the overlay cells in that row) rather than assuming a
  fixed cell width — the pointer's x maps to the column whose rect contains it, and
  `colSpan = targetCol − startCol + 1`.
- **Clamping:** `colSpan` is clamped to `[1, min(control.maxSpan, maxFitSpan(col))]`
  so it never runs off the right edge of the grid.
- **Live feedback:** during drag, update the element's inline `grid-area` (and a
  highlight of covered cells) every move; commit to `state.resize(id, colSpan)` on
  `pointerup`, which triggers the code-panel regeneration.
- **Scope:** horizontal only for v1 (single-row controls). Vertical resize and the
  fixed background areas (`Player-Visible/Hidden-Component-Area`) are out of scope.
- **Keyboard fallback (optional):** with a control focused, `Shift+→ / Shift+←`
  grow/shrink `colSpan` by one cell — handy and accessible.

## 7. State (`state.ts`)

```ts
type Placement = { row: number; col: number; colSpan: number };
type Listener = () => void;

class PlacementState {
  private map = new Map<GridIdentifier, Placement>();
  place(id, p)         { this.map.set(id, p); this.emit(); }          // drop / move
  resize(id, colSpan)  { const p = this.map.get(id); if (p) { p.colSpan = colSpan; this.emit(); } }
  remove(id)           { this.map.delete(id); this.emit(); }
  entries()            { return [...this.map.entries()]; }
  has(id)              { return this.map.has(id); }
  // subscribe/emit for re-render
}
```

Single store; `palette`, `player`, and `codepanel` all subscribe and re-render
their own slice. (Optional stretch: persist to `localStorage` so a layout survives
reload.)

## 8. Generated CSS (`cssgen.ts` + `ui/codepanel.ts`)

Produce the exact style of output the task shows:

```ts
export function generateCss(state: PlacementState): string {
  const placed = new Set(state.entries().map(([id]) => id));
  const rules: string[] = [];
  for (const [id, { row, col, colSpan }] of state.entries())
    rules.push(`.${id} {\n  grid-area: ${toGridArea(row, col, colSpan)};\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}`);
  for (const c of CONTROLS)
    if (!placed.has(c.id)) rules.push(`.${c.id} {\n  display: none;\n}`);
  return rules.join("\n\n");
}
```

The code panel shows this live with a **Copy** button. This is the real
deliverable a user takes away.

## 9. Styling (`style.css`)

- Studio shell layout (CSS grid / flex: palette left, stage center, code right).
- `.Player` + `.SHOW-CONTROLS` exactly as specified.
- `.Player-Visible-Component-Area` / `.Player-Hidden-Component-Area` per the example.
- `.cell` overlay: faint dashed borders in edit mode, `:hover`/`.cell--over` accent.
- Generic placed-control look (size, color, centering). Per-control fine-tuning
  (e.g. `VideoProgress`/`Volume` rendering a track that stretches `width:100%`
  across their spanned cells) added as needed.
- `.resize-handle`: right-edge grab strip, `cursor: ew-resize`, edit-mode only.
- Palette chips: icon + label, grab cursor, drag affordance.

## 10. Build order (milestones)

1. **Scaffold UI shell** in `index.html`/`main.ts`; render static `.Player` grid +
   background areas; confirm `npm run dev` shows the 600×400 grid.
2. **Control registry + palette** with Lucide icons rendered via `createElement`.
3. **Drop-zone overlay** (65 cells) with visible grid lines in edit mode.
4. **DnD wiring**: palette → cell drop places a centered control at the right
   `grid-area`. Verify with a couple of controls.
5. **State store** + re-render subscriptions; support move and remove (now carries
   `colSpan`).
6. **Horizontal resize** (`resize.ts`): right-edge handle, cell-snapped pointer
   drag, clamping via `maxFitSpan`; wide-by-default controls (`VideoProgress`,
   `Volume`) drop pre-spanned.
7. **CSS code panel** with live `generateCss` output (incl. `span N`) + Copy button.
8. **Polish**: preview toggle, per-control sizing, keyboard resize fallback,
   optional `localStorage` persistence.

## 11. Open questions / assumptions (defaults chosen)

- **One instance per control** (keyed by `gridIdentifier`) — matches "the `.AirPlay`
  class receives a grid-area". Assumed; flag if multiple instances are wanted.
- **Drop granularity = single cell; horizontal resize = multi-cell.** A control
  drops onto one cell (or its `defaultSpan` width) and can then be widened across
  columns via the resize handle. Generated `grid-area` ends in `auto / auto` for a
  1‑cell control (exactly per the spec examples) or `auto / span N` when widened.
  **Vertical** resize is out of scope for v1 — controls stay on a single row.
- **Resize snapping uses live cell rects**, not a fixed cell width, because the
  column template is non-uniform (`35px … 105px … auto`). Assumed acceptable; flag
  if free-pixel (non-snapped) resizing is wanted instead.
- **Lucide icon choices** above are best-fit; trivially swappable in `controls.ts`.
- **Edit overlay vs. preview**: studio defaults to edit mode (grid visible); a toggle
  shows the clean player. The spec's `opacity:0` default is the *embedded* end-state;
  in the studio we keep it visible for authoring.
```
