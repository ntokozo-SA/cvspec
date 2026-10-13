import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueItem, QueueStatus } from '../../background/queue'
import type { ExtensionRequest } from '../../shared/messages'
import type { Application, ApplicantProfile, TailoredFile } from '../../shared/types'
import { greenhouseAdapter } from './adapters/greenhouse'
import { FillBar } from './FillBar'
import greenhouseHtml from './__fixtures__/greenhouse.html?raw'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const START_PATH = window.location.pathname

const application: Application = {
  id: 'app-1',
  title: 'Senior Engineer',
  company: 'Acme',
  location: 'Cape Town',
  board: 'linkedin',
  source_url: 'https://www.linkedin.com/jobs/view/1/',
  status: 'saved',
  comparison_id: 'cmp-1',
  resume_id: 'res-1',
  created_at: '2026-10-13T08:00:00Z',
  comparison: null,
  tailored_comparison_id: 'cmp-1',
  tailored_recommendations: [0],
  cover_letter: null,
  apply_url: null,
}

const profile: ApplicantProfile = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+27 82 123 4567',
  location: 'Cape Town',
  linkedinUrl: null,
  websiteUrl: null,
  updatedAt: null,
  saved: true,
}

const file: TailoredFile = { base64: btoa('PK docx'), fileName: 'Jane-Doe.docx', unapplied: [] }

const item: QueueItem = {
  applicationId: 'app-1',
  title: 'Senior Engineer',
  company: 'Acme',
  url: 'https://job-boards.greenhouse.io/acme/jobs/123',
  isForm: true,
  status: 'current',
}

let phase: QueueStatus['phase'] = 'active'
let sent: ExtensionRequest[] = []

function queueStatus(): QueueStatus {
  return {
    phase,
    position: 1,
    total: 2,
    current: { ...item, status: phase === 'submitted' ? 'submitted' : 'current' },
    items: [item],
    thisTab: true,
  }
}

function respond(request: ExtensionRequest): unknown {
  switch (request.type) {
    case 'GET_AUTH':
      return { connected: true, email: 'jane@example.com' }
    case 'GET_APPLY_CONTEXT':
      return application
    case 'GET_APPLY_PACKAGE':
      return { application, profile, file, fileError: null }
    case 'QUEUE_STATUS':
      return queueStatus()
    case 'MARK_SUBMITTED':
      phase = 'submitted'
      return { ...application, status: 'applied' }
    case 'QUEUE_NEXT':
      phase = 'ready'
      return { ...queueStatus(), thisTab: false }
    case 'GET_ANSWERS':
    case 'LIST_BANK':
    case 'DRAFT_ANSWERS':
      return []
    default:
      return null
  }
}

async function waitUntil(check: () => boolean, timeoutMs = 8000): Promise<void> {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }
}

function button(container: HTMLElement, text: RegExp): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((element) =>
    text.test(element.textContent ?? ''),
  )
}

describe('FillBar on an apply queue tab', () => {
  let root: Root | null = null
  const submits = vi.fn()

  beforeEach(() => {
    phase = 'active'
    sent = []
    submits.mockReset()
    sessionStorage.clear()
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async (request: ExtensionRequest) => {
          sent.push(request)
          return { ok: true, data: respond(request) }
        }),
      },
    })
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(submits)
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(submits)
    document.addEventListener('submit', submits, true)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    document.removeEventListener('submit', submits, true)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    window.history.replaceState({}, '', START_PATH)
  })

  it(
    'fills automatically, never submits, and offers the next job after the confirmation page',
    async () => {
      document.body.innerHTML = greenhouseHtml
      const container = document.createElement('div')
      document.body.append(container)
      root = createRoot(container)
      act(() => root!.render(createElement(FillBar, { adapter: greenhouseAdapter })))

      const firstName = document.querySelector<HTMLInputElement>('#first_name')!
      await waitUntil(() => firstName.value === 'Jane')
      expect(sent.filter((request) => request.type === 'GET_APPLY_PACKAGE')).toHaveLength(1)
      expect(sent).toContainEqual({
        type: 'SET_APPLY_URL',
        applicationId: 'app-1',
        url: window.location.href,
      })
      expect(container.textContent).toContain('Apply queue: job 1 of 2')
      expect(submits).not.toHaveBeenCalled()

      window.history.pushState({}, '', '/acme/jobs/123/confirmation')
      await waitUntil(() => sent.some((request) => request.type === 'MARK_SUBMITTED'))
      await waitUntil(() => button(container, /next job/i) !== undefined)
      expect(submits).not.toHaveBeenCalled()
      expect(sent.filter((request) => request.type === 'GET_APPLY_PACKAGE')).toHaveLength(1)

      await act(async () => {
        button(container, /next job/i)!.click()
      })
      await waitUntil(() => sent.some((request) => request.type === 'QUEUE_NEXT'))
    },
    20000,
  )

  it('waits for the user when the tab is not part of the queue', async () => {
    phase = 'stopped'
    document.body.innerHTML = greenhouseHtml
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root!.render(createElement(FillBar, { adapter: greenhouseAdapter })))

    await waitUntil(() => button(container, /^fill$/i) !== undefined)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    expect(sent.some((request) => request.type === 'GET_APPLY_PACKAGE')).toBe(false)
    expect(document.querySelector<HTMLInputElement>('#first_name')!.value).toBe('')
  })
})
