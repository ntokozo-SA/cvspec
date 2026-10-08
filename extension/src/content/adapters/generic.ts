import { BOARDS, type KnownBoard } from '../../shared/boards'
import {
  companyFromPage,
  descriptionFromPage,
  findApplyButton,
  locationFromPage,
  MIN_DESCRIPTION_LENGTH,
  pageHasJobPosting,
  titleFromPage,
} from './heuristics'
import { scanJsonLdJobPosting } from './jsonLd'
import { descriptionFrom, mergeWithFallback, queryFirst, textFrom, type JobBoardAdapter } from './types'

interface BoardSelectors {
  title?: string[]
  company?: string[]
  location?: string[]
  description?: string[]
  anchor?: string[]
}

export interface GenericBoardConfig {
  board: KnownBoard
  /** Id of the single job shown, or null when the URL is not a job posting. */
  jobId(url: URL): string | null
  selectors?: BoardSelectors
}

/**
 * Adapter for boards without bespoke scraping: board-specific selectors first, then the
 * page's schema.org JobPosting, then generic DOM heuristics. Pages whose URL does not look
 * like a posting still match when they carry JobPosting JSON-LD.
 */
export function createGenericAdapter(config: GenericBoardConfig): JobBoardAdapter {
  const { board, jobId, selectors = {} } = config
  const host = BOARDS[board].host

  return {
    board,
    matches(url) {
      if (!host.test(url.hostname)) return false
      return jobId(url) !== null || pageHasJobPosting()
    },
    jobKey(url) {
      return `${board}:${jobId(url) ?? url.pathname}`
    },
    findAnchor() {
      const anchor = selectors.anchor && queryFirst(selectors.anchor)
      if (anchor) return anchor
      const apply = findApplyButton()
      if (apply) return apply.parentElement ?? apply
      const title = (selectors.title && queryFirst(selectors.title)) || document.querySelector('h1')
      return title?.parentElement ?? null
    },
    extract() {
      const ld = scanJsonLdJobPosting()
      const fromSelectors = selectors.description ? descriptionFrom(selectors.description) : ''
      const descriptionText =
        [fromSelectors, ld?.descriptionText ?? '', descriptionFromPage()].find(
          (text) => text.length >= MIN_DESCRIPTION_LENGTH,
        ) ||
        fromSelectors ||
        ld?.descriptionText ||
        ''

      return mergeWithFallback(
        {
          board,
          url: window.location.href,
          title: (selectors.title && textFrom(selectors.title)) || ld?.title || titleFromPage(),
          company:
            (selectors.company && textFrom(selectors.company)) || ld?.company || companyFromPage(),
          location:
            (selectors.location && textFrom(selectors.location)) ||
            ld?.location ||
            locationFromPage(),
          descriptionText,
        },
        null,
      )
    },
  }
}

function pathMatch(url: URL, pattern: RegExp): string | null {
  return url.pathname.match(pattern)?.[1] ?? null
}

export const genericBoardConfigs: GenericBoardConfig[] = [
  {
    board: 'ziprecruiter',
    jobId: (url) =>
      url.searchParams.get('jid') ??
      url.searchParams.get('lk') ??
      pathMatch(url, /^\/((?:c\/[^/]+\/Job|jobs)\/.+)$/),
  },
  {
    board: 'careerbuilder',
    jobId: (url) => pathMatch(url, /\/job\/([A-Za-z0-9]+)/),
  },
  {
    board: 'monster',
    jobId: (url) => url.searchParams.get('id') ?? pathMatch(url, /\/job-openings\/([^/?#]+)/),
  },
  {
    board: 'simplyhired',
    jobId: (url) => url.searchParams.get('job') ?? pathMatch(url, /\/job\/([^/?#]+)/),
  },
  {
    board: 'talention',
    jobId: (url) => pathMatch(url, /\/(?:jobs?|stellen?|jobposting)\/([^/?#]+)/i),
  },
  {
    board: 'flexjobs',
    jobId: (url) =>
      (url.pathname.toLowerCase().includes('hostedjob') ? url.searchParams.get('id') : null) ??
      pathMatch(url, /\/publicjobs\/([^/?#]+)/) ??
      pathMatch(url, /\/members\/jobs\/(\d+)/) ??
      pathMatch(url, /\/remote-jobs\/[^/]*?([0-9a-f]{8}-[0-9a-f-]{27})/i),
  },
  {
    board: 'weworkremotely',
    jobId: (url) => pathMatch(url, /^\/(?:remote-jobs|listings)\/(?!search$|new$)([^/?#]+)\/?$/),
    selectors: {
      title: ['.listing-header-container h1'],
      company: ['.company-card h2'],
      description: ['.listing-container'],
    },
  },
  {
    board: 'remoteco',
    jobId: (url) => pathMatch(url, /^\/(?:job|job-details)\/([^/?#]+)/),
  },
  {
    board: 'dice',
    jobId: (url) => pathMatch(url, /\/(?:job-detail|jobs\/detail)\/([^/?#]+)/),
    selectors: {
      title: ['[data-cy="jobTitle"]', 'h1[data-testid="job-detail-header-title"]'],
      company: ['[data-cy="companyNameLink"]', '[data-testid="job-detail-header-company"]'],
      description: ['[data-testid="jobDescriptionHtml"]', '#jobDescription'],
    },
  },
  {
    board: 'wellfound',
    jobId: (url) => url.searchParams.get('job_listing_slug') ?? pathMatch(url, /\/jobs\/(\d+)/),
  },
  {
    board: 'hired',
    jobId: (url) => pathMatch(url, /\/(?:jobs?|opportunities)\/([^/?#]+)/),
  },
  {
    board: 'builtin',
    jobId: (url) => pathMatch(url, /\/job\/(?:[^/]+\/)?(\d+)/),
  },
  {
    board: 'handshake',
    jobId: (url) => pathMatch(url, /\/(?:jobs|job-search)\/(\d+)/),
  },
  {
    board: 'snagajob',
    jobId: (url) => pathMatch(url, /\/jobs\/(\d+)/),
  },
  {
    board: 'upwork',
    jobId: (url) => pathMatch(url, /~(0[0-9a-z]{6,})/i),
    selectors: {
      description: ['[data-test="Description"]', '[data-test="job-description-text"]'],
    },
  },
  {
    board: 'fiverr',
    jobId: (url) => pathMatch(url, /\/(?:briefs?|requests)\/([^/?#]+)/),
  },
  {
    board: 'idealist',
    jobId: (url) =>
      pathMatch(
        url,
        /\/(?:nonprofit-job|volunteer-opportunity|nonprofit-internship|internship|job)\/([^/?#]+)/,
      ),
  },
  {
    board: 'peoplecurated',
    jobId: (url) => pathMatch(url, /\/jobs\/(?!create$)([^/?#]+)\/?$/),
  },
]
