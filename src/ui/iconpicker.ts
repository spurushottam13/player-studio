// Icon picker modal over the full Material Icons catalog. Used both to add a
// custom control and to override an existing control's icon. Resolves to the
// chosen Material NAME (the icon's key, e.g. "play_arrow") — never raw SVG.
// Picking is name-only.

import { ICON_COUNT, iconNames, renderIcon } from "../icons";
import { el } from "./dom";

const ALL_NAMES = iconNames();
const MAX_RESULTS = 240; // cap drawn swatches; refine via search beyond this

export interface PickIconOpts {
  title?: string;
  current?: string; // highlight the currently-selected icon
}

// Normalize for matching: lowercase, strip non-alphanumerics so "full screen"
// and "fullscreen" both match the icon name "fullscreen".
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function pickIcon(opts: PickIconOpts = {}): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const close = (val: string | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(val);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };

    const search = el("input", { class: "icon-search", type: "text" }) as HTMLInputElement;
    search.placeholder = `Search ${ICON_COUNT} Material icons…`;
    const grid = el("div", { class: "icon-grid" });
    const hint = el("p", { class: "icon-picker-hint" });

    const renderList = () => {
      const q = norm(search.value);
      const matches = q ? ALL_NAMES.filter((n) => norm(n).includes(q)) : ALL_NAMES;
      const shown = matches.slice(0, MAX_RESULTS);
      grid.replaceChildren();
      for (const name of shown) {
        const swatch = el("button", { class: "icon-swatch", title: name });
        if (name === opts.current) swatch.classList.add("icon-swatch--current");
        swatch.append(renderIcon(name, 22));
        swatch.addEventListener("click", () => close(name));
        grid.append(swatch);
      }
      hint.textContent =
        matches.length === 0
          ? "No icons match."
          : matches.length > shown.length
            ? `Showing ${shown.length} of ${matches.length} — keep typing to narrow.`
            : `${matches.length} icon${matches.length === 1 ? "" : "s"}.`;
    };
    search.addEventListener("input", renderList);

    const dialog = el("div", { class: "modal icon-picker" }, [
      el("div", { class: "modal-head" }, [
        el("h2", { class: "panel-title", text: opts.title ?? "Pick an icon" }),
        (() => {
          const x = el("button", { class: "modal-close", title: "Close", text: "×" });
          x.addEventListener("click", () => close(null));
          return x;
        })(),
      ]),
      search,
      grid,
      hint,
    ]);

    const backdrop = el("div", { class: "modal-backdrop" }, [dialog]);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });

    document.addEventListener("keydown", onKey);
    document.body.append(backdrop);
    renderList();
    search.focus();
  });
}
