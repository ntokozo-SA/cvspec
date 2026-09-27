import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'

export async function extractTextFromDocument(buffer: Buffer, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) {
    const parsed = await pdfParse(buffer)
    return parsed.text.replace(/\s+/g, ' ').trim()
  }

  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value.replace(/\s+/g, ' ').trim()
  }

  throw new Error('Unsupported document type. Use PDF or DOCX.')
}
