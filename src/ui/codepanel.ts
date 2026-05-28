// Right panel: live generated CSS with a copy button.

import { generateCss } from "../cssgen";
import type { PlacementState } from "../state";
import { el } from "./dom";

export function createCodePanel(state: PlacementState): HTMLElement {
  const panel = el("aside", { class: "code-panel" });

  const copyBtn = el("button", { class: "btn", text: "Copy" });
  const header = el("div", { class: "toolbar" }, [
    el("h2", { class: "panel-title", text: "Generated CSS" }),
    el("div", { class: "toolbar-spacer" }),
    copyBtn,
  ]);

  const code = el("code");
  const pre = el("pre", { class: "code-block" }, [code]);

  panel.append(header, pre);

  const render = () => {
    code.textContent = generateCss(state);
  };
  state.subscribe(render);
  render();

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent ?? "");
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    }
  });

  return panel;
}
