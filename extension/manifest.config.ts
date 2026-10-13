import { defineManifest } from '@crxjs/vite-plugin'
import { loadEnv } from 'vite'
import pkg from './package.json' with { type: 'json' }
import { BOARDS, STATIC_BOARD_IDS } from './src/shared/boards.ts'
import { OPTIONAL_HOST_PATTERNS } from './src/shared/sites.ts'

function toMatchPattern(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.hostname}/*`
  } catch {
    return null
  }
}

/** Optional boards are registered at runtime once the user grants access (see sites.ts). */
export const JOB_BOARD_MATCHES = STATIC_BOARD_IDS.flatMap((id) => [...BOARDS[id].matches])

/** Hiring systems whose application forms CVSpec fills. Embedded forms load in an iframe. */
export const APPLY_FORM_MATCHES = [
  'https://boards.greenhouse.io/*',
  'https://job-boards.greenhouse.io/*',
  'https://boards.eu.greenhouse.io/*',
  'https://job-boards.eu.greenhouse.io/*',
  'https://jobs.lever.co/*',
  'https://jobs.eu.lever.co/*',
]

export default defineManifest(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const webMatches = [toMatchPattern(env.VITE_WEB_URL)].filter((value): value is string =>
    Boolean(value),
  )
  const apiMatches = [
    toMatchPattern(env.VITE_API_URL),
    toMatchPattern(env.VITE_SUPABASE_URL),
  ].filter((value): value is string => Boolean(value))

  return {
    manifest_version: 3,
    name: 'CVSpec',
    description:
      'Save jobs from LinkedIn, Indeed, PNet and 20+ more sites, tailor your resume and cover letter, and fill Greenhouse, Lever and Workday applications with them.',
    version: pkg.version,
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'CVSpec',
      default_icon: {
        16: 'icons/icon-16.png',
        48: 'icons/icon-48.png',
      },
      default_popup: 'src/popup/index.html',
    },
    options_ui: {
      page: 'src/options/index.html',
      open_in_tab: true,
    },
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module',
    },
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: Array.from(new Set([...apiMatches, ...webMatches])),
    optional_host_permissions: OPTIONAL_HOST_PATTERNS,
    content_scripts: [
      {
        matches: webMatches,
        js: ['src/content/bridge.ts'],
        run_at: 'document_idle',
      },
      {
        matches: JOB_BOARD_MATCHES,
        js: ['src/content/jobBoard.tsx'],
        run_at: 'document_idle',
      },
      {
        matches: APPLY_FORM_MATCHES,
        js: ['src/content/applyForm/index.tsx'],
        all_frames: true,
        run_at: 'document_idle',
      },
    ],
  }
})
