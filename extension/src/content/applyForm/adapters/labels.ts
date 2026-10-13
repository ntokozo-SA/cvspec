export const CONFIRM_EMAIL =
  /\b(?:confirm|re-?enter|repeat|verify|retype)\b.*\be-?mail\b|\be-?mail\b.*\b(?:again|confirm(?:ation)?|repeat)\b/

function textOf(element: Element | null): string {
  return element?.textContent ?? ''
}

/** Finds an element by id in the field's own tree, so labels inside shadow roots resolve. */
function byId(field: Element, id: string): Element | null {
  const root = field.getRootNode() as Document | ShadowRoot
  return root.getElementById?.(id) ?? document.getElementById(id)
}

/** The visible label text for a field: <label>, aria-labelledby, or a nearby label element. */
export function labelText(field: HTMLElement): string {
  const parts: string[] = []
  const labels = (field as HTMLInputElement).labels
  if (labels) for (const label of Array.from(labels)) parts.push(textOf(label))

  const labelledBy = field.getAttribute('aria-labelledby')
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) parts.push(textOf(byId(field, id)))
  }

  if (parts.join('').trim() === '') {
    let container = field.parentElement
    for (let depth = 0; container && depth < 3; depth += 1) {
      const controls = container.querySelectorAll('input, textarea, select')
      if (controls.length > 1) break
      const label = container.querySelector('label, legend, [class*="label" i]')
      if (label) {
        parts.push(textOf(label))
        break
      }
      container = container.parentElement
    }
  }
  return parts.join(' ')
}

/** Everything that describes a field, lowercased: label first so `^name` rules can anchor on it. */
export function describe(field: HTMLElement): string {
  return [
    labelText(field),
    field.getAttribute('aria-label'),
    field.getAttribute('placeholder'),
    field.getAttribute('name'),
    field.id,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/[*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** A question label for display and for the AI: label, else aria-label, else placeholder. */
export function questionLabel(field: HTMLElement): string {
  const raw =
    labelText(field).trim() ||
    field.getAttribute('aria-label') ||
    field.getAttribute('placeholder') ||
    ''
  return cleanLabel(raw)
}

export function cleanLabel(raw: string): string {
  return raw
    .replace(/[*✱]/g, ' ')
    .replace(/\(\s*(?:required|optional)\s*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[:\s]+$/, '')
    .slice(0, 300)
}
