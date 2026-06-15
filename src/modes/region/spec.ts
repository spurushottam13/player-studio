// Region mode native spec (spec.md): schemaVersion 2.0, layoutModel "region".
// Generated directly from the native region state (exact, not derived). `regions`
// live under per-viewport entries (default | 490 | 300 | 200); each viewport also
// carries its `collapseInSetting` icon list. Theme is shared across viewports.

import { isFill } from "../../controls";
import type { GridIdentifier } from "../../controls";
import { LANES, REGION_NAMES, VIEWPORTS } from "./state";
import type { Lane, RegionState, Row } from "./state";

interface Group {
  align: Lane | "fill";
  items: GridIdentifier[];
}

function serializeRow(row: Row) {
  const groups: Group[] = [];
  for (const lane of LANES) {
    let run: GridIdentifier[] = [];
    const flush = () => {
      if (run.length) groups.push({ align: lane, items: run });
      run = [];
    };
    for (const id of row[lane]) {
      if (isFill(id)) {
        flush();
        groups.push({ align: "fill", items: [id] });
      } else {
        run.push(id);
      }
    }
    flush();
  }
  return groups.length === 1 ? groups[0] : { groups };
}

export function buildRegionSpec(state: RegionState) {
  const theme = state.getTheme();
  const viewports: Record<string, unknown> = {};
  for (const vp of VIEWPORTS) {
    const regions: Record<string, unknown[]> = {};
    for (const region of REGION_NAMES) regions[region] = state.rowsOf(vp, region).map(serializeRow);
    viewports[vp] = { regions, collapseInSetting: state.collapsedOf(vp) };
  }
  return {
    schemaVersion: "2.0",
    layoutModel: "region" as const,
    theme: { primary: theme.primary, secondary: theme.secondary, iconSize: 22, barHeight: 40, gap: 8 },
    viewports,
  };
}
