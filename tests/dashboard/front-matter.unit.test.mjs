import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readFrontMatter } from '../../eng/lib/front-matter.mjs'

describe('front matter', () => {
  it('reads a plain scalar', () => {
    const { data, body } = readFrontMatter('---\nname: outside-in-tdd\n---\n# Title\n')

    strictEqual(data.name, 'outside-in-tdd')
    strictEqual(body, '# Title\n')
  })

  it('unwraps a quoted scalar that itself contains quotes', () => {
    const { data } = readFrontMatter('---\ndescription: "Activate on \\"design\\", \\"ADR\\"."\n---\n')

    strictEqual(data.description, 'Activate on \\"design\\", \\"ADR\\".')
  })

  it('folds a > block scalar onto one line', () => {
    const content = ['---', 'description: >', '  Use BEFORE drafting any ADR', '  when a story enters DESIGN.', '---', ''].join('\n')

    strictEqual(readFrontMatter(content).data.description, 'Use BEFORE drafting any ADR when a story enters DESIGN.')
  })

  it('keeps the newlines of a | block scalar', () => {
    const content = ['---', 'description: |', '  first', '  second', '---', ''].join('\n')

    strictEqual(readFrontMatter(content).data.description, 'first\nsecond')
  })

  it('reads a sequence', () => {
    const content = ['---', 'tools:', '  - read/readFile', '  - agent', 'model: Claude Sonnet 5', '---', ''].join('\n')
    const { data } = readFrontMatter(content)

    deepStrictEqual(data.tools, ['read/readFile', 'agent'])
    strictEqual(data.model, 'Claude Sonnet 5')
  })

  it('returns the whole document as body when there is no front matter', () => {
    const { data, body } = readFrontMatter('# No front matter\n')

    deepStrictEqual(data, {})
    strictEqual(body, '# No front matter\n')
  })
})
