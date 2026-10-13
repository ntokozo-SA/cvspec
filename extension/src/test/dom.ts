/**
 * Turns `<template data-shadow>` children into open shadow roots on their parent, recursively,
 * so fixtures can describe web components such as SmartRecruiters' form.
 */
export function attachShadows(root: ParentNode = document): void {
  for (const template of Array.from(
    root.querySelectorAll<HTMLTemplateElement>('template[data-shadow]'),
  )) {
    const host = template.parentElement
    if (!host || host.shadowRoot) continue
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.append(template.content.cloneNode(true))
    template.remove()
    attachShadows(shadow)
  }
}

/**
 * Behaves like Workday's dropdowns: clicking a `aria-haspopup="listbox"` button shows the
 * listbox it controls, clicking an option sets the button text and closes it, Escape closes it.
 * Returns a function that removes the listeners.
 */
export function emulateListboxes(doc: Document = document): () => void {
  const buttonFor = (listbox: Element) =>
    doc.querySelector<HTMLElement>(`[aria-controls="${listbox.id}"]`)

  const onClick = (event: Event) => {
    const target = event.target as Element | null
    const button = target?.closest<HTMLElement>('[aria-haspopup="listbox"]')
    if (button) {
      const listbox = doc.getElementById(button.getAttribute('aria-controls') ?? '')
      if (listbox) listbox.hidden = false
      return
    }
    const option = target?.closest('[role="option"]')
    const listbox = option?.closest<HTMLElement>('[role="listbox"]')
    if (!option || !listbox) return
    const owner = buttonFor(listbox)
    if (owner) owner.textContent = option.textContent?.trim() ?? ''
    listbox.hidden = true
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const button = (event.target as Element | null)?.closest('[aria-haspopup="listbox"]')
    const listbox = doc.getElementById(button?.getAttribute('aria-controls') ?? '')
    if (listbox) listbox.hidden = true
  }

  doc.addEventListener('click', onClick, true)
  doc.addEventListener('keydown', onKey, true)
  return () => {
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('keydown', onKey, true)
  }
}
