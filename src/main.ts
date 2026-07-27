// The self-hosted Material Icons ligature font backs every glyph in the studio
// (see icons.ts) — load it before our own styles so `.mi` can build on it.
import "material-icons/iconfont/filled.css";
import "./style.css";
import { Studio } from "./studio";
import { createPalette } from "./ui/palette";
import { createCodePanel } from "./ui/codepanel";
import { el } from "./ui/dom";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app not found");

const studio = new Studio();

// Single Regional Layout canvas — the model chosen out of the POC.
const stageHost = el("div", { class: "stage-host" }, [studio.active().element]);

root.replaceChildren(
  el("header", { class: "app-header" }, [
    el("h1", { class: "brand" }, [
      el("span", { class: "brand-vdo", text: "Vdocipher" }),
      el("span", { class: "brand-sep", text: "/" }),
      el("span", { class: "brand-ps", text: "PlayerStudio" }),
    ]),
    el("p", {
      class: "app-subtitle",
      text: "Design the player control bar with the Regional Layout model and export a cross-platform player.json.",
    }),
  ]),
  el("main", { class: "studio" }, [createPalette(studio), stageHost, createCodePanel(studio)]),
);
