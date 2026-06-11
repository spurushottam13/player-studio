// Region mode native spec (spec.md): schemaVersion 1.0, layoutModel "region".
// Generated directly from the native region state (exact, not derived).

import { isFill } from "../../controls";
import type { GridIdentifier } from "../../controls";
import { LANES, REGION_NAMES } from "./state";
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
  const regions: Record<string, unknown[]> = {};
  for (const region of REGION_NAMES) regions[region] = state.rows(region).map(serializeRow);
  return {
    schemaVersion: "1.0",
    layoutModel: "region" as const,
    theme: { primary: theme.primary, secondary: theme.secondary, iconSize: 22, barHeight: 40, gap: 8 },
    regions,
  };
}
