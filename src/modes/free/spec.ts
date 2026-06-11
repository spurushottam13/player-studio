// Free mode native spec (free_spec.md): schemaVersion 2.0, layoutModel "free".

import { CONTROL_BY_ID } from "../../controls";
import type { FreeState } from "./state";

const round = (n: number) => Math.round(n * 1000) / 1000;

export function buildFreeSpec(state: FreeState) {
  const theme = state.getTheme();
  return {
    schemaVersion: "2.0",
    layoutModel: "free" as const,
    canvas: { aspectRatio: "16:9", safeInset: 14 },
    theme: { primary: theme.primary, secondary: theme.secondary, iconSize: 24 },
    controls: state.entries().map(([id, p]) => {
      const c: Record<string, unknown> = {
        id,
        kind: CONTROL_BY_ID.get(id)?.kind ?? "icon",
        x: round(p.x),
        y: round(p.y),
        anchorX: p.anchorX,
        anchorY: p.anchorY,
      };
      if (typeof p.width === "number") c.width = { fraction: round(p.width) };
      return c;
    }),
  };
}
