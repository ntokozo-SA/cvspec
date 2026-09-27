import type { ScrapedJob } from '../../shared/types'

/**
 * Reads a schema.org JobPosting from the page's JSON-LD.
 * Must stay fully self-contained (no imports or outer references): the popup injects it
 * with chrome.scripting.executeScript, which serializes only the function body.
 */
export function scanJsonLdJobPosting(): ScrapedJob | null {
  type Json = Record<string, unknown>

  const asArray = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : value == null ? [] : [value]

  const isJobPosting = (node: unknown): node is Json => {
    if (!node || typeof node !== 'object') return false
    const type = (node as Json)['@type']
    return asArray(type).some((t) => t === 'JobPosting')
  }

  const findPosting = (node: unknown): Json | null => {
    for (const item of asArray(node)) {
      if (isJobPosting(item)) return item
      if (item && typeof item === 'object') {
        const nested = findPosting((item as Json)['@graph'])
        if (nested) return nested
      }
    }
    return null
  }

  const htmlToText = (html: string): string => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
    doc.querySelectorAll('p, li, div, h1, h2, h3, h4, ul, ol').forEach((el) => el.append('\n'))
    return (doc.body.textContent ?? '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const formatLocation = (value: unknown): string | undefined => {
    const parts: string[] = []
    for (const place of asArray(value)) {
      const address = (place as Json | null)?.address as Json | string | undefined
      if (typeof address === 'string') {
        parts.push(address)
      } else if (address) {
        const line = [address.addressLocality, address.addressRegion, address.addressCountry]
          .map((part) =>
            typeof part === 'object' && part ? (part as Json).name : (part as string | undefined),
          )
          .filter((part): part is string => typeof part === 'string' && part.length > 0)
          .join(', ')
        if (line) parts.push(line)
      }
    }
    return parts.length ? Array.from(new Set(parts)).join(' / ') : undefined
  }

  for (const script of Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  )) {
    let parsed: unknown
    try {
      parsed = JSON.parse(script.textContent ?? '')
    } catch {
      continue
    }
    const posting = findPosting(parsed)
    if (!posting) continue

    const title = typeof posting.title === 'string' ? posting.title.trim() : ''
    const org = posting.hiringOrganization as Json | string | undefined
    const company = typeof org === 'string' ? org : typeof org?.name === 'string' ? org.name : ''
    const description =
      typeof posting.description === 'string' ? htmlToText(posting.description) : ''
    if (!title || description.length < 40) continue

    const remote = posting.jobLocationType === 'TELECOMMUTE' ? 'Remote' : undefined
    return {
      board: 'other',
      title,
      company: company.trim(),
      location: formatLocation(posting.jobLocation) ?? remote,
      url: window.location.href,
      descriptionText: description,
    }
  }

  return null
}
