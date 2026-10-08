import { scanJsonLdJobPosting } from './jsonLd'
import { cleanBlock, cleanInline } from './types'

export const MIN_DESCRIPTION_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 60000

const APPLY_TEXT =
  /^(?:easy apply|quick apply|apply(?: now| for (?:this )?(?:job|position|role)| on (?:the )?company (?:site|website)| externally)?|submit (?:a )?proposal|send proposal|i'?m interested)$/i

const DESCRIPTION_HINTS = [
  '[data-testid*="description" i]',
  '[data-test*="description" i]',
  '[id*="description" i]',
  '[class*="description" i]',
  '[class*="job-details" i]',
  '[class*="jobdetails" i]',
  'article',
]

const COMPANY_HINTS = [
  '[itemprop="hiringOrganization"]',
  '[data-testid*="company" i]',
  '[data-test*="company" i]',
  '[class*="company-name" i]',
  '[class*="companyname" i]',
  '[class*="employer" i]',
]

const LOCATION_HINTS = [
  '[itemprop="jobLocation"]',
  '[data-testid*="location" i]',
  '[data-test*="location" i]',
  '[class*="job-location" i]',
  '[class*="location" i]',
]

export function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0
}

function visibleText(element: HTMLElement): string {
  return element.innerText ?? element.textContent ?? ''
}

export function findApplyButton(root: ParentNode = document): HTMLElement | null {
  const candidates = root.querySelectorAll<HTMLElement>(
    'button, a, [role="button"], input[type="submit"]',
  )
  for (const element of Array.from(candidates)) {
    const text = cleanInline(
      visibleText(element) ||
        (element as HTMLInputElement).value ||
        element.getAttribute('aria-label') ||
        '',
    )
    if (text.length <= 40 && APPLY_TEXT.test(text) && isVisible(element)) return element
  }
  return null
}

export function titleFromPage(): string {
  for (const heading of Array.from(document.querySelectorAll<HTMLElement>('h1'))) {
    const text = cleanInline(visibleText(heading))
    if (text.length > 3 && text.length < 200 && isVisible(heading)) return text
  }
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content
  return cleanInline(og ?? document.title.split(/ [|\-–] /)[0] ?? '')
}

function shortTextFrom(selectors: string[]): string {
  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const text = cleanInline(visibleText(element))
      if (text && text.length <= 100 && isVisible(element)) return text
    }
  }
  return ''
}

export function companyFromPage(): string {
  return shortTextFrom(COMPANY_HINTS)
}

export function locationFromPage(): string {
  return shortTextFrom(LOCATION_HINTS)
}

/** Longest visible description-like block, falling back to the page's main content. */
export function descriptionFromPage(): string {
  let best = ''
  for (const selector of DESCRIPTION_HINTS) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (!isVisible(element)) continue
      const text = cleanBlock(visibleText(element))
      if (text.length > best.length && text.length <= MAX_DESCRIPTION_LENGTH) best = text
    }
  }
  if (best.length >= MIN_DESCRIPTION_LENGTH) return best

  const main = document.querySelector<HTMLElement>('main, [role="main"]')
  const fromMain = main ? cleanBlock(visibleText(main)) : ''
  return fromMain.length >= MIN_DESCRIPTION_LENGTH && fromMain.length <= MAX_DESCRIPTION_LENGTH
    ? fromMain
    : best
}

let jsonLdCache: { key: string; found: boolean } | null = null

/** Whether the page carries a schema.org JobPosting, re-checked when the URL or JSON-LD changes. */
export function pageHasJobPosting(): boolean {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]').length
  const key = `${window.location.href}#${scripts}`
  if (jsonLdCache?.key !== key) {
    jsonLdCache = { key, found: scripts > 0 && scanJsonLdJobPosting() !== null }
  }
  return jsonLdCache.found
}
