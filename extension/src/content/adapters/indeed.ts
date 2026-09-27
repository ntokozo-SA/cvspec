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
}
