// Region mode native spec (spec.md), layoutModel "region". Generated directly
// from the native region state (exact, not derived). `regions` live under
// per-viewport entries (default | 490 | 300 | vertical); each viewport also
// carries its `collapseInSetting` icon list. Theme is shared across viewports.
//
// A row is lane-keyed: `start` | `center` | `end` → { items, fill? }, empty
// lanes omitted. Fill controls stay inline in their lane's `items` (their
// position in the sequence is preserved); the lane's `fill` list only flags
// which of them stretch.
//
// An `icon` is a MATERIAL icon name (its own catalog key, e.g. "play_arrow"); a
// spacer's `width` and theme.paddingX / paddingY are PERCENTAGES of the player
// container. The `controls` block declares EVERY used id so each carries its
// icon name — see buildControlDecls.
//
// There is ONE schema — this one. The document carries no version field: it is
// produced and consumed by the current code on both sides, so there is nothing
// to negotiate and no older shape to stay compatible with. Changing the shape
// means changing the renderers, not adding a branch.

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

// IDENTITY declarations for EVERY control used in the document — its Material
// `icon` name always, plus (for customs) kind/label/text extras, spacer width,
// and lane-background padding/radius.
//
// Every used id gets an entry, built-in or not, because a contract id is a
// BEHAVIOR key, not a glyph: nothing in "CaptionSearch" derives "manage_search",
// and only 4 of the 17 built-ins (airplay / cast / fullscreen / speed) survive
// naive lowercasing. Emitting the name for stock built-ins too keeps the document
// self-describing, so no platform has to ship — and keep in sync — its own copy
// of the BUILTINS table (controls.ts). A renderer resolves the name in its own
// Material set; it never needs a default table.
//
// Per-icon size and per-icon background are per-VIEWPORT and emitted in each
// viewport's `styles` (see buildViewportStyles), not here.
function buildControlDecls(used: Set<ControlId>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of used) {
    const custom = registry.isCustom(id);
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
          // Spacer width (% of the player container width); lane-background
          // padding/radius in px (unique CUSTOM_* ids, so per-instance already).
          // Background color+opacity are shared (theme).
          ...(def?.kind === "spacer" && def?.width !== undefined ? { width: def.width } : {}),
          ...(def?.kind === "background" && def?.paddingX !== undefined ? { paddingX: def.paddingX } : {}),
          ...(def?.kind === "background" && def?.paddingY !== undefined ? { paddingY: def.paddingY } : {}),
          ...(def?.kind === "background" && def?.radius !== undefined ? { radius: def.radius } : {}),
        }
      // Built-in: its effective glyph — the override when one is set, otherwise
      // the catalog default. Either way the name is stated, never implied.
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
      // Padding of the whole player container, as a percentage of its box:
      // X of the width, Y of the height.
      paddingX: theme.playerPadX,
      paddingY: theme.playerPadY,
    },
    // Only empty when the document places nothing at all.
    ...(Object.keys(controls).length ? { controls } : {}),
    viewports,
  };
}
