import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'
import type { Recommendation, ResumeParsed } from '../types/index.js'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const DOCUMENT_PART = 'word/document.xml'

const BULLET_PATTERN = /^\s*(?:[•●▪■◦○·‣⁃∙\uf0b7\uf0a7\uf076\uf0d8\uf0fc]\s*|[-–—*]\s+)/
const FUZZY_MATCH_THRESHOLD = 0.6
const MIN_ORIGINAL_LENGTH = 6

const SECTION_KEYWORDS: Record<string, string[]> = {
  summary: ['summary', 'profile', 'objective', 'about me', 'overview'],
  skills: ['skill', 'competenc', 'technolog', 'tools', 'expertise', 'tech stack', 'strengths'],
  experience: ['experience', 'employment', 'work history', 'career history', 'positions'],
  education: ['education', 'academic', 'qualification'],
  projects: ['project', 'portfolio'],
  certifications: ['certif', 'licen', 'course', 'training'],
  achievements: ['achievement', 'award', 'accomplishment', 'honor'],
}

export class TailorInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TailorInputError'
  }
}

interface TextSegment {
  node: Element
  start: number
  end: number
}

interface ParagraphInfo {
  element: Element
  segments: TextSegment[]
  text: string
  isList: boolean
  heading: string | null
}

export interface TailorResult {
  buffer: Buffer
  /** Positions in the input list that could not be placed in the document. */
  unapplied: number[]
}

/**
 * Applies resume recommendations to a DOCX in memory. Edits with an `original` replace the
 * matching text in place (keeping its run formatting); additions are inserted at the end of
 * the section named by `section`, cloned from the surrounding paragraph's formatting.
 */
export async function applyRecommendationsToDocx(
  docx: Buffer,
  recommendations: Recommendation[],
): Promise<TailorResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(docx)
  } catch {
    throw new TailorInputError('The stored resume could not be read as a DOCX file')
  }
  const part = zip.file(DOCUMENT_PART)
  if (!part) throw new TailorInputError('The stored resume is missing its document body')

  const doc = new DOMParser().parseFromString(await part.async('string'), 'text/xml')
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0]
  if (!body) throw new TailorInputError('The stored resume is missing its document body')

  const edited = new Set<Element>()
  const unapplied: number[] = []

  const ordered = recommendations
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => Number(Boolean(b.rec.original)) - Number(Boolean(a.rec.original)))

  for (const { rec, index } of ordered) {
    const paragraphs = readParagraphs(body)
    const suggestion = rec.suggestion.replace(BULLET_PATTERN, '').trim()
    const applied =
      suggestion !== '' &&
      (rec.original
        ? replaceOriginal(paragraphs, rec.original, suggestion, edited)
        : insertIntoSection(doc, paragraphs, rec.section, suggestion, edited))
    if (!applied) unapplied.push(index)
  }

  zip.file(DOCUMENT_PART, new XMLSerializer().serializeToString(doc))
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return { buffer, unapplied: unapplied.sort((a, b) => a - b) }
}

/**
 * Mirrors the DOCX edits on the parsed resume so the tailored copy can be scored with the
 * same inputs the original comparison used.
 */
export function applyRecommendationsToParsed(
  resume: ResumeParsed,
  recommendations: Recommendation[],
): ResumeParsed {
  const next: ResumeParsed = {
    ...resume,
    skills: [...(resume.skills ?? [])],
    experience: (resume.experience ?? []).map((job) => ({
      ...job,
      bullets: [...(job.bullets ?? [])],
    })),
    education: resume.education ? [...resume.education] : undefined,
  }

  for (const rec of recommendations) {
    const suggestion = rec.suggestion.replace(BULLET_PATTERN, '').trim()
    if (suggestion === '') continue
    if (rec.original && rewriteParsedField(next, rec.original, suggestion)) continue
    addToParsedSection(next, rec.section, suggestion)
  }
  return next
}

interface ParsedField {
  value: string
  set: (value: string) => void
}

function parsedFields(resume: ResumeParsed): ParsedField[] {
  const fields: ParsedField[] = []
  if (resume.summary) {
    fields.push({ value: resume.summary, set: (value) => (resume.summary = value) })
  }
  resume.skills.forEach((value, i) => {
    fields.push({ value, set: (next) => (resume.skills[i] = next) })
  })
  for (const job of resume.experience) {
    job.bullets.forEach((value, i) => {
      fields.push({ value, set: (next) => (job.bullets[i] = next) })
    })
  }
  resume.education?.forEach((value, i) => {
    fields.push({ value, set: (next) => (resume.education![i] = next) })
  })
  return fields
}

