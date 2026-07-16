// Region mode native spec (spec.md): schemaVersion 3.1, layoutModel "region".
// Generated directly from the native region state (exact, not derived). `regions`
// live under per-viewport entries (default | 490 | 300 | vertical); each viewport also
// carries its `collapseInSetting` icon list. Theme is shared across viewports.
//
// schemaVersion 3.0 replaces the ordered `align` group array with a lane-keyed
// row: `start` | `center` | `end` → { items, fill? }, empty lanes omitted. Fill
// controls stay inline in their lane's `items` (their position in the sequence
// is preserved); the lane's `fill` list only flags which of them stretch.
// The 2.1 `controls` block (declarations for custom / overridden controls) is
// unchanged.

import type { ControlId } from "../../controls";
import { isFill, registry } from "../../registry";
import { LANES, REGION_NAMES, VIEWPORTS } from "./state";
import type { Lane, RegionState, Row, Viewport } from "./state";

interface LaneGroup {
  items: ControlId[];
  fill?: ControlId[];
}
type SerializedRow = Partial<Record<Lane, LaneGroup>>;

// A row serializes lane-keyed. A fill-capable control (slider) is NOT pulled out
// into its own group: it stays at its position in `items` — that position is the
// sequence information — and is repeated in `fill`, which carries only the
// stretch behavior (e.g. start: [Backward, VideoProgress] + end: [Forward]
// renders Backward — VideoProgress (all remaining width) — Forward).
function serializeRow(row: Row): SerializedRow {
  const out: SerializedRow = {};
  for (const lane of LANES) {
    if (!row[lane].length) continue;
    const items = [...row[lane]];
    const fill = items.filter(isFill);
    out[lane] = { items, ...(fill.length ? { fill } : {}) };
  }
  return out;
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

// Declarations for used controls that a renderer can't resolve on its own —
// IDENTITY only (custom kind/label/icon/text + spacer width + lane-background
// padding/radius), plus an icon override's replacement glyph. Per-icon size and
// per-icon background are per-VIEWPORT and emitted in each viewport's `styles`
// (see buildViewportStyles), not here.
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
          // Spacer width; lane-background padding/radius (unique CUSTOM_* ids, so
          // per-instance already). Background color+opacity are shared (theme).
          ...(def?.kind === "spacer" && def?.width !== undefined ? { width: def.width } : {}),
          ...(def?.kind === "background" && def?.paddingX !== undefined ? { paddingX: def.paddingX } : {}),
          ...(def?.kind === "background" && def?.paddingY !== undefined ? { paddingY: def.paddingY } : {}),
          ...(def?.kind === "background" && def?.radius !== undefined ? { radius: def.radius } : {}),
        }
      : { icon: registry.iconOf(id) };
  }
  return out;
}

// Per-viewport icon appearance overrides: for each icon id PLACED in this viewport
// (bar or Setting) that has a non-default size or a per-icon background, emit
// { size?, background? }. Keyed by id; omitted when empty.
function buildViewportStyles(state: RegionState, vp: Viewport): Record<string, unknown> {
  const used = new Set<ControlId>();
  for (const region of REGION_NAMES)
    for (const row of state.rowsOf(vp, region)) for (const lane of LANES) for (const id of row[lane]) used.add(id);
  for (const id of state.collapsedOf(vp)) used.add(id);

  const styles = state.stylesOf(vp);
  const out: Record<string, unknown> = {};
  for (const id of used) {
    const s = styles[id];
    if (!s || (s.size === undefined && !s.iconBg)) continue;
    out[id] = {
      ...(s.size !== undefined ? { size: s.size } : {}),
      ...(s.iconBg ? { background: s.iconBg } : {}),
    };
  }
  return out;
}

export function buildRegionSpec(state: RegionState) {
  const theme = state.getTheme();
  const viewports: Record<string, unknown> = {};
  for (const vp of VIEWPORTS) {
    const regions: Record<string, unknown[]> = {};
    for (const region of REGION_NAMES) regions[region] = state.rowsOf(vp, region).map(serializeRow);
    const styles = buildViewportStyles(state, vp);
    viewports[vp] = {
      regions,
      collapseInSetting: state.collapsedOf(vp),
      ...(Object.keys(styles).length ? { styles } : {}),
    };
  }
  const controls = buildControlDecls(collectUsedIds(state));
  return {
    // 3.1: adds spacer/background control kinds, per-control size/width/padding/
    // radius decl fields, and shared theme.backgroundColor/backgroundOpacity.
    schemaVersion: "3.1",
    layoutModel: "region" as const,
    theme: {
      primary: theme.primary,
      secondary: theme.secondary,
      iconSize: 22,
      barHeight: 40,
      gap: 8,
      // Shared across all background layers.
      backgroundColor: theme.bgColor,
      backgroundOpacity: theme.bgOpacity,
      // Padding of the whole player container (px).
      paddingX: theme.playerPadX,
      paddingY: theme.playerPadY,
    },
    // Omit when empty so default layouts stay byte-for-byte as before.
    ...(Object.keys(controls).length ? { controls } : {}),
    viewports,
  };
}
