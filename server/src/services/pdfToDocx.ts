import {
  AlignmentType,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  type TabStopDefinition,
} from 'docx'
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export class PdfHasNoTextError extends Error {
  constructor() {
    super('PDF has no extractable text layer')
    this.name = 'PdfHasNoTextError'
  }
}

interface Span {
  text: string
  x: number
  right: number
  y: number
  size: number
  bold: boolean
  italic: boolean
}

interface Line {
  page: number
  spans: Span[]
  x: number
  right: number
  y: number
  size: number
  text: string
}

type ParagraphKind = 'text' | 'heading' | 'bullet'

interface ParagraphBlock {
  kind: ParagraphKind
  centered: boolean
  lines: Line[]
  spacingBefore: number
}

interface PageInfo {
  width: number
  height: number
}

const BULLET_PATTERN = /^\s*(?:[•●▪■◦○·‣⁃∙\uf0b7\uf0a7\uf076\uf0d8\uf0fc]\s*|[-–—*]\s+)/
const BULLET_REFERENCE = 'resume-bullets'
const TWIPS_PER_POINT = 20
const MIN_MARGIN_PT = 18
const MAX_MARGIN_PT = 90

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).includes('%PDF-')
}

export async function convertPdfToDocx(buffer: Buffer): Promise<Buffer> {
  const { lines, pages } = await extractLines(buffer)
  if (lines.length === 0) throw new PdfHasNoTextError()

  const bodySize = dominantFontSize(lines)
  const contentLeft = Math.min(...lines.map((line) => line.x))
  const contentRight = Math.max(...lines.map((line) => line.right))
  const firstPage = pages[0]
  const firstPageTop = Math.min(...lines.filter((l) => l.page === 0).map((l) => l.y - l.size))

  const marginLeft = clamp(contentLeft, MIN_MARGIN_PT, MAX_MARGIN_PT)
  const marginRight = clamp(firstPage.width - contentRight, MIN_MARGIN_PT, MAX_MARGIN_PT)
  const marginTop = clamp(firstPageTop, MIN_MARGIN_PT, MAX_MARGIN_PT)
  const textWidth = firstPage.width - marginLeft - marginRight

  const blocks = buildParagraphs(lines, {
    bodySize,
    contentLeft,
    contentRight,
    pageWidth: firstPage.width,
  })

  const children = blocks.map((block) =>
    renderParagraph(block, { marginLeft, textWidth, contentRight }),
  )

  const doc = new Document({
    creator: 'cvSpec',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: Math.round(bodySize * 2) },
          paragraph: { spacing: { after: 0, line: 252 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: BULLET_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: Math.round(firstPage.width * TWIPS_PER_POINT),
              height: Math.round(firstPage.height * TWIPS_PER_POINT),
            },
            margin: {
              top: Math.round(marginTop * TWIPS_PER_POINT),
              bottom: Math.round(marginTop * TWIPS_PER_POINT),
              left: Math.round(marginLeft * TWIPS_PER_POINT),
              right: Math.round(marginRight * TWIPS_PER_POINT),
            },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}

async function extractLines(buffer: Buffer): Promise<{ lines: Line[]; pages: PageInfo[] }> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  })

  try {
    const pdf = await loadingTask.promise
    const lines: Line[] = []
    const pages: PageInfo[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      pages.push({ width: viewport.width, height: viewport.height })

      const content = await page.getTextContent()
      // Font objects (and their bold/italic flags) are only resolved once the operator list is built.
      await page.getOperatorList()

      const fontStyles = new Map<string, { bold: boolean; italic: boolean }>()
      const styleFor = (fontName: string): { bold: boolean; italic: boolean } => {
        let style = fontStyles.get(fontName)
        if (!style) {
          try {
            const font = page.commonObjs.get(fontName) as {
              bold?: boolean
              black?: boolean
              italic?: boolean
            }
            style = { bold: Boolean(font.bold || font.black), italic: Boolean(font.italic) }
          } catch {
            style = { bold: false, italic: false }
          }
          fontStyles.set(fontName, style)
        }
        return style
      }

      const spans: Span[] = []
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue
        const [a, b, c, d, x, y] = Util.transform(viewport.transform, item.transform) as number[]
        const size = Math.hypot(c, d) || Math.hypot(a, b)
        if (size <= 0) continue
        const style = styleFor(item.fontName)
        spans.push({
          text: item.str,
          x,
          right: x + item.width,
          y,
          size,
          bold: style.bold,
          italic: style.italic,
        })
      }

      lines.push(...groupIntoLines(spans, pageNumber - 1))
      page.cleanup()
    }

    return { lines, pages }
  } finally {
    await loadingTask.destroy()
  }
}

