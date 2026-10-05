import { defineManifest } from '@crxjs/vite-plugin'
import { loadEnv } from 'vite'
import pkg from './package.json' with { type: 'json' }

function toMatchPattern(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.hostname}/*`
  } catch {
    return null
  }
}

const JOB_BOARD_MATCHES = [
  'https://www.linkedin.com/*',
  'https://*.indeed.com/*',
  'https://*.glassdoor.com/*',
  'https://*.glassdoor.co.uk/*',
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
      'Save job postings from LinkedIn, Indeed and Glassdoor to CVSpec and tailor your resume before you apply.',
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
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module',
    },
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: Array.from(new Set([...apiMatches, ...webMatches])),
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
    ],
  }
})
