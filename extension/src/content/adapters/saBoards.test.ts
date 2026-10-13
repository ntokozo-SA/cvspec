import { afterEach, describe, expect, it } from 'vitest'
import careerJunctionHtml from './__fixtures__/careerjunction.html?raw'
import careers24Html from './__fixtures__/careers24.html?raw'
import offerZenHtml from './__fixtures__/offerzen.html?raw'
import pnetHtml from './__fixtures__/pnet.html?raw'
import { findAdapter } from './index'

afterEach(() => {
  document.body.innerHTML = ''
})

function adapterFor(url: string) {
  const adapter = findAdapter(new URL(url))
  if (!adapter) throw new Error(`No adapter for ${url}`)
  return adapter
}

describe('SA job board URLs', () => {
  it.each([
    [
      'https://www.pnet.co.za/jobs--Intermediate-Java-Developer-Stellenbosch-Mediclinic--1234567-inline.html',
      'pnet',
      'pnet:1234567',
    ],
    [
      'https://www.careers24.com/jobs/adverts/2112345-junior-data-analyst-sandton/',
      'careers24',
      'careers24:2112345',
    ],
    [
      'https://www.careerjunction.co.za/systems-administrator-job-2512345.aspx',
      'careerjunction',
      'careerjunction:2512345',
    ],
    [
      'https://www.offerzen.com/companies/yoco/jobs/senior-frontend-engineer',
      'offerzen',
      'offerzen:senior-frontend-engineer',
    ],
  ])('%s is a %s posting', (url, board, key) => {
    const adapter = adapterFor(url)
    expect(adapter.board).toBe(board)
    expect(adapter.jobKey(new URL(url))).toBe(key)
  })

  it('ignores search and home pages without a posting', () => {
    expect(findAdapter(new URL('https://www.pnet.co.za/jobs/it'))).toBeNull()
    expect(findAdapter(new URL('https://www.careers24.com/jobs/lc-cape-town/'))).toBeNull()
    expect(findAdapter(new URL('https://www.offerzen.com/'))).toBeNull()
  })

  it('matches a board page that carries JobPosting JSON-LD', () => {
    document.body.innerHTML = pnetHtml
    expect(adapterFor('https://www.pnet.co.za/some/other/path').board).toBe('pnet')
  })
})

describe('PNet', () => {
  const url = 'https://www.pnet.co.za/jobs--Java-Developer--1234567-inline.html'

  it('extracts the posting', () => {
    document.body.innerHTML = pnetHtml
    const job = adapterFor(url).extract()

    expect(job).toMatchObject({
      board: 'pnet',
      title: 'Intermediate Java Developer',
      company: 'Mediclinic',
      location: 'Stellenbosch',
    })
    expect(job?.descriptionText).toContain('Spring Boot services')
  })

  it('treats PNet profile apply as built in, and an employer link as fillable', () => {
    document.body.innerHTML = pnetHtml
    const adapter = adapterFor(url)
    expect(adapter.isBuiltInApply()).toBe(true)

    document.querySelector('[data-at="apply-button"]')!.setAttribute(
      'href',
      'https://mediclinic.wd3.myworkdayjobs.com/en-US/careers/job/123/apply',
    )
    expect(adapter.isBuiltInApply()).toBe(false)
  })
})

describe('Careers24', () => {
  const url = 'https://www.careers24.com/jobs/adverts/2112345-junior-data-analyst-sandton/'

  it('extracts the posting from the page', () => {
    document.body.innerHTML = careers24Html
    const job = adapterFor(url).extract()

    expect(job).toMatchObject({
      board: 'careers24',
      title: 'Junior Data Analyst',
      company: 'Discovery Limited',
      location: 'Sandton, Gauteng',
    })
    expect(job?.descriptionText).toContain('Vitality analytics team')
  })

  it('lets an "Apply on company website" link through to the employer form', () => {
    document.body.innerHTML = careers24Html
    expect(adapterFor(url).isBuiltInApply()).toBe(false)
  })
})

describe('CareerJunction', () => {
  const url = 'https://www.careerjunction.co.za/systems-administrator-job-2512345.aspx'

  it('extracts the posting and treats Apply Now as the board form', () => {
    document.body.innerHTML = careerJunctionHtml
    const adapter = adapterFor(url)

    expect(adapter.extract()).toMatchObject({
      board: 'careerjunction',
      title: 'Systems Administrator',
      company: 'Dimension Data',
    })
    expect(adapter.isBuiltInApply()).toBe(true)
  })
})

describe('OfferZen', () => {
  it('saves the posting for tracking and never offers to fill', () => {
    document.body.innerHTML = offerZenHtml
    const adapter = adapterFor('https://www.offerzen.com/companies/yoco/jobs/senior-frontend-engineer')

    expect(adapter.extract()).toMatchObject({
      board: 'offerzen',
      title: 'Senior Frontend Engineer',
      company: 'Yoco',
    })
    expect(adapter.isBuiltInApply()).toBe(true)
  })
})
