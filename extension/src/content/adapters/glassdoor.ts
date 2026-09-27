import { scanJsonLdJobPosting } from './jsonLd'
import { descriptionFrom, mergeWithFallback, queryFirst, textFrom, type JobBoardAdapter } from './types'

function listingId(url: URL): string | null {
  return (
    url.searchParams.get('jobListingId') ??
    url.searchParams.get('jl') ??
    url.pathname.match(/JV_[^.]*?(\d{6,})/)?.[1] ??
    null
  )
}

const TITLE = ['[data-test="job-title"]', 'h1[id^="jd-job-title"]', '[class*="JobDetails_jobTitle"]']

const COMPANY = [
  '[data-test="employer-name"]',
  '[class*="EmployerProfile_employerName"]',
  '[class*="EmployerProfile_compactEmployerName"]',
]

const LOCATION = ['[data-test="location"]', '[class*="JobDetails_location"]']

const DESCRIPTION = [
  '[class*="JobDetails_jobDescription"]',
  '#JobDescriptionContainer',
  '.jobDescriptionContent',
]

const ANCHOR = [
  '[class*="JobDetails_applyButtonContainer"]',
  '[data-test="applyButton"]',
  '[data-test="easyApply"]',
]

export const glassdoorAdapter: JobBoardAdapter = {
  board: 'glassdoor',
  matches(url) {
    if (!/(^|\.)glassdoor\.(com|co\.uk)$/.test(url.hostname)) return false
    return (
      url.pathname.includes('/job-listing/') ||
      url.pathname.startsWith('/Job/') ||
      !!url.searchParams.get('jobListingId')
    )
  },
  jobKey(url) {
    return `glassdoor:${listingId(url) ?? url.pathname}`
  },
  findAnchor() {
    const anchor = queryFirst(ANCHOR)
    if (anchor) return anchor.closest('[class*="JobDetails_applyButtonContainer"]') ?? anchor
    return queryFirst(TITLE)?.parentElement ?? null
  },
  extract() {
    const url = new URL(window.location.href)
    const id = listingId(url)
    const canonical = id ? `https://${url.hostname}/job-listing/?jl=${id}` : url.toString()
    return mergeWithFallback(
      {
        board: 'glassdoor',
        url: canonical,
        title: textFrom(TITLE),
        company: textFrom(COMPANY).replace(/\s*\d\.\d\s*★?\s*$/, ''),
        location: textFrom(LOCATION),
        descriptionText: descriptionFrom(DESCRIPTION),
      },
      scanJsonLdJobPosting(),
    )
  },
}
