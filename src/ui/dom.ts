// Tiny DOM helper.

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
