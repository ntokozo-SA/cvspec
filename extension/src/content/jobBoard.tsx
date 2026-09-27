import { createRoot, type Root } from 'react-dom/client'
import { findAdapter } from './adapters'
import { App } from './ui/App'
import styles from './ui/styles.css?inline'

const FLOAT_AFTER_MS = 2500
const MAX_DOCK_DEPTH = 6
const MAX_DOCK_TARGET_HEIGHT = 400
const DOCKED_MIN_HEIGHT = '40px'

interface Mounted {
  key: string
  barHost: HTMLElement
  barContainer: HTMLElement
  panelHost: HTMLElement
  root: Root
  /** Anchor element that could not be docked next to without overlapping page content. */
  failedAnchor: Element | null
}

let mounted: Mounted | null = null
let pending: { key: string; since: number } | null = null

function createShadowHost(role: 'bar' | 'panel'): { host: HTMLElement; container: HTMLElement } {
  const host = document.createElement('cvspec-root')
  host.dataset.cvspec = role
  host.style.setProperty('display', 'block', 'important')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  const container = document.createElement('div')
  container.className = `cvs-root cvs-root--${role}`
  shadow.append(style, container)
  return { host, container }
}

function isFloating(target: Mounted): boolean {
  return target.barContainer.classList.contains('cvs-root--floating')
}

function setFloating(target: Mounted, floating: boolean): void {
  target.barContainer.classList.toggle('cvs-root--floating', floating)
  target.barHost.style.minHeight = floating ? '' : DOCKED_MIN_HEIGHT
}

function float(target: Mounted): void {
  setFloating(target, true)
  document.body.append(target.barHost)
}

/** True when a new sibling placed after `child` will stack below it in normal flow. */
function stacksBelow(parent: Element, child: Element): boolean {
  const childStyle = getComputedStyle(child)
  if (childStyle.position === 'absolute' || childStyle.position === 'fixed') return false
  const parentStyle = getComputedStyle(parent)
  if (['block', 'flow-root', 'list-item'].includes(parentStyle.display)) return true
  if (parentStyle.display.endsWith('flex')) return parentStyle.flexDirection.startsWith('column')
  return false
}

function overlapsPage(host: HTMLElement, previous: Element): boolean {
  const box = host.getBoundingClientRect()
  if (box.top < previous.getBoundingClientRect().bottom - 1) return true

  const parent = host.parentElement
  if (parent && parent.getBoundingClientRect().bottom < box.bottom - 1) return true

  const next = host.nextElementSibling
  if (next) {
    const nextBox = next.getBoundingClientRect()
    if (nextBox.height > 0 && nextBox.top < box.bottom - 1) return true
  }
  return false
}

function dock(target: Mounted, anchor: Element): void {
  let point: Element = anchor
  for (let depth = 0; depth < MAX_DOCK_DEPTH; depth += 1) {
    const parent = point.parentElement
    if (!parent || parent === document.body) break
    if (point.getBoundingClientRect().height > MAX_DOCK_TARGET_HEIGHT) break

    if (stacksBelow(parent, point)) {
      setFloating(target, false)
      point.insertAdjacentElement('afterend', target.barHost)
      if (!overlapsPage(target.barHost, point)) {
        target.failedAnchor = null
        return
      }
    }
    point = parent
  }

  console.info('[CVSpec] No clean spot next to Apply, showing floating buttons instead.')
  target.failedAnchor = anchor
  float(target)
}

function unmount(): void {
  if (!mounted) return
  mounted.root.unmount()
  mounted.barHost.remove()
  mounted.panelHost.remove()
  mounted = null
}

function sync(): void {
  const url = new URL(window.location.href)
  const adapter = findAdapter(url)
  const key = adapter?.jobKey(url) ?? null
  if (!adapter || !key) {
    pending = null
    unmount()
    return
  }

  const anchor = adapter.findAnchor()

  if (mounted?.key === key) {
    if (!anchor || anchor === mounted.failedAnchor) {
      if (!mounted.barHost.isConnected) float(mounted)
    } else if (isFloating(mounted) || !mounted.barHost.isConnected) {
      dock(mounted, anchor)
    }
    return
  }

  if (!anchor) {
    if (pending?.key !== key) {
      pending = { key, since: Date.now() }
      setTimeout(scheduleSync, FLOAT_AFTER_MS + 50)
      return
    }
    if (Date.now() - pending.since < FLOAT_AFTER_MS) return
    console.info('[CVSpec] Apply area not found on this page, showing floating buttons instead.')
  }

  pending = null
  unmount()
  const bar = createShadowHost('bar')
  const panel = createShadowHost('panel')
  document.body.append(panel.host)

  const root = createRoot(panel.container)
  mounted = {
    key,
    barHost: bar.host,
    barContainer: bar.container,
    panelHost: panel.host,
    root,
    failedAnchor: null,
  }
  if (anchor) dock(mounted, anchor)
  else float(mounted)
  root.render(<App key={key} adapter={adapter} barContainer={bar.container} />)
}

let scheduled = false
function scheduleSync(): void {
  if (scheduled) return
  scheduled = true
  setTimeout(() => {
    scheduled = false
    sync()
  }, 300)
}

new MutationObserver(scheduleSync).observe(document.documentElement, {
  childList: true,
  subtree: true,
})
window.addEventListener('popstate', scheduleSync)
console.info('[CVSpec] Job board helper loaded.')
sync()
