import { afterEach, describe, expect, it } from 'vitest'
import { glassdoorAdapter } from './glassdoor'
import { looksBuiltInApply } from './heuristics'
import { indeedAdapter } from './indeed'

function button(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('looksBuiltInApply', () => {
  it('flags board-hosted apply flows', () => {
    expect(looksBuiltInApply(button('<button>Easy Apply</button>'))).toBe(true)
    expect(looksBuiltInApply(button('<button>1-Click Apply</button>'))).toBe(true)
    expect(looksBuiltInApply(button('<a href="#">Submit a proposal</a>'))).toBe(true)
    expect(
      looksBuiltInApply(button('<button aria-label="Easy Apply to Engineer at Acme"></button>')),
    ).toBe(true)
  })

  it('does not flag apply buttons that link out to the employer', () => {
    expect(looksBuiltInApply(button('<button>Apply</button>'))).toBe(false)
    expect(looksBuiltInApply(button('<a href="#">Apply on company site</a>'))).toBe(false)
    expect(looksBuiltInApply(null)).toBe(false)
  })
})

describe('Indeed built-in apply', () => {
  it('flags Indeed Apply', () => {
    document.body.innerHTML = '<div><button id="indeedApplyButton">Apply now</button></div>'
    expect(indeedAdapter.isBuiltInApply()).toBe(true)

    document.body.innerHTML =
      '<div class="jobsearch-IndeedApplyButton-contentWrapper"><button>Apply now</button></div>'
    expect(indeedAdapter.isBuiltInApply()).toBe(true)
  })

  it('does not flag the company-site link', () => {
    document.body.innerHTML =
      '<div id="applyButtonLinkContainer"><a href="https://acme.example/jobs/1">Apply on company site</a></div>'
    expect(indeedAdapter.isBuiltInApply()).toBe(false)
  })
})

describe('Glassdoor built-in apply', () => {
  it('flags Easy Apply', () => {
    document.body.innerHTML = '<button data-test="easyApply">Apply</button>'
    expect(glassdoorAdapter.isBuiltInApply()).toBe(true)
  })

  it('does not flag the employer apply button', () => {
    document.body.innerHTML = '<button data-test="applyButton">Apply on employer site</button>'
    expect(glassdoorAdapter.isBuiltInApply()).toBe(false)
  })
})
