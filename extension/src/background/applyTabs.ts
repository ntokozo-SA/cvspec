import { ExtensionError } from '../shared/messages'
import type { Application, ApplyPackage, TailoredFile } from '../shared/types'
import { fetchTailoredResume, getApplication, getProfile } from './api'

const STORAGE_KEY = 'cvspec-apply-tabs'
/** How long after "Apply with tailored resume" a new tab still counts as the application form. */
export const ARM_WINDOW_MS = 60_000

interface TabLink {
  applicationId: string
  armedAt: number
  /** False while the tab is only armed (the job tab itself); true once it is the form tab. */
  linked: boolean
}

type Links = Record<string, TabLink>

let queue: Promise<unknown> = Promise.resolve()

/** Serializes read-modify-write cycles on session storage. */
function update<T>(change: (links: Links) => T): Promise<T> {
  const run = queue.then(async () => {
    const stored = await chrome.storage.session.get(STORAGE_KEY)
    const links = (stored[STORAGE_KEY] ?? {}) as Links
    const result = change(links)
    await chrome.storage.session.set({ [STORAGE_KEY]: links })
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

function isFresh(link: TabLink): boolean {
  return Date.now() - link.armedAt < ARM_WINDOW_MS
}

export function armTab(tabId: number, applicationId: string): Promise<void> {
  return update((links) => {
    links[tabId] = { applicationId, armedAt: Date.now(), linked: false }
  })
}

export function linkTab(tabId: number, applicationId: string): Promise<void> {
  return update((links) => {
    links[tabId] = { applicationId, armedAt: Date.now(), linked: true }
  })
}

export function unlinkTab(tabId: number): Promise<void> {
  return update((links) => {
    delete links[tabId]
  })
}

/** The application linked to a tab. An armed tab becomes linked the first time it is asked. */
export function applicationIdForTab(tabId: number): Promise<string | null> {
  return update((links) => {
    const link = links[tabId]
    if (!link) return null
    if (link.linked) return link.applicationId
    if (!isFresh(link)) {
      delete links[tabId]
      return null
    }
    link.linked = true
    return link.applicationId
  })
}

export async function applicationForTab(tabId: number): Promise<Application | null> {
  const applicationId = await applicationIdForTab(tabId)
  if (!applicationId) return null
  try {
    return await getApplication(applicationId)
  } catch (err) {
    if (err instanceof ExtensionError && err.status === 404) {
      await unlinkTab(tabId)
      return null
    }
    throw err
  }
}

export async function buildApplyPackage(applicationId: string): Promise<ApplyPackage> {
  const [application, profile] = await Promise.all([getApplication(applicationId), getProfile()])

  let file: TailoredFile | null = null
  let fileError: string | null = null
  const recommendations = application.tailored_recommendations ?? []
  if (!application.tailored_comparison_id || recommendations.length === 0) {
    fileError =
      'No tailored resume chosen for this job yet. Open the job post, pick edits under Tailor before applying, then fill again.'
  } else {
    try {
      file = await fetchTailoredResume({
        comparisonId: application.tailored_comparison_id,
        recommendations,
      })
    } catch (err) {
      fileError = err instanceof Error ? err.message : 'Could not build your tailored resume'
    }
  }
  return { application, profile, file, fileError }
}

export function registerApplyTabListeners(): void {
  chrome.tabs.onCreated.addListener((tab) => {
    const opener = tab.openerTabId
    if (tab.id === undefined || opener === undefined) return
    const tabId = tab.id
    void update((links) => {
      const link = links[opener]
      if (!link || !isFresh(link)) return
      links[tabId] = { applicationId: link.applicationId, armedAt: link.armedAt, linked: true }
    })
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    void unlinkTab(tabId)
  })
}
