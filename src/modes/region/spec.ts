// Region mode native spec (spec.md): schemaVersion 2.1, layoutModel "region".
// Generated directly from the native region state (exact, not derived). `regions`
// live under per-viewport entries (default | 490 | 300 | 200); each viewport also
// carries its `collapseInSetting` icon list. Theme is shared across viewports.
//
// schemaVersion 2.1 adds a top-level `controls` block: declarations (id, label,
// kind, Lucide icon name) for any USED control that a stock renderer can't resolve
// on its own — i.e. custom controls and icon-overridden built-ins. Untouched
// built-ins stay id-only.

import type { ControlId } from "../../controls";
import { isFill, registry } from "../../registry";
import { LANES, REGION_NAMES, VIEWPORTS } from "./state";
import type { Lane, RegionState, Row } from "./state";

interface Group {
  align: Lane | "fill";
  items: ControlId[];
}

// A row serializes to an array of groups (`Group[]`) — uniform shape regardless
// of group count, so consumers always iterate without branching.
function serializeRow(row: Row): Group[] {
  const groups: Group[] = [];
  for (const lane of LANES) {
    let run: ControlId[] = [];
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
  return groups;
}

// Every control id placed anywhere across all viewports (bar + collapse lists).
function collectUsedIds(state: RegionState): Set<ControlId> {
  const ids = new Set<ControlId>();
  for (const vp of VIEWPORTS) {
    for (const region of REGION_NAMES) {
      for (const row of state.rowsOf(vp, region)) {
        for (const lane of LANES) for (const id of row[lane]) ids.add(id);
      }
    }
    for (const id of state.collapsedOf(vp)) ids.add(id);
  }
  return ids;
}

// Declarations for used controls that a renderer can't resolve on its own.
// Custom → full declaration; overridden built-in → just the new glyph name.
function buildControlDecls(used: Set<ControlId>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of used) {
    const custom = registry.isCustom(id);
    if (!custom && !registry.isOverridden(id)) continue;
    const def = registry.get(id);
    out[id] = custom
      ? {
          custom: true,
          kind: def?.kind ?? "icon",
          label: def?.label ?? id,
          icon: registry.iconOf(id),
          // Text controls carry their flavour + extras so the SDK knows what to render:
          // TimeAll's separator, Dynamic Text's cdt_ variable, and Current Chapter's
          // showNumber flag all ride along.
          ...(def?.textType ? { textType: def.textType } : {}),
          ...(def?.separator !== undefined ? { separator: def.separator } : {}),
          ...(def?.variable !== undefined ? { variable: def.variable } : {}),
          ...(def?.showNumber !== undefined ? { showNumber: def.showNumber } : {}),
        }
      : { icon: registry.iconOf(id) };
  }
  return out;
}

export function buildRegionSpec(state: RegionState) {
  const theme = state.getTheme();
  const viewports: Record<string, unknown> = {};
  for (const vp of VIEWPORTS) {
    const regions: Record<string, unknown[]> = {};
    for (const region of REGION_NAMES) regions[region] = state.rowsOf(vp, region).map(serializeRow);
    viewports[vp] = { regions, collapseInSetting: state.collapsedOf(vp) };
  }
  const controls = buildControlDecls(collectUsedIds(state));
  return {
    schemaVersion: "2.1",
    layoutModel: "region" as const,
    theme: { primary: theme.primary, secondary: theme.secondary, iconSize: 22, barHeight: 40, gap: 8 },
    // Omit when empty so default layouts stay byte-for-byte as before.
    ...(Object.keys(controls).length ? { controls } : {}),
    viewports,
  };
}
