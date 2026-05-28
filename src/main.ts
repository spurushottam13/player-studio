import "./style.css";
import { PlacementState } from "./state";
import { createPalette } from "./ui/palette";
import { createPlayer } from "./ui/player";
import { createCodePanel } from "./ui/codepanel";
import { el } from "./ui/dom";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app not found");

const state = new PlacementState();

root.replaceChildren(
  el("header", { class: "app-header" }, [
    el("h1", { class: "brand" }, [
      el("span", { class: "brand-vdo", text: "Vdocipher" }),
      el("span", { class: "brand-sep", text: "/" }),
      el("span", { class: "brand-ps", text: "PlayerStudio" }),
    ]),
    el("p", {
      class: "app-subtitle",
      text: "Drag controls into the grid to design a custom video player. Resize wide controls horizontally.",
    }),
  ]),
  el("main", { class: "studio" }, [
    createPalette(state),
    createPlayer(state),
    createCodePanel(state),
  ]),
);
