import { controlText, findApplyButton, isVisible } from './heuristics'
import { scanJsonLdJobPosting } from './jsonLd'
import { descriptionFrom, mergeWithFallback, queryFirst, textFrom, type JobBoardAdapter } from './types'

function jobKeyParam(url: URL): string | null {
  return url.searchParams.get('jk') ?? url.searchParams.get('vjk')
}

const TITLE = [
  '[data-testid="jobsearch-JobInfoHeader-title"]',
  'h1.jobsearch-JobInfoHeader-title',
  '.jobsearch-JobInfoHeader-title',
]

const COMPANY = [
  '[data-testid="inlineHeader-companyName"] a',
  '[data-testid="inlineHeader-companyName"]',
  '[data-company-name="true"]',
  '.jobsearch-CompanyInfoContainer a',
]

const LOCATION = [
  '[data-testid="inlineHeader-companyLocation"]',
  '[data-testid="job-location"]',
  '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
]

const DESCRIPTION = ['#jobDescriptionText', '.jobsearch-jobDescriptionText']

const ANCHOR = [
  '#jobsearch-ViewJobButtons-container',
  '.jobsearch-ViewJobButtons-container',
  '#applyButtonLinkContainer',
  '.jobsearch-IndeedApplyButton-contentWrapper',
]

/** "Apply on company site" links out; the Indeed Apply button opens Indeed's own form. */
const APPLY_BUTTON = [
  '#applyButtonLinkContainer a',
  '#applyButtonLinkContainer button',
  '#indeedApplyButton',
  '.jobsearch-IndeedApplyButton-contentWrapper button',
]

function applyButton(): HTMLElement | null {
  for (const selector of APPLY_BUTTON) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element && isVisible(element)) return element
  }
  return findApplyButton(queryFirst(ANCHOR) ?? document)
}

export const indeedAdapter: JobBoardAdapter = {
  board: 'indeed',
  matches(url) {
    if (!url.hostname.endsWith('indeed.com')) return false
    return url.pathname.startsWith('/viewjob') || !!jobKeyParam(url)
  },
  jobKey(url) {
    const key = jobKeyParam(url)
    return key ? `indeed:${key}` : `indeed:${url.pathname}`
  },
  findAnchor() {
    const anchor = queryFirst(ANCHOR)
    if (anchor) return anchor
    return queryFirst(TITLE)?.parentElement ?? null
  },
  extract() {
    const url = new URL(window.location.href)
    const key = jobKeyParam(url)
    const canonical = key ? `https://${url.hostname}/viewjob?jk=${key}` : url.toString()
    return mergeWithFallback(
      {
        board: 'indeed',
        url: canonical,
        title: textFrom(TITLE).replace(/\s*-\s*job post$/i, ''),
        company: textFrom(COMPANY),
        location: textFrom(LOCATION),
        descriptionText: descriptionFrom(DESCRIPTION),
      },
      scanJsonLdJobPosting(),
    )
  },
  applyButton,
  isBuiltInApply() {
    const button = applyButton()
    if (!button) return false
    if (/company site/i.test(controlText(button))) return false
    return (
      button.id === 'indeedApplyButton' ||
      button.closest('.jobsearch-IndeedApplyButton-contentWrapper, #indeedApplyButton') !== null
    )
  },
}
