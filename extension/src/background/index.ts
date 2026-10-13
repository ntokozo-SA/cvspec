import { WEB_ORIGIN, WEB_URL } from '../shared/config'
import {
  ExtensionError,
  type ExtensionRequest,
  type ExtensionResponse,
  type ResponseMap,
} from '../shared/messages'
import { isSensitiveQuestion } from '../shared/sensitive'
import {
  analyzeApplication,
  draftAnswers,
  draftCoverLetter,
  fetchCoverLetterFile,
  fetchTailoredResume,
  findApplicationByUrl,
  getAnswers,
  getApplication,
  listApplications,
  listBank,
  listResumes,
  saveAnswers,
  saveApplication,
  saveBankAnswer,
  saveCoverLetter,
  saveTailoring,
  tailoredScore,
  updateApplicationStatus,
  updateApplyInfo,
} from './api'
import {
  applicationForTab,
  armTab,
  buildApplyPackage,
  linkTab,
  registerApplyTabListeners,
  unlinkTab,
} from './applyTabs'
import { completeHandoff, getAuthState, signOut } from './auth'
import {
  getQueueStatus,
  openQueuePage,
  previewQueue,
  queueBuiltIn,
  queueNext,
  queueSkip,
  queueStop,
  queueSubmitted,
  registerQueueListeners,
  resumeQueue,
  startQueue,
} from './queueRunner'
import { registerSiteListeners } from './sites'

function senderTabId(sender: chrome.runtime.MessageSender): number {
  const tabId = sender.tab?.id
  if (tabId === undefined) throw new ExtensionError('This action only works from a browser tab', 400)
  return tabId
}

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
  return senderOrigin(sender) === WEB_ORIGIN
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
    case 'SAVE_TAILORING':
      return saveTailoring(request.applicationId, request.tailoring)
    case 'TAILORED_SCORE':
      return tailoredScore(request.tailoring)
    case 'DOWNLOAD_TAILORED':
      return fetchTailoredResume(request.tailoring)
    case 'ARM_APPLY':
      await armTab(senderTabId(sender), request.applicationId)
      return null
    case 'GET_APPLY_CONTEXT':
      return applicationForTab(senderTabId(sender))
    case 'SET_APPLY_CONTEXT': {
      const application = await getApplication(request.applicationId)
      await linkTab(senderTabId(sender), application.id)
      return application
    }
    case 'GET_APPLY_PACKAGE':
      return buildApplyPackage(request.applicationId)
    case 'MARK_SUBMITTED': {
      const updated = await updateApplicationStatus(request.applicationId, 'applied')
      if (sender.tab?.id !== undefined) await unlinkTab(sender.tab.id)
      await queueSubmitted(request.applicationId)
      return updated
    }
    case 'SET_APPLY_URL': {
      if (!/^https?:\/\//i.test(request.url)) return null
      await updateApplyInfo(request.applicationId, { applyUrl: request.url.slice(0, 2000) })
      return null
    }
    case 'QUEUE_OPEN':
      if (!isCvspecWebApp(sender)) throw new ExtensionError('Only CVSpec can open the queue', 403)
      await openQueuePage()
      return null
    case 'QUEUE_PREVIEW':
      if (!isExtensionPage(sender)) throw new ExtensionError('Queue preview rejected', 403)
      return previewQueue()
    case 'QUEUE_START':
      if (!isExtensionPage(sender)) throw new ExtensionError('Start the queue from its page', 403)
      return startQueue()
    case 'QUEUE_RESUME':
      return resumeQueue()
    case 'QUEUE_STATUS':
      return getQueueStatus(sender.tab?.id)
    case 'QUEUE_NEXT':
      return queueNext()
    case 'QUEUE_SKIP':
      return queueSkip()
    case 'QUEUE_STOP':
      return queueStop()
    case 'QUEUE_BUILT_IN':
      return queueBuiltIn(request.applicationId, sender.tab?.id)
    case 'GET_ANSWERS':
      return getAnswers(request.applicationId)
    case 'DRAFT_ANSWERS':
      return draftAnswers(
        request.applicationId,
        request.questions.filter((question) => !isSensitiveQuestion(question.label)),
      )
    case 'SAVE_ANSWERS':
      return saveAnswers(
        request.applicationId,
        request.answers.filter((answer) => !isSensitiveQuestion(answer.questionLabel)),
      )
    case 'LIST_BANK':
      return listBank()
    case 'SAVE_BANK_ANSWER':
      return saveBankAnswer(request.answer)
    case 'DRAFT_COVER_LETTER':
      return draftCoverLetter(request.applicationId, {
        tone: request.tone,
        length: request.length,
      })
    case 'SAVE_COVER_LETTER':
      return saveCoverLetter(request.applicationId, request.coverLetter)
    case 'GET_COVER_LETTER_FILE':
      return fetchCoverLetterFile(request.applicationId, request.format)
  }
}

registerApplyTabListeners()
registerSiteListeners()
registerQueueListeners()

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
