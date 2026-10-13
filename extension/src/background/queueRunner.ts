import { ExtensionError } from '../shared/messages'
import { getApplyQueue, updateApplyInfo } from './api'
import { linkTab } from './applyTabs'
import {
  current,
  EMPTY_QUEUE,
  isRunning,
  queueStatus,
  reduceQueue,
  type QueueEvent,
  type QueueItem,
  type QueueState,
  type QueueStatus,
} from './queue'

const STORAGE_KEY = 'cvspec-apply-queue'
export const QUEUE_PAGE = 'src/queue/index.html'

let chain: Promise<unknown> = Promise.resolve()

async function read(): Promise<QueueState> {
  const stored = await chrome.storage.session.get(STORAGE_KEY)
  return (stored[STORAGE_KEY] as QueueState | undefined) ?? EMPTY_QUEUE
}

/** Applies an event to the stored state, one at a time. */
function dispatch(event: QueueEvent): Promise<{ before: QueueState; after: QueueState }> {
  const run = chain.then(async () => {
    const before = await read()
    const after = reduceQueue(before, event)
    if (after !== before) await chrome.storage.session.set({ [STORAGE_KEY]: after })
    return { before, after }
  })
  chain = run.catch(() => undefined)
  return run
}

async function tabExists(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.get(tabId)
    return true
  } catch {
    return false
  }
}

/** Opens the current job, reusing `reuseTabId` when it is still open. */
async function openCurrent(state: QueueState, reuseTabId?: number): Promise<QueueState> {
  const item = current(state)
  if (!item || state.phase !== 'ready') return state
  let tabId: number | undefined
  if (reuseTabId !== undefined && (await tabExists(reuseTabId))) {
    await chrome.tabs.update(reuseTabId, { url: item.url, active: true })
    tabId = reuseTabId
  } else {
    tabId = (await chrome.tabs.create({ url: item.url, active: true })).id
  }
  if (tabId === undefined) return state
  await linkTab(tabId, item.applicationId)
  return (await dispatch({ type: 'opened', tabId })).after
}

/** Applies an event that may move to the next job, then opens it in the same tab. */
async function move(event: QueueEvent): Promise<QueueState> {
  const { before, after } = await dispatch(event)
  if (after.index !== before.index && after.phase === 'ready') {
    return openCurrent(after, before.tabIds[before.tabIds.length - 1])
  }
  return after
}

function toItem(application: Awaited<ReturnType<typeof getApplyQueue>>[number]) {
  return {
    applicationId: application.id,
    title: application.title,
    company: application.company,
    url: application.apply_url ?? application.source_url,
    isForm: Boolean(application.apply_url),
  } satisfies Omit<QueueItem, 'status'>
}

/** The queue saved in CVSpec, for the queue page to show before the user starts it. */
export async function previewQueue(): Promise<QueueItem[]> {
  const queued = await getApplyQueue()
  return queued
    .filter((application) => application.status === 'saved' && !application.built_in_apply)
    .map((application) => ({ ...toItem(application), status: 'pending' as const }))
}

/** Loads the queue from CVSpec and opens the first job. Called from a click on the queue page. */
export async function startQueue(): Promise<QueueStatus> {
  const items = (await previewQueue()).map(({ status: _status, ...item }) => item)
  if (items.length === 0) {
    throw new ExtensionError('Your apply queue is empty. Add saved jobs to it in CVSpec first.', 400)
  }
  const { after } = await dispatch({ type: 'load', items })
  return queueStatus(await openCurrent(after))
}

export async function getQueueStatus(tabId?: number): Promise<QueueStatus> {
  return queueStatus(await read(), tabId)
}

/** Opens the current job again after its tab was closed. */
export async function resumeQueue(): Promise<QueueStatus> {
  return queueStatus(await openCurrent(await read()))
}

export async function queueNext(): Promise<QueueStatus> {
  return queueStatus(await move({ type: 'next' }))
}

export async function queueSkip(): Promise<QueueStatus> {
  return queueStatus(await move({ type: 'skip', note: 'Skipped' }))
}

export async function queueStop(): Promise<QueueStatus> {
  return queueStatus((await dispatch({ type: 'stop' })).after)
}

/** Called when a form's confirmation page marks the job applied. Waits for the user's Next. */
export async function queueSubmitted(applicationId: string): Promise<void> {
  await dispatch({ type: 'submitted', applicationId })
}

/** The job board uses its own form for this job: record it, skip it and open the next one. */
export async function queueBuiltIn(applicationId: string, tabId?: number): Promise<QueueStatus> {
  const state = await read()
  const item = current(state)
  if (!item || item.applicationId !== applicationId || !isRunning(state)) {
    return queueStatus(state, tabId)
  }
  await updateApplyInfo(applicationId, { builtInApply: true }).catch(() => undefined)
  return queueStatus(await move({ type: 'builtIn', applicationId }), tabId)
}

export async function openQueuePage(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(QUEUE_PAGE) })
}

export function registerQueueListeners(): void {
  chrome.tabs.onCreated.addListener((tab) => {
    const opener = tab.openerTabId
    if (tab.id === undefined || opener === undefined) return
    const tabId = tab.id
    void dispatch({ type: 'tabCreated', tabId, openerTabId: opener }).then(({ before, after }) => {
      const item = current(after)
      if (after !== before && item) return linkTab(tabId, item.applicationId)
    })
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    void dispatch({ type: 'tabClosed', tabId })
  })
}
