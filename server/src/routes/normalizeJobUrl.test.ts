import { describe, expect, it } from 'vitest'
import { normalizeJobUrl } from './applications.js'

describe('normalizeJobUrl for SA job boards', () => {
  it('drops PNet tracking and the inline suffix', () => {
    expect(
      normalizeJobUrl(
        'https://www.pnet.co.za/jobs--Java-Developer-Stellenbosch-Mediclinic--1234567-inline.html?rltr=1_1_25&utm_source=x#apply',
      ),
    ).toBe('https://www.pnet.co.za/jobs--Java-Developer-Stellenbosch-Mediclinic--1234567.html')
  })

  it('keeps the Careers24 and OfferZen paths without the query string', () => {
    expect(
      normalizeJobUrl('https://www.careers24.com/jobs/adverts/2112345-junior-data-analyst/?ref=sr'),
    ).toBe('https://www.careers24.com/jobs/adverts/2112345-junior-data-analyst/')
    expect(
      normalizeJobUrl('https://www.offerzen.com/companies/yoco/jobs/senior-frontend?utm_campaign=a'),
    ).toBe('https://www.offerzen.com/companies/yoco/jobs/senior-frontend')
  })

  it('keeps only the CareerJunction job id parameter', () => {
    expect(
      normalizeJobUrl('https://www.careerjunction.co.za/systems-administrator-job-2512345.aspx?src=feed'),
    ).toBe('https://www.careerjunction.co.za/systems-administrator-job-2512345.aspx')
    expect(
      normalizeJobUrl('https://www.careerjunction.co.za/jobs/view?jobid=2512345&src=feed'),
    ).toBe('https://www.careerjunction.co.za/jobs/view?jobid=2512345')
  })
})
