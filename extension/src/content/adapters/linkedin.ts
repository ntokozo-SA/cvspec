import { scanJsonLdJobPosting } from './jsonLd'
import {
  cleanBlock,
  cleanInline,
  descriptionFrom,
  mergeWithFallback,
  queryFirst,
  textFrom,
  type JobBoardAdapter,
} from './types'

const TITLE = [
  '.job-details-jobs-unified-top-card__job-title h1',
  '.job-details-jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  '.top-card-layout__title',
  'h1.t-24',
]

const COMPANY = [
  '.job-details-jobs-unified-top-card__company-name a',
  '.job-details-jobs-unified-top-card__company-name',
  '.jobs-unified-top-card__company-name a',
  '.jobs-unified-top-card__company-name',
  '.topcard__org-name-link',
]

const LOCATION = [
  '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
  '.job-details-jobs-unified-top-card__bullet',
  '.jobs-unified-top-card__bullet',
  '.topcard__flavor--bullet',
]

const DESCRIPTION = [
  '#job-details',
  '.jobs-description__content',
  '.jobs-description-content__text',
  '.jobs-box__html-content',
  '.show-more-less-html__markup',
]

const APPLY_BUTTON = [
  '#jobs-apply-button-id',
  '.jobs-apply-button',
  'button[aria-label*="apply to" i]',
  'a[aria-label*="apply to" i]',
  'a[aria-label*="apply on company website" i]',
]

const SAVE_BUTTON = '.jobs-save-button, button[aria-label^="save" i], a[aria-label^="save" i]'

function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0
}

function findApplyButton(): HTMLElement | null {
  for (const selector of APPLY_BUTTON) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (isVisible(element)) return element
    }
  }
  for (const element of Array.from(
    document.querySelectorAll<HTMLElement>('button, a[role="button"], a[href*="apply"]'),
  )) {
    const text = cleanInline(element.innerText ?? '')
    if ((text === 'Easy Apply' || text === 'Apply') && isVisible(element)) return element
  }
  return null
}

/** Smallest ancestor of the Apply button that also holds LinkedIn's own Save button. */
function applyRow(button: HTMLElement): HTMLElement {
  let current: HTMLElement = button
  for (let depth = 0; depth < 5 && current.parentElement; depth += 1) {
    const parent = current.parentElement
    if (parent === document.body) break
    if (parent.querySelector(SAVE_BUTTON)) return parent
    current = parent
  }
  return button.parentElement ?? button
}

/** The job detail pane: nearest ancestor of the Apply button that contains the description. */
function detailRoot(): HTMLElement | null {
  const button = findApplyButton()
  let current = button?.parentElement ?? null
  for (let depth = 0; current && depth < 20; depth += 1) {
    if (current.querySelector('#job-details, [class*="jobs-description"]') || hasAboutHeading(current)) {
      return current
    }
    current = current.parentElement
  }
  return null
}

const ABOUT_JOB = /^about the job$/i
const MIN_DESCRIPTION_LENGTH = 200

/** Element whose own text is "About the job", whatever tag LinkedIn uses for it. */
function aboutHeading(root: Node = document.body): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (ABOUT_JOB.test(cleanInline(node.nodeValue ?? ''))) {
      const element = node.parentElement
      if (element && isVisible(element)) return element
    }
  }
  return null
}

function hasAboutHeading(root: Node): boolean {
  return aboutHeading(root) !== null
}

function descriptionFromAboutHeading(): string {
  let node: HTMLElement | null = aboutHeading()
  for (let depth = 0; node && depth < 8; depth += 1) {
    const parent: HTMLElement | null = node.parentElement
    if (!parent || parent === document.body) break
    const text = cleanBlock(parent.innerText ?? '')
      .replace(/^[\s\S]*?about the job\s*/i, '')
      .split(/\n(?:about the company|show less|show more)\b/i)[0]
      .trim()
    if (text.length >= MIN_DESCRIPTION_LENGTH) return text
    node = parent
  }
  return ''
}

