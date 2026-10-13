import { Document, Packer, Paragraph, TextRun } from 'docx'
import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib'
import type { ApplicantProfile } from '../types/index.js'

export const PDF_MIME_TYPE = 'application/pdf'

export interface CoverLetterInput {
  text: string
  profile: Pick<
    ApplicantProfile,
    'firstName' | 'lastName' | 'email' | 'phone' | 'location' | 'linkedinUrl' | 'websiteUrl'
  >
  date?: Date
}

function fullName(profile: CoverLetterInput['profile']): string {
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
}

function contactLine(profile: CoverLetterInput['profile']): string {
  return [profile.email, profile.phone, profile.location, profile.linkedinUrl, profile.websiteUrl]
    .filter(Boolean)
    .join('  |  ')
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function letterParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export function coverLetterFileName(
  profile: CoverLetterInput['profile'],
  company: string | null,
  extension: 'docx' | 'pdf',
): string {
  const parts = [fullName(profile) || 'Cover', 'cover-letter', company ?? '']
    .map((part) =>
      part
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-'),
    )
    .filter(Boolean)
  return `${parts.join('-')}.${extension}`
}

const FONT = 'Calibri'

export async function buildCoverLetterDocx(input: CoverLetterInput): Promise<Buffer> {
  const name = fullName(input.profile)
  const contact = contactLine(input.profile)
  const header: Paragraph[] = []
  if (name) {
    header.push(
      new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 32, font: FONT })] }),
    )
  }
  if (contact) {
    header.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({ text: contact, size: 20, color: '555555', font: FONT })],
      }),
    )
  }
  header.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: formatDate(input.date ?? new Date()), size: 22, font: FONT })],
    }),
  )

  const body = letterParagraphs(input.text).map(
    (paragraph) =>
      new Paragraph({
        spacing: { after: 200 },
        children: paragraph.split('\n').flatMap((line, index) => [
          ...(index > 0 ? [new TextRun({ break: 1 })] : []),
          new TextRun({ text: line, size: 22, font: FONT }),
        ]),
      }),
  )

  const document = new Document({
    creator: 'CVSpec',
    title: name ? `${name} cover letter` : 'Cover letter',
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: [...header, ...body],
      },
    ],
  })
  return Packer.toBuffer(document)
}

const BLACK = rgb(0.07, 0.09, 0.08)
const GREY = rgb(0.33, 0.33, 0.33)

const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const NO_DECOMPOSITION: Record<string, string> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', ı: 'i', Ħ: 'H', ħ: 'h' }

/** Standard PDF fonts only cover Windows-1252; replace anything else so drawing never throws. */
export function toWinAnsi(text: string): string {
  let result = ''
  for (const char of text.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      result += char
    } else if (WIN_ANSI_EXTRAS.has(char)) {
      result += char
    } else if (NO_DECOMPOSITION[char]) {
      result += NO_DECOMPOSITION[char]
    } else {
      const stripped = char.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      result += /^[\x20-\x7e]+$/.test(stripped) ? stripped : '?'
    }
  }
  return result
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    let line = ''
    for (const word of rawLine.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width || !line) {
        line = next
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

export async function buildCoverLetterPdf(input: CoverLetterInput): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const name = fullName(input.profile)
  pdf.setTitle(name ? `${name} cover letter` : 'Cover letter')
  pdf.setCreator('CVSpec')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const [pageWidth, pageHeight] = [595.28, 841.89]
  const margin = 56
  const width = pageWidth - margin * 2
  let page = pdf.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  const draw = (text: string, font: PDFFont, size: number, gapAfter: number, grey = false) => {
    const lineHeight = size * 1.4
    for (const line of wrap(toWinAnsi(text), font, size, width)) {
      if (y - lineHeight < margin) {
        page = pdf.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
      }
      y -= lineHeight
      page.drawText(line, { x: margin, y, size, font, color: grey ? GREY : BLACK })
    }
    y -= gapAfter
  }

  if (name) draw(name, bold, 16, 2)
  const contact = contactLine(input.profile)
  if (contact) draw(contact, regular, 9.5, 14, true)
  draw(formatDate(input.date ?? new Date()), regular, 11, 12)
  for (const paragraph of letterParagraphs(input.text)) draw(paragraph, regular, 11, 9)

  return Buffer.from(await pdf.save())
}
