// Generate the output CSS a user takes away: grid-area rules for placed controls,
// display:none for the rest. Mirrors the format shown in task.md.

import { CONTROLS } from "./controls";
import { toGridArea } from "./grid";
import type { PlacementState } from "./state";

export function generateCss(state: PlacementState): string {
  const placed = new Set(state.entries().map(([id]) => id));
  const rules: string[] = [];

  for (const [id, { row, col, colSpan }] of state.entries()) {
    rules.push(
      `.${id} {\n` +
        `  grid-area: ${toGridArea(row, col, colSpan)};\n` +
        `  display: flex;\n` +
        `  justify-content: center;\n` +
        `  align-items: center;\n` +
        `}`,
    );
  }

  for (const c of CONTROLS) {
    if (!placed.has(c.id)) {
      rules.push(`.${c.id} {\n  display: none;\n}`);
    }
  }

  return rules.length ? rules.join("\n\n") : "/* Drop controls into the player to generate CSS */";
}
