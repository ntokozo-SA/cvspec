export function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0
}

function walk(node: ParentNode, selector: string, out: Element[]): void {
  for (const child of Array.from(node.children)) {
    if (child.matches(selector)) out.push(child)
    if (child.shadowRoot) walk(child.shadowRoot, selector, out)
    walk(child, selector, out)
  }
}

/**
 * `querySelectorAll` that also looks inside open shadow roots (SmartRecruiters renders its form
 * in web components), in document order.
 */
export function deepQueryAll<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  const out: Element[] = []
  if (root instanceof Element && root.shadowRoot) walk(root.shadowRoot, selector, out)
  walk(root, selector, out)
  return out as T[]
}

export function deepQuery<T extends Element = Element>(root: ParentNode, selector: string): T | null {
  return deepQueryAll<T>(root, selector)[0] ?? null
}

/** Waits for `find` to return something, checking on each animation-ish tick. */
export async function waitFor<T>(find: () => T | null, timeoutMs: number): Promise<T | null> {
  const started = Date.now()
  for (;;) {
    const found = find()
    if (found) return found
    if (Date.now() - started >= timeoutMs) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
