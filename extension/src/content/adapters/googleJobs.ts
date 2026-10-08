import { BOARDS } from '../../shared/boards'
import { isVisible } from './heuristics'
import { cleanBlock, cleanInline, mergeWithFallback, type JobBoardAdapter } from './types'

const APPLY_LINK = /^apply (?:on|directly|now)\b/i
const DESCRIPTION_START = /^(?:job description|full job description|description)$/i
const DESCRIPTION_END = /^(?:show (?:full description|less|more)|report this listing|job highlights|similar jobs)$/i
const MIN_PANEL_TEXT = 400

function isJobsSearch(url: URL): boolean {
  if (url.pathname !== '/search') return false
  return url.searchParams.get('udm') === '8' || (url.searchParams.get('ibp') ?? '').includes('htl;jobs')
}

/** Google keeps the open job's id in `htidocid=` (older UI) or `vhid=...docid=` (udm=8 UI). */
function docId(url: URL): string | null {
  let raw = url.href
  try {
    raw = decodeURIComponent(raw)
  } catch {
    // keep the encoded form
  }
  return raw.match(/(?:htidocid|docid)=([^&#/]+)/)?.[1] ?? null
}

function applyLinks(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('a, [role="link"], [role="button"]')).filter(
    (element) => APPLY_LINK.test(cleanInline(element.innerText ?? '')) && isVisible(element),
  )
}

/** The job detail panel: smallest ancestor of an Apply link that holds the description. */
function detailPanel(): HTMLElement | null {
  const [link] = applyLinks()
  let current = link?.parentElement ?? null
  for (let depth = 0; current && depth < 25; depth += 1) {
    if (current === document.body) break
    const text = current.innerText ?? ''
    if (text.length >= MIN_PANEL_TEXT && /description/i.test(text)) return current
    current = current.parentElement
  }
  return null
}

function panelLines(panel: HTMLElement): string[] {
  return cleanBlock(panel.innerText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function titleIn(panel: HTMLElement): string {
  for (const heading of Array.from(
    panel.querySelectorAll<HTMLElement>('[role="heading"], h1, h2, h3'),
  )) {
    const text = cleanInline(heading.innerText ?? '')
    if (text.length > 3 && text.length < 200 && !APPLY_LINK.test(text) && isVisible(heading)) {
      return text
    }
  }
  return ''
}

/** The line under the title reads "Company • Location • via Board". */
function companyAndLocation(lines: string[], title: string): { company: string; location: string } {
  const start = title ? lines.indexOf(title) : -1
  for (const line of lines.slice(start + 1, start + 4)) {
    const parts = line.split(/\s+[•·]\s+/).filter((part) => !/^via\b/i.test(part))
    if (parts.length >= 2) return { company: parts[0], location: parts[1] }
  }
  return { company: lines[start + 1] ?? '', location: '' }
}

function descriptionIn(lines: string[]): string {
  const start = lines.findIndex((line) => DESCRIPTION_START.test(line))
  const body = start >= 0 ? lines.slice(start + 1) : lines
  const end = body.findIndex((line) => DESCRIPTION_END.test(line))
  return (end >= 0 ? body.slice(0, end) : body).join('\n')
}

export const googleJobsAdapter: JobBoardAdapter = {
  board: 'google_jobs',
  matches(url) {
    return BOARDS.google_jobs.host.test(url.hostname) && isJobsSearch(url) && docId(url) !== null
  },
  jobKey(url) {
    const id = docId(url)
    return id ? `google_jobs:${id}` : null
  },
  findAnchor() {
    const [link] = applyLinks()
    return link?.parentElement ?? null
  },
  extract() {
    const panel = detailPanel()
    if (!panel) return null
    const lines = panelLines(panel)
    const title = titleIn(panel)
    const { company, location } = companyAndLocation(lines, title)
    return mergeWithFallback(
      {
        board: 'google_jobs',
        url: window.location.href,
        title,
        company,
        location,
        descriptionText: descriptionIn(lines),
      },
      null,
    )
  },
}
