import { beforeEach, describe, expect, it, vi } from 'vitest'
import manifestFactory, { APPLY_FORM_MATCHES, JOB_BOARD_MATCHES } from '../../manifest.config'
import { BOARDS, boardForUrl, STATIC_BOARD_IDS } from '../shared/boards'
import {
  OPTIONAL_HOST_PATTERNS,
  scriptIdFor,
  SITE_IDS,
  siteForUrl,
  SITES,
  type SiteId,
} from '../shared/sites'

vi.mock('./scriptPaths', () => ({
  SCRIPT_PATHS: { board: 'assets/jobBoard.js', apply: 'assets/applyForm.js' },
}))

const { contentScriptFor, sitesForOrigins, syncSiteScripts } = await import('./sites')

/** Hostnames a Chrome match pattern covers, for checking it against the host regex. */
function sampleHosts(pattern: string): string[] {
  const host = new URL(pattern.replace('*.', 'wildcard.').replace(/\*$/, '')).hostname
  return host.startsWith('wildcard.')
    ? [host.replace('wildcard.', 'www.'), host.replace('wildcard.', 'careers.')]
    : [host]
}

describe('site registry', () => {
  it('has host regexes that agree with every pattern', () => {
    for (const id of SITE_IDS) {
      for (const pattern of SITES[id].patterns) {
        expect(pattern, id).toMatch(/^https:\/\/[^/]+\/\*$/)
        for (const host of sampleHosts(pattern)) {
          expect(SITES[id].host.test(host), `${id}: ${host}`).toBe(true)
          expect(siteForUrl(`https://${host}/jobs/1`)).toBe(id)
        }
      }
    }
  })

  it('recognises real South African employer URLs', () => {
    expect(siteForUrl('https://absa.wd3.myworkdayjobs.com/en-US/ABSAcareersite/job/1')).toBe(
      'workday',
    )
    expect(siteForUrl('https://jobs.smartrecruiters.com/StandardBank/744000012345')).toBe(
      'smartrecruiters',
    )
    expect(siteForUrl('https://career2.successfactors.eu/career?company=nedbank')).toBe(
      'successfactors',
    )
    expect(siteForUrl('https://apply.workable.com/acme/j/ABC123/apply/')).toBe('workable')
    expect(siteForUrl('https://www.pnet.co.za/jobs--Data-Analyst--123.html')).toBe('pnet')
    expect(siteForUrl('https://www.linkedin.com/jobs/view/1')).toBeNull()
    expect(siteForUrl('http://apply.workable.com/acme')).toBeNull()
    expect(siteForUrl('not a url')).toBeNull()
  })

  it('keeps optional boards in sync with boards.ts', () => {
    for (const id of SITE_IDS.filter((site) => SITES[site].kind === 'board')) {
      expect(boardForUrl(`https://${sampleHosts(SITES[id].patterns[0])[0]}/job`)).toBe(id)
      expect(STATIC_BOARD_IDS).not.toContain(id)
    }
  })
})

describe('manifest', () => {
  const manifest = (
    manifestFactory as unknown as (env: { mode: string; command: string }) => chrome.runtime.ManifestV3
  )({ mode: 'test', command: 'build' })

  it('declares every optional site as an optional host permission only', () => {
    expect(new Set(manifest.optional_host_permissions)).toEqual(new Set(OPTIONAL_HOST_PATTERNS))
    for (const pattern of OPTIONAL_HOST_PATTERNS) {
      expect(manifest.host_permissions ?? []).not.toContain(pattern)
      for (const script of manifest.content_scripts ?? []) {
        expect(script.matches ?? []).not.toContain(pattern)
      }
    }
  })

  it('injects static scripts only on the always-on boards and form hosts', () => {
    expect(JOB_BOARD_MATCHES).toEqual(STATIC_BOARD_IDS.flatMap((id) => [...BOARDS[id].matches]))
    for (const pattern of [...JOB_BOARD_MATCHES, ...APPLY_FORM_MATCHES]) {
      expect(OPTIONAL_HOST_PATTERNS).not.toContain(pattern)
    }
    expect(manifest.options_ui?.page).toBe('src/options/index.html')
  })
})

describe('content script registration', () => {
  let registered: chrome.scripting.RegisteredContentScript[]
  let granted: Set<string>
  const register = vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
    registered.push(...scripts)
  })
  const unregister = vi.fn(async ({ ids }: { ids?: string[] }) => {
    registered = registered.filter((script) => !ids?.includes(script.id))
  })

  const grant = (...ids: SiteId[]) => {
    for (const id of ids) for (const pattern of SITES[id].patterns) granted.add(pattern)
  }

  beforeEach(() => {
    registered = [{ id: 'someone-else', matches: ['https://example.com/*'], js: ['x.js'] }]
    granted = new Set()
    register.mockClear()
    unregister.mockClear()
    vi.stubGlobal('chrome', {
      permissions: {
        contains: async ({ origins }: { origins: string[] }) =>
          origins.every((origin) => granted.has(origin)),
      },
      scripting: {
        getRegisteredContentScripts: async () => [...registered],
        registerContentScripts: register,
        unregisterContentScripts: unregister,
      },
    })
  })

  it('registers the right script for each kind of site', () => {
    expect(contentScriptFor('workday')).toMatchObject({
      id: 'cvspec-site-workday',
      js: ['assets/applyForm.js'],
      allFrames: true,
      matches: ['https://*.myworkdayjobs.com/*', 'https://*.myworkdaysite.com/*'],
    })
    expect(contentScriptFor('pnet')).toMatchObject({
      js: ['assets/jobBoard.js'],
      allFrames: false,
    })
  })

  it('registers granted sites once and leaves other scripts alone', async () => {
    grant('workday', 'pnet')
    await syncSiteScripts()
    await syncSiteScripts()

    expect(register).toHaveBeenCalledTimes(1)
    expect(registered.map((script) => script.id).sort()).toEqual(
      ['cvspec-site-pnet', 'cvspec-site-workday', 'someone-else'].sort(),
    )
  })

  it('unregisters a site when access is removed', async () => {
    grant('workday', 'workable')
    await syncSiteScripts()
    granted = new Set()
    grant('workable')
    await syncSiteScripts()

    expect(unregister).toHaveBeenCalledWith({ ids: [scriptIdFor('workday')] })
    expect(registered.map((script) => script.id).sort()).toEqual(
      ['cvspec-site-workable', 'someone-else'].sort(),
    )
  })

  it('needs every pattern of a site before counting it as granted', async () => {
    granted.add('https://*.myworkdayjobs.com/*')
    await syncSiteScripts()
    expect(register).not.toHaveBeenCalled()
    expect(sitesForOrigins(['https://*.myworkdayjobs.com/*'])).toEqual([])
    expect(sitesForOrigins([...SITES.workday.patterns])).toEqual(['workday'])
  })
})
