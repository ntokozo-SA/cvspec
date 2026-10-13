import { SITE_IDS, SITES, type SiteId } from './sites'

/** Extension pages only: whether the user has granted access to each optional site. */
export async function siteAccess(): Promise<Record<SiteId, boolean>> {
  const granted = await Promise.all(
    SITE_IDS.map((id) => chrome.permissions.contains({ origins: [...SITES[id].patterns] })),
  )
  return Object.fromEntries(SITE_IDS.map((id, index) => [id, granted[index]])) as Record<
    SiteId,
    boolean
  >
}

/** Must run in a user click handler: Chrome shows its permission prompt. */
export function requestSite(id: SiteId): Promise<boolean> {
  return chrome.permissions.request({ origins: [...SITES[id].patterns] })
}

export function removeSite(id: SiteId): Promise<boolean> {
  return chrome.permissions.remove({ origins: [...SITES[id].patterns] })
}

/** Calls `onChange` whenever site access is granted or removed, from any extension page. */
export function watchSiteAccess(onChange: () => void): () => void {
  chrome.permissions.onAdded.addListener(onChange)
  chrome.permissions.onRemoved.addListener(onChange)
  return () => {
    chrome.permissions.onAdded.removeListener(onChange)
    chrome.permissions.onRemoved.removeListener(onChange)
  }
}
