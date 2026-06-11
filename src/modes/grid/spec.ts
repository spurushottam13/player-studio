// Grid mode native spec (old_spec.md): schemaVersion 1.0, layoutModel "grid".
// Generated directly from native grid placements (row / col / colSpan).

import { CONTROL_BY_ID } from "../../controls";
import type { GridState } from "./state";

const F = (value: number) => ({ type: "fixed" as const, value });
const FLEX = { type: "flex" as const, weight: 1 };
const GRID_COLUMNS = [F(35), F(35), F(35), F(105), FLEX, F(35), F(35), F(35), F(35), F(35), F(35), F(35), F(35)];
const GRID_ROWS = [F(40), FLEX, F(25), F(25), F(25)];

export function buildGridSpec(state: GridState) {
  const theme = state.getTheme();
  return {
    schemaVersion: "1.0",
    layoutModel: "grid" as const,
    grid: { columns: GRID_COLUMNS, rows: GRID_ROWS },
    theme: { primary: theme.primary, secondary: theme.secondary, iconSize: 22 },
    controls: state.entries().map(([id, p]) => ({
      id,
      kind: CONTROL_BY_ID.get(id)?.kind ?? "icon",
      row: p.row,
      col: p.col,
      colSpan: p.colSpan,
    })),
  };
}
