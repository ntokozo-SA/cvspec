import { WEB_ORIGIN, WEB_URL } from '../shared/config'
import {
  ExtensionError,
  type ExtensionRequest,
  type ExtensionResponse,
  type ResponseMap,
} from '../shared/messages'
import {
  analyzeApplication,
  findApplicationByUrl,
  listApplications,
  listResumes,
  saveApplication,
  updateApplicationStatus,
} from './api'
import { completeHandoff, getAuthState, signOut } from './auth'

function senderOrigin(sender: chrome.runtime.MessageSender): string | null {
  const raw = sender.url ?? sender.tab?.url
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return senderOrigin(sender) === new URL(chrome.runtime.getURL('/')).origin
}

function isCvspecWebApp(sender: chrome.runtime.MessageSender): boolean {
  const origin = senderOrigin(sender)
  return origin === WEB_ORIGIN || origin === 'https://cvspec.com' || origin === 'https://www.cvspec.com'
}

async function handle(
  request: ExtensionRequest,
  sender: chrome.runtime.MessageSender,
): Promise<ResponseMap[ExtensionRequest['type']]> {
  switch (request.type) {
    case 'GET_AUTH':
      return getAuthState()
    case 'HANDOFF':
      if (!isCvspecWebApp(sender)) throw new ExtensionError('Handoff rejected', 403)
      return completeHandoff(request.tokenHash)
    case 'SIGNOUT':
      if (!isCvspecWebApp(sender) && !isExtensionPage(sender)) {
        throw new ExtensionError('Sign out rejected', 403)
      }
      return signOut()
    case 'CHECK_SAVED':
      return findApplicationByUrl(request.url)
    case 'SAVE_JOB':
      return saveApplication(request.job, request.analyze ?? true)
    case 'LIST_APPLICATIONS':
      return listApplications()
    case 'LIST_RESUMES':
      return listResumes()
    case 'ANALYZE':
      return analyzeApplication(request.applicationId, request.resumeId)
    case 'UPDATE_STATUS':
      return updateApplicationStatus(request.applicationId, request.status)
  }
}

chrome.runtime.onMessage.addListener((request: ExtensionRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false

  handle(request, sender).then(
    (data) => sendResponse({ ok: true, data } satisfies ExtensionResponse<typeof data>),
    (err: unknown) => {
      const status = err instanceof ExtensionError ? err.status : undefined
      const error = err instanceof Error ? err.message : 'Unexpected extension error'
      sendResponse({ ok: false, error, status } satisfies ExtensionResponse<never>)
    },
  )
  return true
})

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({ url: `${WEB_URL}/app` })
  }
})
