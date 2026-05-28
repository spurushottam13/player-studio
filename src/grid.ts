// Grid geometry for the .Player container and helpers to map cells <-> grid-area.

// 13 columns: 35 35 35 105 auto 35 35 35 35 35 35 35 35
// 5 rows:     40 auto 25 25 25
export const COLS = 13;
export const ROWS = 5;

// grid-area is 1-indexed: row-start / col-start / row-end / col-end
//  1 cell  -> "r / c / auto / auto"     (matches task.md exactly)
//  N cells -> "r / c / auto / span N"   (horizontal resize)
export function toGridArea(row: number, col: number, colSpan = 1): string {
  return colSpan <= 1
    ? `${row} / ${col} / auto / auto`
    : `${row} / ${col} / auto / span ${colSpan}`;
}

// Largest span that still fits when starting at `col` (1-indexed).
export function maxFitSpan(col: number): number {
  return COLS - col + 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
