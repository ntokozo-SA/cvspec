export interface BoardInfo {
  label: string
  /** Hostnames the board serves job pages from. Must agree with `matches`. */
  host: RegExp
  /** Chrome match patterns the job board content script is injected into. */
  matches: readonly string[]
}

const GOOGLE_TLDS = ['com', 'co.uk', 'ca', 'com.au', 'co.za', 'co.in', 'ie'] as const

export const BOARDS = {
  linkedin: {
    label: 'LinkedIn',
    host: /(^|\.)linkedin\.com$/,
    matches: ['https://www.linkedin.com/*'],
  },
  indeed: {
    label: 'Indeed',
    host: /(^|\.)indeed\.com$/,
    matches: ['https://*.indeed.com/*'],
  },
  glassdoor: {
    label: 'Glassdoor',
    host: /(^|\.)glassdoor\.(com|co\.uk)$/,
    matches: ['https://*.glassdoor.com/*', 'https://*.glassdoor.co.uk/*'],
  },
  ziprecruiter: {
    label: 'ZipRecruiter',
    host: /(^|\.)ziprecruiter\.(com|co\.uk)$/,
    matches: ['https://*.ziprecruiter.com/*', 'https://*.ziprecruiter.co.uk/*'],
  },
  google_jobs: {
    label: 'Google for Jobs',
    host: /^www\.google\.(com|co\.uk|ca|com\.au|co\.za|co\.in|ie)$/,
    matches: GOOGLE_TLDS.map((tld) => `https://www.google.${tld}/search*`),
  },
  careerbuilder: {
    label: 'CareerBuilder',
    host: /(^|\.)careerbuilder\.com$/,
    matches: ['https://*.careerbuilder.com/*'],
  },
  monster: {
    label: 'Monster',
    host: /(^|\.)monster\.(com|co\.uk|ca)$/,
    matches: ['https://*.monster.com/*', 'https://*.monster.co.uk/*', 'https://*.monster.ca/*'],
  },
  simplyhired: {
    label: 'SimplyHired',
    host: /(^|\.)simplyhired\.(com|co\.uk|ca)$/,
    matches: [
      'https://*.simplyhired.com/*',
      'https://*.simplyhired.co.uk/*',
      'https://*.simplyhired.ca/*',
    ],
  },
  talention: {
    label: 'Talention',
    host: /(^|\.)talention\.(com|de)$/,
    matches: ['https://*.talention.com/*', 'https://*.talention.de/*'],
  },
  flexjobs: {
    label: 'FlexJobs',
    host: /(^|\.)flexjobs\.com$/,
    matches: ['https://*.flexjobs.com/*'],
  },
  weworkremotely: {
    label: 'We Work Remotely',
    host: /(^|\.)weworkremotely\.com$/,
    matches: ['https://*.weworkremotely.com/*'],
  },
  remoteco: {
    label: 'Remote.co',
    host: /(^|\.)remote\.co$/,
    matches: ['https://*.remote.co/*'],
  },
  dice: {
    label: 'Dice',
    host: /(^|\.)dice\.com$/,
    matches: ['https://*.dice.com/*'],
  },
  wellfound: {
    label: 'Wellfound',
    host: /(^|\.)wellfound\.com$/,
    matches: ['https://*.wellfound.com/*'],
  },
  hired: {
    label: 'Hired',
    host: /(^|\.)hired\.com$/,
    matches: ['https://*.hired.com/*'],
  },
  builtin: {
    label: 'Built In',
    host: /(^|\.)builtin(nyc|la|boston|chicago|austin|colorado|seattle|sf)?\.(com|org)$/,
    matches: [
      'https://*.builtin.com/*',
      'https://*.builtinnyc.com/*',
      'https://*.builtinla.com/*',
      'https://*.builtinboston.com/*',
      'https://*.builtinchicago.org/*',
      'https://*.builtinaustin.com/*',
      'https://*.builtincolorado.com/*',
      'https://*.builtinseattle.com/*',
      'https://*.builtinsf.com/*',
    ],
  },
  handshake: {
    label: 'Handshake',
    host: /(^|\.)joinhandshake\.(com|co\.uk)$/,
    matches: ['https://*.joinhandshake.com/*', 'https://*.joinhandshake.co.uk/*'],
  },
  snagajob: {
    label: 'Snagajob',
    host: /(^|\.)snagajob\.com$/,
    matches: ['https://*.snagajob.com/*'],
  },
  upwork: {
    label: 'Upwork',
    host: /(^|\.)upwork\.com$/,
    matches: ['https://*.upwork.com/*'],
  },
  fiverr: {
    label: 'Fiverr',
    host: /(^|\.)fiverr\.com$/,
    matches: ['https://*.fiverr.com/*'],
  },
  idealist: {
    label: 'Idealist',
    host: /(^|\.)idealist\.org$/,
    matches: ['https://*.idealist.org/*'],
  },
  peoplecurated: {
    label: 'People Curated',
    host: /(^|\.)peoplecurated\.com$/,
    matches: ['https://*.peoplecurated.com/*'],
  },
} as const satisfies Record<string, BoardInfo>

export type KnownBoard = keyof typeof BOARDS
export type Board = KnownBoard | 'other'

export const BOARD_IDS = Object.keys(BOARDS) as KnownBoard[]

export function boardForUrl(raw: string): Board {
  let hostname: string
  try {
    hostname = new URL(raw).hostname
  } catch {
    return 'other'
  }
  return BOARD_IDS.find((id) => BOARDS[id].host.test(hostname)) ?? 'other'
}