function rewriteParsedField(resume: ResumeParsed, original: string, suggestion: string): boolean {
  const target = normalize(original).chars
  if (target.length < MIN_ORIGINAL_LENGTH) return false
  const fields = parsedFields(resume)

  const containing = fields.find((field) => normalize(field.value).chars.includes(target))
  if (containing) {
    const whole = normalize(containing.value).chars.length <= target.length * 1.25
    containing.set(whole ? suggestion : `${containing.value} ${suggestion}`)
    return true
  }

  const wanted = tokens(original)
  let best: ParsedField | null = null
  let bestScore = FUZZY_MATCH_THRESHOLD
  for (const field of fields) {
    const score = similarity(wanted, tokens(field.value))
    if (score >= bestScore) {
      bestScore = score
      best = field
    }
  }
  if (!best) return false
  best.set(suggestion)
  return true
}

function addToParsedSection(resume: ResumeParsed, section: string, suggestion: string): void {
  switch (categoryOf(section)) {
    case 'skills':
      resume.skills.push(suggestion)
      return
    case 'summary':
      resume.summary = resume.summary ? `${resume.summary} ${suggestion}` : suggestion
      return
    case 'education':
      ;(resume.education ??= []).push(suggestion)
      return
    case 'experience': {
      const parts = entryNameParts(section)
      const job =
        resume.experience.find((entry) => {
          const name = normalize(`${entry.title} ${entry.company}`).chars
          return parts.some((part) => name.includes(part))
        }) ?? resume.experience[0]
      if (job) job.bullets.push(suggestion)
      else resume.experience.push({ title: '', company: '', bullets: [suggestion] })
      return
    }
    default:
      resume.experience.push({ title: section, company: '', bullets: [suggestion] })
  }
}

function entryNameParts(section: string): string[] {
  return section
    .split(/\s+(?:at|@)\s+|[-–—,|:()/]/i)
    .map((part) => normalize(part).chars)
    .filter((part) => part.length >= 4 && !categoryOf(part))
}

function readParagraphs(body: Element): ParagraphInfo[] {
  return Array.from(body.getElementsByTagNameNS(W_NS, 'p')).map((element) => {
    const segments: TextSegment[] = []
    let text = ''
    for (const node of Array.from(element.getElementsByTagNameNS(W_NS, 't'))) {
      if (closestParagraph(node) !== element) continue
      const value = node.textContent ?? ''
      segments.push({ node, start: text.length, end: text.length + value.length })
      text += value
    }
    const isList = hasChild(firstChild(element, 'pPr'), 'numPr') || BULLET_PATTERN.test(text)
    return { element, segments, text, isList, heading: headingCategory(element, text, isList) }
  })
}

function replaceOriginal(
  paragraphs: ParagraphInfo[],
  original: string,
  suggestion: string,
  edited: Set<Element>,
): boolean {
  const target = normalize(original)
  if (target.chars.length < MIN_ORIGINAL_LENGTH) return false

  let best: { paragraph: ParagraphInfo; start: number; end: number; coverage: number } | null = null
  for (const paragraph of paragraphs) {
    const source = normalize(paragraph.text)
    const at = source.chars.indexOf(target.chars)
    if (at < 0) continue
    const coverage = target.chars.length / source.chars.length
    if (best && best.coverage >= coverage) continue

    const contentStart = bulletPrefixLength(paragraph.text)
    let start = source.map[at]
    let end = source.map[at + target.chars.length - 1] + 1
    if (coverage === 1) {
      start = contentStart
      end = paragraph.text.trimEnd().length
    } else if (/[.;,]$/.test(original.trim())) {
      while (end < paragraph.text.length && /[.;,]/.test(paragraph.text[end])) end++
    }
    best = { paragraph, start: Math.max(start, contentStart), end, coverage }
  }

  if (!best) {
    const wanted = tokens(original)
    let bestScore = FUZZY_MATCH_THRESHOLD
    for (const paragraph of paragraphs) {
      if (edited.has(paragraph.element) || paragraph.heading) continue
      const score = similarity(wanted, tokens(paragraph.text))
      if (score >= bestScore) {
        bestScore = score
        best = {
          paragraph,
          start: bulletPrefixLength(paragraph.text),
          end: paragraph.text.trimEnd().length,
          coverage: 1,
        }
      }
    }
  }

  if (!best) return false
  replaceRange(best.paragraph.segments, best.start, best.end, suggestion)
  edited.add(best.paragraph.element)
  return true
}

