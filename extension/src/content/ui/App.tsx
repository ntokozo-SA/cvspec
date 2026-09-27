import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { SESSION_STORAGE_KEY, WEB_URL } from '../../shared/config'
import { ExtensionError, sendMessage } from '../../shared/messages'
import type { Application, AuthState } from '../../shared/types'
import type { JobBoardAdapter } from '../adapters'
import { ActionBar, type SaveState } from './ActionBar'
import { TailorPanel } from './TailorPanel'

export function App({
  adapter,
  barContainer,
}: {
  adapter: JobBoardAdapter
  barContainer: HTMLElement
}): ReactElement {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [application, setApplication] = useState<Application | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const refresh = useCallback(async () => {
    let next: AuthState
    try {
      next = await sendMessage({ type: 'GET_AUTH' })
    } catch {
      next = { connected: false }
    }
    setAuth(next)
    if (!next.connected) return

    try {
      const existing = await sendMessage({ type: 'CHECK_SAVED', url: window.location.href })
      if (existing) {
        setApplication(existing)
        setSaveState('saved')
      }
    } catch {
      // saved-state lookup is best effort
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && SESSION_STORAGE_KEY in changes) void refresh()
    }
    chrome.storage.onChanged.addListener(onStorage)
    return () => chrome.storage.onChanged.removeListener(onStorage)
  }, [refresh])

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ExtensionError && err.unauthenticated) {
      setAuth({ connected: false })
      setPanelOpen(true)
      return
    }
    setNotice(err instanceof Error ? err.message : 'Something went wrong')
  }, [])

  const save = useCallback(
    async (analyze: boolean): Promise<Application | null> => {
      if (application) return application
      const job = adapter.extract()
      if (!job) {
        setSaveState('error')
        setNotice('Could not read this posting yet. Open the full job description and try again.')
        return null
      }

      setSaveState('syncing')
      setNotice(null)
      try {
        const saved = await sendMessage({ type: 'SAVE_JOB', job, analyze })
        setApplication(saved)
        setSaveState('saved')
        return saved
      } catch (err) {
        setSaveState('error')
        handleError(err)
        return null
      }
    },
    [adapter, application, handleError],
  )

  useEffect(() => {
    if (panelOpen && auth?.connected && !application && saveState === 'idle') void save(false)
  }, [panelOpen, auth, application, saveState, save])

  const onSave = useCallback(() => {
    if (saveState === 'saved') {
      window.open(`${WEB_URL}/app/applications`, '_blank', 'noopener')
      return
    }
    if (auth && !auth.connected) {
      setPanelOpen(true)
      return
    }
    void save(true)
  }, [auth, save, saveState])

  const onTailor = useCallback(async () => {
    if (auth && !auth.connected) {
      setPanelOpen(true)
      return
    }
    const saved = await save(false)
    if (saved) setPanelOpen(true)
  }, [auth, save])

  return (
    <>
      {createPortal(
        <ActionBar
          saveState={saveState}
          notice={notice}
          onSave={onSave}
          onTailor={() => void onTailor()}
          onDismissNotice={() => setNotice(null)}
        />,
        barContainer,
      )}
      <TailorPanel
        open={panelOpen}
        auth={auth}
        application={application}
        saveError={saveState === 'error' ? notice : null}
        onApplicationChange={setApplication}
        onClose={() => setPanelOpen(false)}
      />
    </>
  )
}
