import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { convertPage } from '../../../eng/docs/convert-jekyll.mjs'

const rules = fileURLToPath(new URL('./fixtures/rules/', import.meta.url))

const fixture = (name) => {
  const read = (file) => readFileSync(join(rules, name, file), 'utf8')
  const mdx = existsSync(join(rules, name, 'after.mdx'))
  return { before: read('before.md'), after: read(mdx ? 'after.mdx' : 'after.md'), extension: mdx ? '.mdx' : '.md' }
}

const convertFixture = (name, options = {}) => {
  const { before, after, extension } = fixture(name)
  const result = convertPage(before, { docId: 'how-to/run-gates', locale: 'en', ...options })
  return { result, after, extension }
}

test('front matter keeps title, description and persona, drops layout, lang and permalink, and lists the permalink as a redirect', () => {
  const { result, after } = convertFixture('front-matter')
  assert.equal(result.text, after)
  assert.equal(result.extension, '.md')
  assert.deepEqual(result.redirects, [{ from: '/en/how-to/gates/', to: 'how-to/run-gates' }])
})

test('citation links lose the cites variable and point at the citations page, anchor kept', () => {
  const { result, after } = convertFixture('citation-links', { docId: 'explanation/pipeline/design' })
  assert.equal(result.text, after)
  assert.deepEqual(result.findings, [])
})
