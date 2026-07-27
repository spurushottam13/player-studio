// Tiny DOM helper.

// A spacer's width is a PERCENTAGE of the player container's width, so it keeps
// its proportion across viewports. On the canvas it resolves through --player-w,
// which the region editor publishes on .Player every render.
export function spacerWidthCss(pct: number): string {
  return `calc(var(--player-w) * ${pct} / 100)`;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: { class?: string; text?: string; title?: string; type?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.text) node.textContent = attrs.text;
  if (attrs.title) node.title = attrs.title;
  if (attrs.type && "type" in node) (node as HTMLInputElement).type = attrs.type;
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
