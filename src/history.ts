// Undo/redo for the studio. A snapshot is the COMBINED serialized state of the
// layout (RegionState) and the control registry, so one entry restores both —
// adding a spacer (registry) and placing it (layout) are different actions, but
// undo of either lands on a self-consistent whole.
//
// Recording is coalesced to once per microtask: a single user action commits
// one change event (a mouse slider drag commits on release; a drop commits
// once) → one undo step, while a synchronous burst across BOTH stores (e.g.
// Reset seeds the registry and rewrites the layout) collapses into one step.
// undo()/redo() flush any pending record first so nothing is stranded.

interface Store {
  snapshot(): string;
  restore(s: string): void;
  subscribe(fn: () => void): () => void;
}

interface Snap {
  reg: string;
  st: string;
}

export class History {
  private undoStack: Snap[] = [];
  private redoStack: Snap[] = [];
  private baseline: Snap; // the last-recorded state (what a new change diffs against)
  private restoring = false;
  private scheduled = false;
  private listeners = new Set<() => void>();
  private registry: Store;
  private state: Store;

  constructor(registry: Store, state: Store) {
    this.registry = registry;
    this.state = state;
    this.baseline = this.capture();
    registry.subscribe(() => this.onChange());
    state.subscribe(() => this.onChange());
  }

  private capture(): Snap {
    return { reg: this.registry.snapshot(), st: this.state.snapshot() };
  }

  private onChange(): void {
    if (this.restoring || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.record();
    });
  }

  private record(): void {
    const next = this.capture();
    if (next.reg === this.baseline.reg && next.st === this.baseline.st) return;
    this.undoStack.push(this.baseline);
    this.baseline = next;
    this.redoStack = [];
    this.emit();
  }

  // Commit any pending coalesced record immediately (before an undo/redo).
  private flush(): void {
    if (this.scheduled) {
      this.scheduled = false;
      this.record();
    }
  }

  private apply(snap: Snap): void {
    this.restoring = true;
    this.registry.restore(snap.reg);
    this.state.restore(snap.st);
    this.restoring = false;
    this.baseline = snap;
    this.emit();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0 || this.scheduled;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    this.flush();
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.baseline);
    this.apply(prev);
  }
  redo(): void {
    this.flush();
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.baseline);
    this.apply(next);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