function insertIntoSection(
  doc: Document,
  paragraphs: ParagraphInfo[],
  section: string,
  suggestion: string,
  edited: Set<Element>,
): boolean {
  const category = categoryOf(section)
  if (!category) return false

  let start = paragraphs.findIndex((p) => p.heading === category)
  let end = paragraphs.length
  if (start >= 0) {
    const next = paragraphs.findIndex((p, i) => i > start && p.heading !== null)
    if (next >= 0) end = next
  } else {
    start = paragraphs.findIndex((p) => isInlineLabel(p.text, category))
    if (start < 0) return false
    end = start + 1
  }

  const scopeStart = narrowToEntry(paragraphs, section, start + 1, end) ?? start
  const scope = paragraphs.slice(scopeStart, end).filter((p) => p.text.trim() !== '')
  const lastListItem = lastConsecutiveListItem(scope)
  const anchor = lastListItem ?? scope[scope.length - 1]
  if (!anchor) return false

  if (anchor.heading) {
    anchor.element.parentNode?.insertBefore(
      buildParagraph(doc, null, null, suggestion),
      anchor.element.nextSibling,
    )
    return true
  }

  if (!anchor.isList) {
    const inlineList = isInlineLabel(anchor.text, category)
    const separator = category === 'skills' || inlineList ? listSeparator(anchor.text) : null
    if (category === 'summary') {
      appendText(anchor, (value) => `${value} ${suggestion}`)
      edited.add(anchor.element)
      return true
    }
    if (separator || inlineList) {
      const item = suggestion.replace(/[.;]$/, '')
      appendText(anchor, (value) => `${value.replace(/[.;]$/, '')}${separator ?? ','} ${item}`)
      edited.add(anchor.element)
      return true
    }
  }

  const prefix = anchor.text.match(BULLET_PATTERN)?.[0].trimStart() ?? ''
  const paragraph = buildParagraph(
    doc,
    firstChild(anchor.element, 'pPr'),
    dominantRunProperties(anchor),
    `${prefix}${suggestion}`,
  )
  anchor.element.parentNode?.insertBefore(paragraph, anchor.element.nextSibling)
  edited.add(paragraph)
  return true
}

/** Finds the paragraph for a specific role or project named in the section label. */
function narrowToEntry(
  paragraphs: ParagraphInfo[],
  section: string,
  from: number,
  to: number,
): number | null {
  const parts = entryNameParts(section)
  if (parts.length === 0) return null

  for (let i = from; i < to; i++) {
    const text = normalize(paragraphs[i].text).chars
    if (!paragraphs[i].isList && parts.some((part) => text.includes(part))) return i
  }
  return null
}

function lastConsecutiveListItem(scope: ParagraphInfo[]): ParagraphInfo | null {
  let last: ParagraphInfo | null = null
  for (const paragraph of scope) {
    if (paragraph.isList) last = paragraph
    else if (last) break
  }
  return last
}

function headingCategory(element: Element, text: string, isList: boolean): string | null {
  const trimmed = text.trim().replace(/:$/, '')
  if (isList || trimmed === '' || trimmed.length > 50) return null
  const words = trimmed.split(/\s+/).length
  if (words > 5) return null

  const style = firstChild(firstChild(element, 'pPr'), 'pStyle')?.getAttributeNS(W_NS, 'val') ?? ''
  const letters = trimmed.replace(/[^\p{L}]/gu, '')
  const upper = letters.length >= 3 && letters === letters.toUpperCase()
  const styled = /heading|title/i.test(style)
  const bold = isAllBold(element)
  const looksLikeHeading = styled || upper || text.trim().endsWith(':') || (bold && words <= 3)
  if (!looksLikeHeading) return null

  const category = categoryOf(trimmed)
  if (category) return category
  return styled || upper ? 'other' : null
}