function groupIntoLines(spans: Span[], page: number): Line[] {
  const sorted = [...spans].sort((p, q) => p.y - q.y || p.x - q.x)
  const groups: Span[][] = []

  for (const span of sorted) {
    const current = groups[groups.length - 1]
    if (current) {
      const anchor = current[0]
      if (Math.abs(span.y - anchor.y) <= Math.max(anchor.size, span.size) * 0.4) {
        current.push(span)
        continue
      }
    }
    groups.push([span])
  }

  return groups.map((group) => {
    const ordered = group.sort((p, q) => p.x - q.x)
    return {
      page,
      spans: ordered,
      x: ordered[0].x,
      right: Math.max(...ordered.map((span) => span.right)),
      y: ordered[0].y,
      size: Math.max(...ordered.map((span) => span.size)),
      text: ordered
        .map((span) => span.text)
        .join(' ')
        .trim(),
    }
  })
}

function dominantFontSize(lines: Line[]): number {
  const weights = new Map<number, number>()
  for (const line of lines) {
    for (const span of line.spans) {
      const key = Math.round(span.size * 2) / 2
      weights.set(key, (weights.get(key) ?? 0) + span.text.length)
    }
  }
  let best = 11
  let bestWeight = -1
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size
      bestWeight = weight
    }
  }
  return clamp(best, 7, 16)
}

function buildParagraphs(
  lines: Line[],
  layout: { bodySize: number; contentLeft: number; contentRight: number; pageWidth: number },
): ParagraphBlock[] {
  const { bodySize, contentLeft, contentRight, pageWidth } = layout
  const contentWidth = Math.max(contentRight - contentLeft, 1)
  const blocks: ParagraphBlock[] = []

  for (const line of lines) {
    const kind = classifyLine(line, bodySize)
    const center = (line.x + line.right) / 2
    const centered =
      kind !== 'bullet' &&
      Math.abs(center - pageWidth / 2) < pageWidth * 0.03 &&
      line.x > contentLeft + contentWidth * 0.1

    const previous = blocks[blocks.length - 1]
    const previousLine = previous?.lines[previous.lines.length - 1]
    const gap = previousLine && previousLine.page === line.page ? line.y - previousLine.y : 0

    if (
      previous &&
      previousLine &&
      kind === 'text' &&
      shouldContinue(previous, previousLine, line, { gap, centered, contentRight, contentWidth })
    ) {
      previous.lines.push(line)
      continue
    }

    const lineHeight = line.size * 1.25
    const extra = gap - lineHeight
    blocks.push({
      kind,
      centered,
      lines: [line],
      spacingBefore: extra > line.size * 0.4 ? clamp(extra, 0, 30) : 0,
    })
  }

  return blocks
}

function classifyLine(line: Line, bodySize: number): ParagraphKind {
  const first = line.spans[0]
  const bulletMatch = first.text.match(BULLET_PATTERN)
  if (bulletMatch) {
    first.text = first.text.slice(bulletMatch[0].length)
    if (first.text.trim() === '') line.spans.shift()
    if (line.spans.length > 0) {
      line.x = line.spans[0].x
      line.text = line.text.replace(BULLET_PATTERN, '')
      return 'bullet'
    }
    line.spans.push(first)
  }

  const text = line.text
  if (text.length > 80) return 'text'
  const allBold = line.spans.every((span) => span.bold)
  const letters = text.replace(/[^A-Za-z]/g, '')
  const isUpper = letters.length >= 3 && letters === letters.toUpperCase()
  if (line.size >= bodySize * 1.2) return 'heading'
  if (allBold && (isUpper || text.endsWith(':'))) return 'heading'
  return 'text'
}

