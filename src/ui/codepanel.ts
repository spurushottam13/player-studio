// Right panel: the live player.json for the ACTIVE mode. The spec format follows
// the editor mode (Grid → old_spec.md, Region → spec.md, Free → free_spec.md), so
// switching the canvas switches the generated spec.

import type { Studio } from "../studio";
import { el } from "./dom";

export function createCodePanel(studio: Studio): HTMLElement {
  const panel = el("aside", { class: "code-panel" });

  const copyBtn = el("button", { class: "btn", text: "Copy" });
  panel.append(
    el("div", { class: "toolbar" }, [
      el("h2", { class: "panel-title", text: "player.json" }),
      el("div", { class: "toolbar-spacer" }),
      copyBtn,
    ]),
  );

  const note = el("p", { class: "code-note" });
  const code = el("code");
  panel.append(note, el("pre", { class: "code-block" }, [code]));

  const render = () => {
    const active = studio.active();
    code.textContent = active.generateSpec();
    note.textContent = `${active.label} model · ${studio.activeDoc()}`;
  };
  studio.onChange(render);
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
