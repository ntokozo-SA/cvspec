import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_NOTE,
  EMPTY_QUEUE,
  queueStatus,
  reduceQueue,
  type QueueEvent,
  type QueueState,
} from './queue'

const items = ['a', 'b', 'c'].map((id) => ({
  applicationId: id,
  title: `Job ${id}`,
  company: 'Acme',
  url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  isForm: true,
}))

function run(...events: QueueEvent[]): QueueState {
  return events.reduce(reduceQueue, EMPTY_QUEUE)
}

const load: QueueEvent = { type: 'load', items }

describe('apply queue state machine', () => {
  it('starts on the first job, waiting for its tab to open', () => {
    const state = run(load)
    expect(state.phase).toBe('ready')
    expect(state.index).toBe(0)
    expect(state.items.map((item) => item.status)).toEqual(['current', 'pending', 'pending'])

    const opened = reduceQueue(state, { type: 'opened', tabId: 7 })
    expect(opened.phase).toBe('active')
    expect(queueStatus(opened, 7)).toMatchObject({ position: 1, total: 3, thisTab: true })
    expect(queueStatus(opened, 8).thisTab).toBe(false)
  })

  it('advances only after the current job is submitted and the user clicks Next', () => {
    const active = run(load, { type: 'opened', tabId: 7 })
    expect(reduceQueue(active, { type: 'next' })).toBe(active)
    expect(reduceQueue(active, { type: 'submitted', applicationId: 'b' })).toBe(active)

    const submitted = reduceQueue(active, { type: 'submitted', applicationId: 'a' })
    expect(submitted.phase).toBe('submitted')
    expect(submitted.index).toBe(0)
    expect(submitted.items[0].status).toBe('submitted')

    const next = reduceQueue(submitted, { type: 'next' })
    expect(next).toMatchObject({ phase: 'ready', index: 1, tabIds: [] })
    expect(next.items[1].status).toBe('current')
  })

  it('skips the current job and finishes after the last one', () => {
    const state = run(
      load,
      { type: 'opened', tabId: 1 },
      { type: 'skip' },
      { type: 'opened', tabId: 1 },
      { type: 'skip' },
      { type: 'opened', tabId: 1 },
      { type: 'submitted', applicationId: 'c' },
      { type: 'next' },
    )
    expect(state.phase).toBe('done')
    expect(state.index).toBe(-1)
    expect(state.items.map((item) => item.status)).toEqual(['skipped', 'skipped', 'submitted'])
  })

  it('does not skip once the job is submitted', () => {
    const submitted = run(load, { type: 'opened', tabId: 1 }, { type: 'submitted', applicationId: 'a' })
    expect(reduceQueue(submitted, { type: 'skip' })).toBe(submitted)
  })

  it('stops on request and ignores later events', () => {
    const stopped = run(load, { type: 'opened', tabId: 1 }, { type: 'stop' })
    expect(stopped.phase).toBe('stopped')
    expect(stopped.tabIds).toEqual([])
    expect(reduceQueue(stopped, { type: 'submitted', applicationId: 'a' })).toBe(stopped)
    expect(reduceQueue(stopped, { type: 'skip' })).toBe(stopped)
  })

  it('follows the form tab the job page opens and pauses when every tab is closed', () => {
    let state = run(load, { type: 'opened', tabId: 1 })
    state = reduceQueue(state, { type: 'tabCreated', tabId: 2, openerTabId: 1 })
    expect(state.tabIds).toEqual([1, 2])
    expect(reduceQueue(state, { type: 'tabCreated', tabId: 9, openerTabId: 5 }).tabIds).toEqual([
      1, 2,
    ])

    state = reduceQueue(state, { type: 'tabClosed', tabId: 1 })
    expect(state.phase).toBe('active')
    state = reduceQueue(state, { type: 'tabClosed', tabId: 2 })
    expect(state).toMatchObject({ phase: 'ready', index: 0, tabIds: [] })
    expect(state.items[0].status).toBe('current')
  })

  it('auto-skips a job whose board uses its own application form', () => {
    const active = run(load, { type: 'opened', tabId: 1 })
    expect(reduceQueue(active, { type: 'builtIn', applicationId: 'b' })).toBe(active)

    const skipped = reduceQueue(active, { type: 'builtIn', applicationId: 'a' })
    expect(skipped.items[0]).toMatchObject({ status: 'skipped', note: BUILT_IN_NOTE })
    expect(skipped).toMatchObject({ phase: 'ready', index: 1 })
  })

  it('is done straight away when nothing is queued', () => {
    expect(run({ type: 'load', items: [] }).phase).toBe('done')
  })
})
