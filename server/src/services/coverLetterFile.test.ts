import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  buildCoverLetterDocx,
  buildCoverLetterPdf,
  coverLetterFileName,
  letterParagraphs,
  toWinAnsi,
} from './coverLetterFile.js'

const profile = {
  firstName: 'Thandi',
  lastName: 'Nkosi',
  email: 'thandi@example.com',
  phone: '+27 82 000 0000',
  location: 'Johannesburg',
  linkedinUrl: null,
  websiteUrl: null,
}

const letter = [
  'Dear Hiring Team at Standard Bank,',
  'I am applying for the Data Analyst role. At Acme I built the weekly sales dashboard.',
  'Kind regards,\nThandi Nkosi',
].join('\n\n')

describe('letterParagraphs', () => {
  it('splits on blank lines and keeps single line breaks', () => {
    expect(letterParagraphs('One\r\n\r\nTwo\nlines\n\n\n  \nThree')).toEqual([
      'One',
      'Two\nlines',
      'Three',
    ])
  })
})

describe('coverLetterFileName', () => {
  it('uses the name and company without unsafe characters', () => {
    expect(coverLetterFileName(profile, 'Absa / Barclays', 'pdf')).toBe(
      'Thandi-Nkosi-cover-letter-Absa-Barclays.pdf',
    )
    expect(
      coverLetterFileName({ ...profile, firstName: null, lastName: null }, null, 'docx'),
    ).toBe('Cover-cover-letter.docx')
  })
})

describe('toWinAnsi', () => {
  it('keeps Latin-1 and Windows-1252 punctuation and replaces the rest', () => {
    expect(toWinAnsi('Café – “quoted” €5')).toBe('Café – “quoted” €5')
    expect(toWinAnsi('Łódź 漢字 ✓')).toBe('Lódz ?? ?')
  })
})

describe('buildCoverLetterDocx', () => {
  it('writes the header and every paragraph', async () => {
    const buffer = await buildCoverLetterDocx({
      text: letter,
      profile,
      date: new Date('2026-10-13T00:00:00Z'),
    })
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('string')
    const text = xml.replace(/<[^>]+>/g, ' ')
    expect(text).toContain('Thandi Nkosi')
    expect(text).toContain('thandi@example.com')
    expect(text).toContain('Dear Hiring Team at Standard Bank,')
    expect(text).toContain('weekly sales dashboard')
    expect(text).toContain('2026')
  })
})

describe('buildCoverLetterPdf', () => {
  it('produces a loadable one-page PDF for a normal letter', async () => {
    const buffer = await buildCoverLetterPdf({ text: letter, profile })
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    const pdf = await PDFDocument.load(buffer)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe('Thandi Nkosi cover letter')
  })

  it('wraps long letters onto more pages and survives characters outside WinAnsi', async () => {
    const paragraph = 'Built reporting pipelines for 漢字 teams across the region. '.repeat(30)
    const buffer = await buildCoverLetterPdf({
      text: Array.from({ length: 8 }, () => paragraph).join('\n\n'),
      profile,
    })
    const pdf = await PDFDocument.load(buffer)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })
})
