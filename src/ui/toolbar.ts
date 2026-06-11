// Shared stage toolbar: title, theme color pickers, Reset and Clear. Each mode
// passes its own callbacks and initial theme.

import type { Theme } from "../modes/types";
import { el } from "./dom";

export interface ToolbarOpts {
  theme: Theme;
  onPrimary: (hex: string) => void;
  onSecondary: (hex: string) => void;
  onReset: () => void;
  onClear: () => void;
}

export function createToolbar(opts: ToolbarOpts): HTMLElement {
  const primaryInput = el("input", { type: "color", title: "Primary color (progress)" }) as HTMLInputElement;
  primaryInput.value = opts.theme.primary;
  primaryInput.addEventListener("input", () => opts.onPrimary(primaryInput.value));

  const secondaryInput = el("input", { type: "color", title: "Secondary color (icons)" }) as HTMLInputElement;
  secondaryInput.value = opts.theme.secondary;
  secondaryInput.addEventListener("input", () => opts.onSecondary(secondaryInput.value));

  const resetBtn = el("button", { class: "btn", text: "Reset" });
  resetBtn.addEventListener("click", opts.onReset);
  const clearBtn = el("button", { class: "btn", text: "Clear all" });
  clearBtn.addEventListener("click", opts.onClear);

  return el("div", { class: "toolbar" }, [
    el("h2", { class: "panel-title", text: "Player" }),
    el("div", { class: "toolbar-spacer" }),
    el("label", { class: "color-picker", title: "Primary" }, [primaryInput, document.createTextNode(" Primary")]),
    el("label", { class: "color-picker", title: "Secondary" }, [secondaryInput, document.createTextNode(" Secondary")]),
    resetBtn,
    clearBtn,
  ]);
}
