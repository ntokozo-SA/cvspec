/**
 * The apply queue as a pure state machine. The runner in `queueRunner.ts` stores the state and
 * opens tabs; nothing here touches Chrome. The queue only moves on when the current job is
 * submitted (detected on the confirmation page) or the user skips it. It never submits.
 */

export type QueueItemStatus = 'pending' | 'current' | 'submitted' | 'skipped'

export interface QueueItem {
  applicationId: string
  title: string | null
  company: string | null
  /** The application form when known, else the job posting. */
  url: string
  /** True when `url` is the application form itself. */
  isForm: boolean
  status: QueueItemStatus
  note?: string
}

export type QueuePhase =
  /** Waiting for the user to open the current job (or after a closed tab). */
  | 'ready'
  /** The current job is open in `tabIds`. */
  | 'active'
  /** The current job was submitted; waiting for Next. */
  | 'submitted'
  | 'done'
  | 'stopped'

export interface QueueState {
  items: QueueItem[]
  /** Index of the current item, or -1 when none is left. */
  index: number
  phase: QueuePhase
  /** Tabs showing the current job: the job page and any form tab it opened. */
  tabIds: number[]
}

export type QueueEvent =
  | { type: 'load'; items: Array<Omit<QueueItem, 'status'>> }
  | { type: 'opened'; tabId: number }
  /** A tab opened from one of the current job's tabs (the Apply click). */
  | { type: 'tabCreated'; tabId: number; openerTabId: number }
  | { type: 'tabClosed'; tabId: number }
  | { type: 'submitted'; applicationId: string }
  | { type: 'next' }
  | { type: 'skip'; note?: string }
  /** The job board reported its own built-in form for the current job. */
  | { type: 'builtIn'; applicationId: string }
  | { type: 'stop' }

export const EMPTY_QUEUE: QueueState = { items: [], index: -1, phase: 'stopped', tabIds: [] }

export const BUILT_IN_NOTE = "Uses the job board's own application form. Apply there yourself."

function advance(state: QueueState): QueueState {
  const next = state.items.findIndex((item, index) => index > state.index && item.status === 'pending')
  if (next < 0) return { ...state, index: -1, phase: 'done', tabIds: [] }
  return {
    ...state,
    index: next,
    phase: 'ready',
    tabIds: [],
    items: state.items.map((item, index) =>
      index === next ? { ...item, status: 'current' } : item,
    ),
  }
}

function setCurrent(state: QueueState, change: Partial<QueueItem>): QueueItem[] {
  return state.items.map((item, index) => (index === state.index ? { ...item, ...change } : item))
}

export function current(state: QueueState): QueueItem | null {
  return state.index >= 0 ? (state.items[state.index] ?? null) : null
}

export function isRunning(state: QueueState): boolean {
  return state.phase === 'ready' || state.phase === 'active' || state.phase === 'submitted'
}

export function reduceQueue(state: QueueState, event: QueueEvent): QueueState {
  switch (event.type) {
    case 'load': {
      const items = event.items.map((item) => ({ ...item, status: 'pending' as const }))
      return advance({ items, index: -1, phase: 'ready', tabIds: [] })
    }

    case 'opened':
      if (state.phase !== 'ready' && state.phase !== 'active') return state
      return {
        ...state,
        phase: 'active',
        tabIds: state.tabIds.includes(event.tabId) ? state.tabIds : [...state.tabIds, event.tabId],
      }

    case 'tabCreated':
      if (state.phase !== 'active' || !state.tabIds.includes(event.openerTabId)) return state
      return { ...state, tabIds: [...state.tabIds, event.tabId] }

    case 'tabClosed': {
      if (!state.tabIds.includes(event.tabId)) return state
      const tabIds = state.tabIds.filter((id) => id !== event.tabId)
      if (tabIds.length > 0 || state.phase !== 'active') return { ...state, tabIds }
      return { ...state, tabIds, phase: 'ready' }
    }

    case 'submitted': {
      const item = current(state)
      if (!item || item.applicationId !== event.applicationId || !isRunning(state)) return state
      return { ...state, phase: 'submitted', items: setCurrent(state, { status: 'submitted' }) }
    }

    case 'next':
      if (state.phase !== 'submitted') return state
      return advance(state)

    case 'skip':
      if (state.phase !== 'ready' && state.phase !== 'active') return state
      return advance({ ...state, items: setCurrent(state, { status: 'skipped', note: event.note }) })

    case 'builtIn': {
      const item = current(state)
      if (!item || item.applicationId !== event.applicationId) return state
      if (state.phase !== 'ready' && state.phase !== 'active') return state
      return advance({ ...state, items: setCurrent(state, { status: 'skipped', note: BUILT_IN_NOTE }) })
    }

    case 'stop':
      return { ...state, phase: 'stopped', tabIds: [] }
  }
}

/** What the queue page and the in-page status line show. */
export interface QueueStatus {
  phase: QueuePhase
  /** 1-based position of the current job among all queued jobs, or 0 when none. */
  position: number
  total: number
  current: QueueItem | null
  items: QueueItem[]
  /** True when the asking tab shows the current job. */
  thisTab: boolean
}

export function queueStatus(state: QueueState, tabId?: number): QueueStatus {
  return {
    phase: state.phase,
    position: state.index >= 0 ? state.index + 1 : 0,
    total: state.items.length,
    current: current(state),
    items: state.items,
    thisTab: tabId !== undefined && state.tabIds.includes(tabId),
  }
}
