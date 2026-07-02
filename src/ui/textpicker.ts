// "Add text" modal: pick one of the text flavours (time readouts, current chapter,
// dynamic text, title) and — for the two that need it — supply the extra input
// (TimeAll's separator, Dynamic Text's cdt_ variable). Resolves to a descriptor the
// registry turns into a kind === "text" custom control; null on cancel. Mirrors the
// icon picker (ui/iconpicker.ts) in structure and modal styling.

import { DEFAULT_SEPARATOR, TEXT_TYPES, textOf } from "../controls";
import type { TextType, TextTypeMeta } from "../controls";
import { renderIcon } from "../icons";
import { normalizeVariable } from "../registry";
import { el } from "./dom";

export interface TextDescriptor {
  textType: TextType;
  separator?: string;
  variable?: string;
  showNumber?: boolean;
}

export function pickText(): Promise<TextDescriptor | null> {
  return new Promise((resolve) => {
    let settled = false;
    const close = (val: TextDescriptor | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(val);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };

    // Body swaps between the type grid and a per-type input step.
    const body = el("div", { class: "text-picker-body" });

    const renderInputStep = (meta: TextTypeMeta) => {
      body.replaceChildren();

      const preview = el("span", { class: "text-preview-value" });
      const back = el("button", { class: "btn", text: "← Back" });
      back.addEventListener("click", renderGrid);
      const add = el("button", { class: "btn btn--primary", text: "Add" });

      // The Current Chapter toggle: a switch, not a text field.
      if (meta.input === "switch") {
        const toggle = el("input", { type: "checkbox" }) as HTMLInputElement;
        toggle.className = "switch-input";
        const control = el("label", { class: "switch" }, [
          toggle,
          el("span", { class: "switch-track" }, [el("span", { class: "switch-thumb" })]),
          el("span", { class: "switch-text", text: "Show chapter number (02/14)" }),
        ]);
        const sync = () => (preview.textContent = textOf("currentChapter", { showNumber: toggle.checked }));
        toggle.addEventListener("change", sync);
        sync();
        const commit = () => close({ textType: meta.type, showNumber: toggle.checked });
        add.addEventListener("click", commit);
        body.append(
          el("label", { class: "text-input-label", text: meta.label }),
          control,
          el("div", { class: "text-preview" }, [el("span", { class: "text-preview-tag", text: "Preview" }), preview]),
          el("p", { class: "icon-picker-hint", text: "The chapter title comes from the player; the number is optional." }),
          el("div", { class: "text-picker-actions" }, [back, add]),
        );
        return;
      }

      // Text-field flavours: TimeAll's separator, Dynamic Text's cdt_ variable.
      const isSep = meta.input === "separator";
      const field = el("input", { class: "icon-search", type: "text" }) as HTMLInputElement;
      field.value = isSep ? DEFAULT_SEPARATOR : "";
      field.placeholder = isSep ? "Separator (e.g.  / )" : "Variable name (prefixed cdt_)";
      const sync = () => {
        preview.textContent = isSep
          ? textOf("timeAll", { separator: field.value })
          : textOf("dynamicText", { variable: normalizeVariable(field.value) });
      };
      field.addEventListener("input", sync);
      sync();

      const commit = () =>
        close(
          isSep
            ? { textType: meta.type, separator: field.value }
            : { textType: meta.type, variable: field.value.trim() },
        );
      add.addEventListener("click", commit);
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
      });

      body.append(
        el("label", { class: "text-input-label", text: meta.label }),
        field,
        el("div", { class: "text-preview" }, [el("span", { class: "text-preview-tag", text: "Preview" }), preview]),
        el("p", {
          class: "icon-picker-hint",
          text: isSep
            ? "Shown between the elapsed and total time."
            : "Passed to the SDK and filled on player load. cdt_ is added automatically.",
        }),
        el("div", { class: "text-picker-actions" }, [back, add]),
      );
      field.focus();
      if (!isSep) field.select();
    };

    const renderGrid = () => {
      body.replaceChildren();
      const grid = el("div", { class: "text-type-list" });
      for (const meta of TEXT_TYPES) {
        const btn = el("button", { class: "text-type-btn", title: meta.label }, [
          el("span", { class: "text-type-icon" }, [renderIcon(meta.icon, 20)]),
          el("span", { class: "text-type-label", text: meta.label }),
          el("span", { class: "text-type-preview", text: meta.preview }),
        ]);
        btn.addEventListener("click", () => {
          if (meta.input) renderInputStep(meta);
          else close({ textType: meta.type });
        });
        grid.append(btn);
      }
      body.append(grid);
    };

    const dialog = el("div", { class: "modal text-picker" }, [
      el("div", { class: "modal-head" }, [
        el("h2", { class: "panel-title", text: "Add text" }),
        (() => {
          const x = el("button", { class: "modal-close", title: "Close", text: "×" });
          x.addEventListener("click", () => close(null));
          return x;
        })(),
      ]),
      body,
    ]);

    const backdrop = el("div", { class: "modal-backdrop" }, [dialog]);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });

    document.addEventListener("keydown", onKey);
    document.body.append(backdrop);
    renderGrid();
  });
}