function titleFromPage(): string {
  for (const heading of Array.from(document.querySelectorAll<HTMLElement>('h1'))) {
    const text = cleanInline(heading.innerText ?? '')
    if (text.length > 3 && isVisible(heading)) return text
  }
  const [first] = document.title.replace(/^\(\d+\)\s*/, '').split(' | ')
  return first && !/^linkedin$/i.test(first.trim()) ? first.trim() : ''
}

/** Company link closest above the Apply button, i.e. the one in the job header. */
function companyNearApply(): string {
  const button = findApplyButton()
  if (!button) return ''
  const buttonTop = button.getBoundingClientRect().top
  let best: { text: string; distance: number } | null = null
  for (const link of Array.from(document.querySelectorAll<HTMLElement>('a[href*="/company/"]'))) {
    const text = cleanInline(link.innerText ?? '')
    if (!text || !isVisible(link)) continue
    const distance = buttonTop - link.getBoundingClientRect().bottom
    if (distance >= 0 && (!best || distance < best.distance)) best = { text, distance }
  }
  return best?.text ?? ''
}

function parseApplyLabel(): { title?: string; company?: string } {
  const label = findApplyButton()?.getAttribute('aria-label') ?? ''
  const match = label.match(/apply to (.+?)(?: at (.+?))?(?: on company website)?$/i)
  const title = match?.[1]?.trim()
  if (!title || /^(this|the) (job|role|position)$/i.test(title)) return {}
  return { title, company: match?.[2]?.trim() }
}

function jobId(url: URL): string | null {
  const viewMatch = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)
  const fromUrl = viewMatch?.[1] ?? url.searchParams.get('currentJobId')
  if (fromUrl) return fromUrl

  const link = detailRoot()?.querySelector<HTMLAnchorElement>('a[href*="/jobs/view/"]')
  return link?.href.match(/\/jobs\/view\/(?:[^/?]*-)?(\d+)/)?.[1] ?? null
}

export const linkedinAdapter: JobBoardAdapter = {
  board: 'linkedin',
  matches(url) {
    return url.hostname.endsWith('linkedin.com') && url.pathname.startsWith('/jobs') && !!jobId(url)
  },
  jobKey(url) {
    const id = jobId(url)
    return id ? `linkedin:${id}` : null
  },
  findAnchor() {
    const button = findApplyButton()
    if (button) return applyRow(button)
    return queryFirst(TITLE)?.parentElement ?? null
  },
  extract() {
    const url = new URL(window.location.href)
    const id = jobId(url)
    if (!id) return null

    const root = detailRoot()
    const fromLabel = parseApplyLabel()
    const title =
      textFrom(TITLE) ||
      fromLabel.title ||
      cleanInline(root?.querySelector<HTMLElement>('h1')?.innerText ?? '') ||
      cleanInline(root?.querySelector<HTMLElement>('a[href*="/jobs/view/"]')?.innerText ?? '') ||
      titleFromPage()
    const company =
      textFrom(COMPANY) ||
      fromLabel.company ||
      cleanInline(root?.querySelector<HTMLElement>('a[href*="/company/"]')?.innerText ?? '') ||
      companyNearApply()
    const selectorDescription = descriptionFrom(DESCRIPTION)
    const descriptionText =
      selectorDescription.length >= MIN_DESCRIPTION_LENGTH
        ? selectorDescription
        : descriptionFromAboutHeading() || selectorDescription

    const job = mergeWithFallback(
      {
        board: 'linkedin',
        url: `https://www.linkedin.com/jobs/view/${id}/`,
        title,
        company,
        location: textFrom(LOCATION).split(' · ')[0],
        descriptionText,
      },
      scanJsonLdJobPosting(),
    )
    if (!job) {
      console.info('[CVSpec] Could not read this LinkedIn job', {
        title,
        company,
        descriptionLength: descriptionText.length,
        applyButtonFound: Boolean(findApplyButton()),
        aboutHeadingFound: Boolean(aboutHeading()),
      })
    }
    return job
  },
}
