import * as cheerio from 'cheerio'

function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, noscript, nav, footer, header').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

export async function extractTextFromUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CVSpecsBot/1.0 (+https://cvspecs.local)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) {
    throw new Error(`Could not fetch job link (${response.status})`)
  }

  const html = await response.text()
  const text = htmlToText(html)

  if (text.length < 120) {
    throw new Error(
      'The page returned too little text. It may be JavaScript-rendered or blocked. Paste the posting text instead.',
    )
  }

  return text
}
