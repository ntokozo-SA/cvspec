import type { Board, ScrapedJob } from '../../shared/types'

export interface JobBoardAdapter {
  board: Board
  matches(url: URL): boolean
  /** Stable identifier for the job currently shown, used to remount on SPA navigation. */
  jobKey(url: URL): string | null
  /** Element next to which the CVSpec action bar is inserted (the Apply area). */
  findAnchor(): Element | null
  extract(): ScrapedJob | null
}

export function queryFirst(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element) return element
  }
  return null
}

export function textFrom(selectors: string[], root: ParentNode = document): string {
  const element = queryFirst(selectors, root)
  return cleanInline(element?.innerText ?? element?.textContent ?? '')
}

export function cleanInline(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function cleanBlock(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function descriptionFrom(selectors: string[]): string {
  const element = queryFirst(selectors)
  return cleanBlock(element?.innerText ?? element?.textContent ?? '')
}

export function mergeWithFallback(
  primary: Partial<ScrapedJob> & Pick<ScrapedJob, 'board' | 'url'>,
  fallback: ScrapedJob | null,
): ScrapedJob | null {
  const title = primary.title || fallback?.title || ''
  const company = primary.company || fallback?.company || ''
  const descriptionText =
    (primary.descriptionText?.length ?? 0) >= 40
      ? primary.descriptionText!
      : fallback?.descriptionText || primary.descriptionText || ''

  if (!title || descriptionText.length < 40) return null
  return {
    board: primary.board,
    url: primary.url,
    title,
    company,
    location: primary.location || fallback?.location || undefined,
    descriptionText,
  }
}
