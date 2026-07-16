// Shared stage toolbar: title, undo/redo, theme color pickers, a single
// Background color+opacity tool shared by ALL background layers, plus Reset and
// Clear. Each mode passes its own callbacks and initial theme.

import type { Theme } from "../modes/types";
import { el } from "./dom";

// The minimal slice of the History manager the toolbar needs (keeps toolbar.ts
// decoupled from history.ts).
export interface UndoControls {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(fn: () => void): () => void;
}

export interface ToolbarOpts {
  theme: Theme;
  onPrimary: (hex: string) => void;
  onSecondary: (hex: string) => void;
  // Background color+opacity is a single shared setting; preview fires live
  // (direct DOM), commit fires on release (one undo step).
  onBackground: (hex: string, opacity: number) => void;
  onBackgroundPreview: (hex: string, opacity: number) => void;
  // Opens the global .Player container padding tool, anchored to its button.
  onPlayerPaddingClick: (anchor: HTMLElement) => void;
  onReset: () => void;
  onClear: () => void;
  history: UndoControls;
}

export function createToolbar(opts: ToolbarOpts): HTMLElement {
  const primaryInput = el("input", { type: "color", title: "Primary color (progress)" }) as HTMLInputElement;
  primaryInput.value = opts.theme.primary;
  primaryInput.addEventListener("input", () => opts.onPrimary(primaryInput.value));

  const secondaryInput = el("input", { type: "color", title: "Secondary color (icons)" }) as HTMLInputElement;
  secondaryInput.value = opts.theme.secondary;
  secondaryInput.addEventListener("input", () => opts.onSecondary(secondaryInput.value));

  // ---- Shared Background color + opacity ----
  const bgColor = el("input", { type: "color", title: "Background color (all backgrounds)" }) as HTMLInputElement;
  bgColor.value = opts.theme.bgColor;
  const bgOpacity = el("input", { type: "range", title: "Background opacity" }) as HTMLInputElement;
  bgOpacity.className = "bg-opacity";
  bgOpacity.min = "0";
  bgOpacity.max = "100";
  bgOpacity.value = String(Math.round(opts.theme.bgOpacity * 100));
  const readBg = () => [bgColor.value, Number(bgOpacity.value) / 100] as const;
  bgColor.addEventListener("input", () => opts.onBackgroundPreview(...readBg()));
  bgColor.addEventListener("change", () => opts.onBackground(...readBg()));
  bgOpacity.addEventListener("input", () => opts.onBackgroundPreview(...readBg()));
  bgOpacity.addEventListener("change", () => opts.onBackground(...readBg()));

  // ---- Undo / redo ----
  const undoBtn = el("button", { class: "btn btn-icon", title: "Undo (Cmd/Ctrl+Z)", text: "↶" });
  const redoBtn = el("button", { class: "btn btn-icon", title: "Redo (Cmd/Ctrl+Shift+Z)", text: "↷" });
  undoBtn.setAttribute("aria-label", "Undo");
  redoBtn.setAttribute("aria-label", "Redo");
  undoBtn.addEventListener("click", () => opts.history.undo());
  redoBtn.addEventListener("click", () => opts.history.redo());
  const syncHistory = () => {
    (undoBtn as HTMLButtonElement).disabled = !opts.history.canUndo();
    (redoBtn as HTMLButtonElement).disabled = !opts.history.canRedo();
  };
  opts.history.subscribe(syncHistory);
  syncHistory();

  const paddingBtn = el("button", { class: "btn", title: "Player container padding", text: "Padding" });
  paddingBtn.addEventListener("click", () => opts.onPlayerPaddingClick(paddingBtn));

  const resetBtn = el("button", { class: "btn", text: "Reset" });
  resetBtn.addEventListener("click", opts.onReset);
  const clearBtn = el("button", { class: "btn", text: "Clear all" });
  clearBtn.addEventListener("click", opts.onClear);

  return el("div", { class: "toolbar" }, [
    el("h2", { class: "panel-title", text: "Player" }),
    undoBtn,
    redoBtn,
    el("div", { class: "toolbar-spacer" }),
    el("label", { class: "color-picker", title: "Primary" }, [primaryInput, document.createTextNode(" Primary")]),
    el("label", { class: "color-picker", title: "Secondary" }, [secondaryInput, document.createTextNode(" Secondary")]),
    el("label", { class: "color-picker", title: "Background" }, [bgColor, bgOpacity, document.createTextNode(" Background")]),
    paddingBtn,
    resetBtn,
    clearBtn,
  ]);
}
