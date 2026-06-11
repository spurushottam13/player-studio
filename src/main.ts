import "./style.css";
import { Studio } from "./studio";
import { createPalette } from "./ui/palette";
import { createCodePanel } from "./ui/codepanel";
import { el } from "./ui/dom";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app not found");

const studio = new Studio();

// Mode switcher (Grid / Region / Free). Switching swaps the active canvas + spec.
const modeButtons = new Map<string, HTMLElement>();
const modebar = el("div", { class: "modebar" }, [el("span", { class: "modebar-label", text: "Layout model" })]);
const seg = el("div", { class: "seg" });
for (const ed of studio.editors) {
  const btn = el("button", { class: "seg-btn", text: ed.label });
  btn.addEventListener("click", () => studio.setMode(ed.id));
  modeButtons.set(ed.id, btn);
  seg.append(btn);
}
modebar.append(seg);

// Center column holds all three editor panels; only the active one is shown.
const stageHost = el("div", { class: "stage-host" });
for (const ed of studio.editors) stageHost.append(ed.element);

const syncMode = () => {
  for (const ed of studio.editors) ed.element.hidden = ed.id !== studio.mode;
  for (const [id, btn] of modeButtons) btn.classList.toggle("seg-btn--active", id === studio.mode);
};
studio.onChange(syncMode);

root.replaceChildren(
  el("header", { class: "app-header" }, [
    el("h1", { class: "brand" }, [
      el("span", { class: "brand-vdo", text: "Vdocipher" }),
      el("span", { class: "brand-sep", text: "/" }),
      el("span", { class: "brand-ps", text: "PlayerStudio" }),
    ]),
    el("p", {
      class: "app-subtitle",
      text: "Pick a layout model, design the player, and export a cross-platform player.json. Each model has its own canvas, rules, and spec.",
    }),
  ]),
  modebar,
  el("main", { class: "studio" }, [createPalette(studio), stageHost, createCodePanel(studio)]),
);

syncMode();
