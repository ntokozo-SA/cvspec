import type { TailoredFile } from '../../shared/types'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function downloadFile(file: TailoredFile): void {
  const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType ?? DOCX_TYPE }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