function isAllBold(element: Element): boolean {
  const runs = Array.from(element.getElementsByTagNameNS(W_NS, 'r')).filter(
    (run) => (run.textContent ?? '').trim() !== '',
  )
  return (
    runs.length > 0 &&
    runs.every((run) => {
      const b = firstChild(firstChild(run, 'rPr'), 'b')
      return b !== null && !/^(0|false)$/.test(b.getAttributeNS(W_NS, 'val') ?? '')
    })
  )
}

function categoryOf(label: string): string | null {
  const lower = label.toLowerCase()
  for (const [category, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category
  }
  return null
}

function isInlineLabel(text: string, category: string): boolean {
  const colon = text.indexOf(':')
  return colon > 0 && colon <= 30 && categoryOf(text.slice(0, colon)) === category
}

function listSeparator(text: string): string | null {
  for (const separator of [' | ', ' • ', ' · ', ', ', '; ']) {
    if (text.includes(separator)) return separator.trimEnd()
  }
  return null
}

function replaceRange(segments: TextSegment[], start: number, end: number, text: string): void {
  let inserted = false
  for (const segment of segments) {
    const touches = segment.end > start && segment.start < Math.max(end, start + 1)
    if (!touches) continue
    const value = segment.node.textContent ?? ''
    const localStart = Math.max(start - segment.start, 0)
    const localEnd = Math.min(end - segment.start, value.length)
    setText(
      segment.node,
      value.slice(0, localStart) + (inserted ? '' : text) + value.slice(localEnd),
    )
    inserted = true
  }
}

function appendText(paragraph: ParagraphInfo, extend: (value: string) => string): void {
  const last = [...paragraph.segments].reverse().find((s) => (s.node.textContent ?? '').trim())
  if (!last) return
  setText(last.node, extend((last.node.textContent ?? '').trimEnd()))
}

function buildParagraph(
  doc: Document,
  paragraphProperties: Element | null,
  runProperties: Element | null,
  text: string,
): Element {
  const paragraph = doc.createElementNS(W_NS, 'w:p')
  if (paragraphProperties) {
    const pPr = paragraphProperties.cloneNode(true) as Element
    const sectionBreak = firstChild(pPr, 'sectPr')
    if (sectionBreak) pPr.removeChild(sectionBreak)
    paragraph.appendChild(pPr)
  }
  const run = doc.createElementNS(W_NS, 'w:r')
  if (runProperties) run.appendChild(runProperties.cloneNode(true))
  const t = doc.createElementNS(W_NS, 'w:t')
  setText(t, text)
  run.appendChild(t)
  paragraph.appendChild(run)
  return paragraph
}

function dominantRunProperties(paragraph: ParagraphInfo): Element | null {
  let best: TextSegment | null = null
  for (const segment of paragraph.segments) {
    if (!best || segment.end - segment.start > best.end - best.start) best = segment
  }
  const run = best?.node.parentNode as Element | null
  return run ? firstChild(run, 'rPr') : null
}

function setText(node: Element, text: string): void {
  while (node.firstChild) node.removeChild(node.firstChild)
  node.appendChild(node.ownerDocument.createTextNode(text))
  node.setAttributeNS(XML_NS, 'xml:space', 'preserve')
}

function closestParagraph(node: Node): Element | null {
  let current = node.parentNode
  while (current) {
    if (current.nodeType === 1 && (current as Element).localName === 'p') {
      if ((current as Element).namespaceURI === W_NS) return current as Element
    }
    current = current.parentNode
  }
  return null
}

function firstChild(parent: Element | null, localName: string): Element | null {
  if (!parent) return null
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (node as Element).localName === localName) return node as Element
  }
  return null
}

function hasChild(parent: Element | null, localName: string): boolean {
  return firstChild(parent, localName) !== null
}

function bulletPrefixLength(text: string): number {
  return text.match(BULLET_PATTERN)?.[0].length ?? 0
}

/** Lowercase alphanumerics only, with a map back to positions in the raw text. */
function normalize(text: string): { chars: string; map: number[] } {
  let chars = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const folded = text[i]
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    for (const char of folded) {
      chars += char
      map.push(i)
    }
  }
  return { chars, map }
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeWords(text)
      .split(' ')
      .filter((word) => word.length >= 3),
  )
}

function normalizeWords(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size < 3 || b.size < 3) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return (2 * shared) / (a.size + b.size)
}
