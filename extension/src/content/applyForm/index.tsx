import { createRoot } from 'react-dom/client'
import styles from '../ui/styles.css?inline'
import { findApplyFormAdapter } from './adapters'
import { FillBar, SHOW_EVENT } from './FillBar'

const LOADED_FLAG = '__cvspecApplyFormLoaded'
/** Set by the popup before injecting this script on a page it was not declared for. */
const INJECTED_FLAG = '__cvspecApplyFormInjected'

type Flags = typeof globalThis & { [LOADED_FLAG]?: boolean; [INJECTED_FLAG]?: boolean }

function start(): void {
  const flags = globalThis as Flags
  if (flags[LOADED_FLAG]) {
    window.dispatchEvent(new CustomEvent(SHOW_EVENT))
    return
  }
  flags[LOADED_FLAG] = true

  const adapter = findApplyFormAdapter(new URL(window.location.href))
  let host: HTMLElement | null = null
  let container: HTMLElement | null = null

  /** Docks the bar right above the form, or floats it when there is no form to dock to. */
  const place = () => {
    if (!host || !container) return
    const form = adapter.form()
    if (form?.parentElement) {
      if (host.nextElementSibling !== form) form.insertAdjacentElement('beforebegin', host)
      container.classList.remove('cvs-root--floating')
    } else if (!host.isConnected) {
      document.body.append(host)
      container.classList.add('cvs-root--floating')
    }
  }

  const mount = () => {
    if (host) return
    host = document.createElement('cvspec-root')
    host.dataset.cvspec = 'fill'
    host.style.setProperty('display', 'block', 'important')
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = styles
    container = document.createElement('div')
    container.className = 'cvs-root cvs-root--bar cvs-root--fill'
    shadow.append(style, container)
    place()
    createRoot(container).render(<FillBar adapter={adapter} />)
  }

  const injected = flags[INJECTED_FLAG] === true || adapter.system === 'generic'
  const sync = () => {
    if (host) place()
    else if (injected || adapter.isReady() || adapter.isConfirmation()) mount()
  }

  let scheduled = false
  new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    setTimeout(() => {
      scheduled = false
      sync()
    }, 300)
  }).observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener(SHOW_EVENT, mount)
  sync()
}

start()
