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

test('internal links become relative file links with their extension, assets move under /img', () => {
  const { result, after } = convertFixture('internal-links', {
    docId: 'tutorials/getting-started',
    mdxDocs: ['how-to/install-on-a-host'],
  })
  assert.equal(result.text, after)
  assert.deepEqual(result.findings, [])
})

test('a French page links inside the French tree; a link to the other locale is left for a hand resolution', () => {
  const { result, after } = convertFixture('internal-links-fr', { docId: 'tutorials/getting-started', locale: 'fr' })
  assert.equal(result.text, after)
  assert.deepEqual(result.findings, [{
    rule: 'internal-links',
    line: 9,
    reason: 'link to another locale: /en/reference/cli',
  }])
})

test('the phase-ribbon include becomes the phase front matter key; another include is left for a hand resolution', () => {
  const { result, after } = convertFixture('phase-ribbon', { docId: 'explanation/pipeline/design' })
  assert.equal(result.text, after)
  assert.deepEqual(result.findings, [{ rule: 'includes', line: 14, reason: 'include with no Docusaurus equivalent: doc-pager.html' }])
})

test('the running example block becomes an info admonition titled by its label', () => {
  const { result, after } = convertFixture('running-example', { docId: 'explanation/pipeline/design', locale: 'fr' })
  assert.equal(result.text, after)
  assert.deepEqual(result.findings, [])
})

test('raw and endraw tags go, their content stays', () => {
  const { result, after } = convertFixture('raw-blocks', { docId: 'reference/phases' })
  assert.equal(result.text, after)
})

test('the citations page becomes an .mdx page whose Liquid loop is the Bibliography component', () => {
  const { result, after, extension } = convertFixture('citations-page', { docId: 'reference/citations' })
  assert.equal(result.text, after)
  assert.equal(result.extension, extension)
  assert.deepEqual(result.findings, [])
})

test('heading IDs become HTML comments in an .md page, code fences untouched', () => {
  const { result, after } = convertFixture('heading-ids', { docId: 'reference/cli' })
  assert.equal(result.text, after)
})

test('heading IDs become JSX comments in an .mdx page', () => {
  const { result, after, extension } = convertFixture('heading-ids-mdx', { docId: 'index' })
  assert.equal(result.text, after)
  assert.equal(result.extension, extension)
})

test('with classic heading IDs, {#id} stays for mdx1Compat.headingIds', () => {
  const { before } = fixture('heading-ids')
  const { text } = convertPage(before, { docId: 'reference/cli', locale: 'en', headingIds: 'classic' })
  assert.equal(text, before)
})

test('the blockquote right after the H1 becomes the lead; the labelled ones become admonitions; a quotation stays', () => {
  const { result, after } = convertFixture('blockquotes', { docId: 'how-to/contributing' })
  assert.equal(result.text, after)
})

test('the lead blockquote is found after a removed phase ribbon, not after a paragraph', () => {
  const source = '---\ntitle: "DESIGN"\n---\n\n# DESIGN\n\n{% include phase-ribbon.html current="design" %}\n\n> Decide.\n\nText.\n\n> Quoted.\n'
  const { text } = convertPage(source, { docId: 'explanation/pipeline/design', locale: 'en' })
  assert.equal(text, '---\ntitle: "DESIGN"\nphase: design\n---\n\n# DESIGN\n\nDecide.\n\nText.\n\n> Quoted.\n')
})

test('shell fences become console blocks in place; an ambiguous one is reported at its line', () => {
  const { result, after } = convertFixture('code-fences', { docId: 'tutorials/getting-started' })
  assert.equal(result.text, after)
  assert.deepEqual(result.findings, [{
    rule: 'code-fences',
    line: 13,
    reason: 'host slash commands, but no single host named above the block',
  }])
})

test('placeholders in prose become entities; code spans, fences and real HTML stay', () => {
  const { result, after } = convertFixture('placeholders', { docId: 'reference/hosts' })
  assert.equal(result.text, after)
})

test('in an .mdx page, braces and a lone < in prose are escaped, code spans and heading IDs stay', () => {
  const { result, after } = convertFixture('braces-mdx', { docId: 'index' })
  assert.equal(result.text, after)
})

test('in an .md page, braces in prose stay', () => {
  const source = '# T\n\nThe workflow starts with { slug: "checkout" }.\n'
  assert.equal(convertPage(source, { docId: 'tutorials/first-run-copilot', locale: 'en' }).text, source)
})

test('a page stays .md unless it needs JSX: a component in its source makes it .mdx', () => {
  const plain = convertPage('# Run the gates\n\nText.\n', { docId: 'how-to/run-gates', locale: 'en' })
  assert.equal(plain.extension, '.md')
  const tabs = "import Tabs from '@theme/Tabs';\n\n# Install {#install}\n\n<Tabs groupId=\"host\">\n</Tabs>\n"
  const converted = convertPage(tabs, { docId: 'how-to/install-on-a-host', locale: 'en' })
  assert.equal(converted.extension, '.mdx')
  assert.match(converted.text, /# Install \{\/\* #install \*\/\}/)
})

test('host sections are reported as Tabs to write by hand', () => {
  const source = '# Install\n\n## 1. Install the plugin\n\n### Claude Code\n\nA.\n\n### GitHub Copilot CLI\n\nB.\n\n### VS Code\n\nC.\n'
  const { extension, findings } = convertPage(source, { docId: 'how-to/install-on-a-host', locale: 'en' })
  assert.equal(extension, '.md')
  assert.deepEqual(findings, [{
    rule: 'extension',
    line: 5,
    reason: 'host sections (Claude Code, GitHub Copilot CLI, VS Code): write Tabs groupId="host" by hand, then rename to .mdx',
  }])
})

test('with the catalogue option, dashboard links point at the catalogue page', () => {
  const source = '# T\n\n[Catalogue]({{ "/en/dashboard/" | relative_url }}), [data]({{ "/dashboard/" | relative_url }})\n'
  const { text } = convertPage(source, { docId: 'how-to/run-gates', locale: 'en', dashboardLink: 'catalogue' })
  assert.equal(text, '# T\n\n[Catalogue](../reference/catalogue.md), [data](../reference/catalogue.md)\n')
})
