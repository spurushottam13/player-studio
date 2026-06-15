// Studio controller: owns the Region editor (the chosen Regional Layout model)
// and fans out a single onChange signal that fires on every layout edit. The
// earlier POC compared three models (grid / region / free); region was selected,
// so it is now the only authoring canvas.

import { createRegionEditor } from "./modes/region/editor";
import type { EditorInstance } from "./modes/types";

export class Studio {
  readonly editor: EditorInstance;
  private listeners = new Set<() => void>();

  constructor() {
    this.editor = createRegionEditor();
    this.editor.subscribe(() => this.emit());
  }

  active(): EditorInstance {
    return this.editor;
  }
  activeDoc(): string {
    return "spec.md";
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
