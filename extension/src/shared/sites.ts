import { BOARD_IDS, BOARDS, isOptionalBoard, type KnownBoard } from './boards'

/**
 * Sites CVSpec only runs on after the user grants access. Each is an optional host permission in
 * the manifest; `background/sites.ts` registers the content script once access is granted.
 */
export type SiteKind = 'board' | 'apply'

export interface SiteInfo {
  label: string
  /** What the site is, for the options page. */
  description: string
  kind: SiteKind
  /** Hostnames the site serves pages from. Must agree with `patterns`. */
  host: RegExp
  /** Chrome match patterns, used both as optional host permissions and content script matches. */
  patterns: readonly string[]
  /** Application forms are often embedded in an iframe on the employer's careers page. */
  allFrames: boolean
}

export const APPLY_SITES = {
  smartrecruiters: {
    label: 'SmartRecruiters',
    description: 'Application forms used by Standard Bank and others',
    kind: 'apply',
    host: /^(?:jobs|careers)\.smartrecruiters\.com$/,
    patterns: ['https://jobs.smartrecruiters.com/*', 'https://careers.smartrecruiters.com/*'],
    allFrames: true,
  },
  workday: {
    label: 'Workday',
    description: 'Application forms used by Absa, FNB, FirstRand, RMB and others',
    kind: 'apply',
    host: /\.(?:myworkdayjobs|myworkdaysite)\.com$/,
    patterns: ['https://*.myworkdayjobs.com/*', 'https://*.myworkdaysite.com/*'],
    allFrames: true,
  },
  successfactors: {
    label: 'SAP SuccessFactors',
    description: 'Application forms used by Nedbank and others',
    kind: 'apply',
    host: /(^|\.)(?:successfactors|sapsf)\.(?:com|eu)$/,
    patterns: [
      'https://*.successfactors.com/*',
      'https://*.successfactors.eu/*',
      'https://*.sapsf.com/*',
      'https://*.sapsf.eu/*',
    ],
    allFrames: true,
  },
  workable: {
    label: 'Workable',
    description: 'Application forms used by many smaller employers',
    kind: 'apply',
    host: /^apply\.workable\.com$/,
    patterns: ['https://apply.workable.com/*'],
    allFrames: true,
  },
} as const satisfies Record<string, SiteInfo>

export type ApplySiteId = keyof typeof APPLY_SITES
export type OptionalBoardId = Extract<KnownBoard, 'pnet' | 'careers24' | 'careerjunction' | 'offerzen'>
export type SiteId = ApplySiteId | OptionalBoardId

const BOARD_DESCRIPTIONS: Record<OptionalBoardId, string> = {
  pnet: 'South African job board',
  careers24: 'South African job board',
  careerjunction: 'South African job board',
  offerzen: 'Tech job marketplace (saved for tracking only)',
}

function boardSite(id: OptionalBoardId): SiteInfo {
  const board = BOARDS[id]
  return {
    label: board.label,
    description: BOARD_DESCRIPTIONS[id],
    kind: 'board',
    host: board.host,
    patterns: board.matches,
    allFrames: false,
  }
}

const OPTIONAL_BOARD_IDS = BOARD_IDS.filter(isOptionalBoard) as OptionalBoardId[]

export const SITES: Record<SiteId, SiteInfo> = {
  ...(Object.fromEntries(OPTIONAL_BOARD_IDS.map((id) => [id, boardSite(id)])) as Record<
    OptionalBoardId,
    SiteInfo
  >),
  ...APPLY_SITES,
}

export const SITE_IDS = Object.keys(SITES) as SiteId[]

export const SCRIPT_ID_PREFIX = 'cvspec-site-'

export function scriptIdFor(id: SiteId): string {
  return `${SCRIPT_ID_PREFIX}${id}`
}

export function siteForUrl(raw: string | undefined): SiteId | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  return SITE_IDS.find((id) => SITES[id].host.test(url.hostname)) ?? null
}

export const OPTIONAL_HOST_PATTERNS = SITE_IDS.flatMap((id) => [...SITES[id].patterns])
