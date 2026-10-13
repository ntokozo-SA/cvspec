import { SCRIPT_ID_PREFIX, scriptIdFor, SITE_IDS, SITES, type SiteId } from '../shared/sites'
import { SCRIPT_PATHS } from './scriptPaths'

type ContentScript = chrome.scripting.RegisteredContentScript

export function contentScriptFor(id: SiteId): ContentScript {
  const site = SITES[id]
  return {
    id: scriptIdFor(id),
    matches: [...site.patterns],
    js: [SCRIPT_PATHS[site.kind]],
    allFrames: site.allFrames,
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }
}

/** Sites the user has granted access to. */
export async function grantedSites(): Promise<SiteId[]> {
  const granted = await Promise.all(
    SITE_IDS.map((id) => chrome.permissions.contains({ origins: [...SITES[id].patterns] })),
  )
  return SITE_IDS.filter((_, index) => granted[index])
}

let syncing: Promise<void> = Promise.resolve()

/**
 * Makes the registered content scripts match the granted sites: registers newly granted ones and
 * unregisters revoked ones. Runs one at a time so overlapping events cannot double-register.
 */
export function syncSiteScripts(): Promise<void> {
  const run = syncing.then(async () => {
    const [registered, granted] = await Promise.all([
      chrome.scripting.getRegisteredContentScripts(),
      grantedSites(),
    ])
    const ours = registered.filter((script) => script.id.startsWith(SCRIPT_ID_PREFIX))
    const wanted = new Set(granted.map(scriptIdFor))
    const existing = new Set(ours.map((script) => script.id))

    const stale = ours.filter((script) => !wanted.has(script.id)).map((script) => script.id)
    if (stale.length > 0) await chrome.scripting.unregisterContentScripts({ ids: stale })

    const missing = granted.filter((id) => !existing.has(scriptIdFor(id))).map(contentScriptFor)
    if (missing.length > 0) await chrome.scripting.registerContentScripts(missing)
  })
  syncing = run.catch(() => undefined)
  return run
}

/** Sites whose patterns are all covered by `origins`. */
export function sitesForOrigins(origins: readonly string[]): SiteId[] {
  const set = new Set(origins)
  return SITE_IDS.filter((id) => SITES[id].patterns.every((pattern) => set.has(pattern)))
}

/** Runs the newly allowed site's script in tabs already open on it, so no reload is needed. */
async function injectIntoOpenTabs(sites: SiteId[]): Promise<void> {
  for (const id of sites) {
    const site = SITES[id]
    const tabs = await chrome.tabs.query({ url: [...site.patterns] })
    for (const tab of tabs) {
      if (tab.id === undefined) continue
      await chrome.scripting
        .executeScript({
          target: { tabId: tab.id, allFrames: site.allFrames },
          files: [SCRIPT_PATHS[site.kind]],
        })
        .catch(() => undefined)
    }
  }
}

export function registerSiteListeners(): void {
  chrome.permissions.onAdded.addListener((permissions) => {
    void syncSiteScripts()
      .then(() => injectIntoOpenTabs(sitesForOrigins(permissions.origins ?? [])))
      .catch((err: unknown) => console.warn('[CVSpec] Could not enable site', err))
  })
  chrome.permissions.onRemoved.addListener(() => {
    void syncSiteScripts().catch((err: unknown) =>
      console.warn('[CVSpec] Could not disable site', err),
    )
  })
  chrome.runtime.onStartup.addListener(() => {
    void syncSiteScripts().catch(() => undefined)
  })
  chrome.runtime.onInstalled.addListener(() => {
    void syncSiteScripts().catch(() => undefined)
  })
}