function shouldContinue(
  block: ParagraphBlock,
  previousLine: Line,
  line: Line,
  context: { gap: number; centered: boolean; contentRight: number; contentWidth: number },
): boolean {
  const { gap, centered, contentRight, contentWidth } = context
  if (block.kind === 'heading' || block.centered || centered) return false
  if (gap <= 0 || gap > Math.max(previousLine.size, line.size) * 1.6) return false
  if (Math.abs(previousLine.size - line.size) > 0.5) return false
  if (hasColumnGap(previousLine) || hasColumnGap(line)) return false

  const wrapped = previousLine.right >= contentRight - contentWidth * 0.15
  if (!wrapped) return false

  const firstLine = block.lines[0]
  if (block.kind === 'bullet') return line.x >= firstLine.x - line.size * 0.5
  return line.x >= firstLine.x - line.size && line.x <= firstLine.x + line.size * 3
}

function hasColumnGap(line: Line): boolean {
  return line.spans.some(
    (span, index) => index > 0 && span.x - line.spans[index - 1].right > line.size * 1.5,
  )
}

function renderParagraph(
  block: ParagraphBlock,
  layout: { marginLeft: number; textWidth: number; contentRight: number },
): Paragraph {
  const { marginLeft, textWidth, contentRight } = layout
  const runs: TextRun[] = []
  const tabStops: TabStopDefinition[] = []
  let lastText = ''

  block.lines.forEach((line, lineIndex) => {
    line.spans.forEach((span, spanIndex) => {
      const previous = spanIndex > 0 ? line.spans[spanIndex - 1] : undefined
      const gap = previous ? span.x - previous.right : 0
      const isTab = previous !== undefined && gap > line.size * 1.5
      let text = span.text

      if (isTab) {
        const isLast = spanIndex === line.spans.length - 1
        const alignRight = isLast && Math.abs(span.right - contentRight) < line.size * 2
        tabStops.push(
          alignRight
            ? { type: TabStopType.RIGHT, position: Math.round(textWidth * TWIPS_PER_POINT) }
            : {
                type: TabStopType.LEFT,
                position: Math.round(clamp(span.x - marginLeft, 0, textWidth) * TWIPS_PER_POINT),
              },
        )
      } else if (needsSpace(lastText, text, previous ? gap > line.size * 0.15 : lineIndex > 0)) {
        text = ` ${text}`
      } else if (lineIndex > 0 && spanIndex === 0 && lastText.endsWith('-')) {
        text = text.trimStart()
      }

      runs.push(
        new TextRun({
          children: isTab ? [new Tab(), text] : [text],
          bold: span.bold || undefined,
          italics: span.italic || undefined,
          size: Math.round(clamp(span.size, 7, 36) * 2),
        }),
      )
      lastText = text
    })
  })

  return new Paragraph({
    children: runs,
    alignment: block.centered ? AlignmentType.CENTER : undefined,
    numbering: block.kind === 'bullet' ? { reference: BULLET_REFERENCE, level: 0 } : undefined,
    keepNext: block.kind === 'heading' || undefined,
    tabStops: tabStops.length > 0 ? dedupeTabStops(tabStops) : undefined,
    spacing:
      block.spacingBefore > 0
        ? { before: Math.round(block.spacingBefore * TWIPS_PER_POINT) }
        : undefined,
  })
}

function needsSpace(previousText: string, nextText: string, separated: boolean): boolean {
  if (!separated || previousText === '') return false
  if (/\s$/.test(previousText) || /^\s/.test(nextText)) return false
  return !/[A-Za-z]-$/.test(previousText)
}

function dedupeTabStops(stops: TabStopDefinition[]): TabStopDefinition[] {
  const seen = new Set<string>()
  return stops.filter((stop) => {
    const key = `${stop.type}:${stop.position}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
