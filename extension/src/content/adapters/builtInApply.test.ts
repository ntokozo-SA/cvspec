import { afterEach, describe, expect, it } from 'vitest'
import { looksBuiltInApply } from './heuristics'

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
