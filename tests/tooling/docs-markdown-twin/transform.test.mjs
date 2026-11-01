import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toMarkdownTwin } from '../../../docs/website/plugins/markdown-twin/transform.mjs'
import { htmlPathOf, twinPathOf } from '../../../docs/website/plugins/markdown-twin/twin-path.mjs'

const SITE = 'https://sebastiendegodez.github.io'
const RAW = 'https://raw.githubusercontent.com/SebastienDegodez/skraft-plugin/integration/v2-next/'

const page = (overrides = {}) => ({
  title: 'Run the gates',
  permalink: '/skraft-plugin/how-to/run-gates',
  docPath: 'how-to/run-gates.md',
  locale: 'en',
  versionLabel: '2.0 preview',
  versionPath: '/skraft-plugin/',
  updated: '2026-10-30',
  siteUrl: SITE,
  baseUrl: '/skraft-plugin/',
  rawRepo: RAW,
  sourceRepoPath: 'docs/website/docs/how-to/run-gates.md',
  twins: new Map([
    ['how-to/run-gates.md', '/skraft-plugin/how-to/run-gates.md'],
    ['how-to/install-on-a-host.mdx', '/skraft-plugin/how-to/install-on-a-host.md'],
    ['explanation/pipeline/index.md', '/skraft-plugin/explanation/pipeline.md'],
    ['index.mdx', '/skraft-plugin/index.md'],
  ]),
  citations: [],
  ...overrides,
})

const lines = (text) => text.split('\n')

test('the twin starts with the title and the source line, without front matter or the body H1', () => {
  const twin = toMarkdownTwin('---\ntitle: "Run the gates"\ndescription: x\n---\n\n# Run the gates\n\nBody.\n', page())
  assert.deepEqual(lines(twin).slice(0, 5), [
    '# Run the gates',
    '',
    `> Source: ${SITE}/skraft-plugin/how-to/run-gates · Version 2.0 preview · en · Updated 2026-10-30`,
    '',
    'Body.',
  ])
  assert.doesNotMatch(twin, /description: x/)
})

test('the source line leaves out the update date when the doc has none', () => {
  const twin = toMarkdownTwin('Body.\n', page({ updated: undefined }))
  assert.equal(lines(twin)[2], `> Source: ${SITE}/skraft-plugin/how-to/run-gates · Version 2.0 preview · en`)
})

test('a relative doc link points to the absolute URL of the target twin, anchor kept', () => {
  const twin = toMarkdownTwin(
    'See [install](./install-on-a-host.mdx#skraft-command) and [the pipeline](../explanation/pipeline/index.md).\n',
    page(),
  )
  assert.match(twin, new RegExp(`\\[install\\]\\(${SITE}/skraft-plugin/how-to/install-on-a-host\\.md#skraft-command\\)`))
  assert.match(twin, new RegExp(`\\[the pipeline\\]\\(${SITE}/skraft-plugin/explanation/pipeline\\.md\\)`))
})

test('a link to the home doc points to index.md, and a doc not built yet to its conventional twin', () => {
  const twin = toMarkdownTwin('[Home](../index.mdx) · [Hosts](../reference/hosts.md#copilot-cli) · [Backlog](../explanation/backlog/index.md)\n', page())
  assert.match(twin, new RegExp(`\\[Home\\]\\(${SITE}/skraft-plugin/index\\.md\\)`))
  assert.match(twin, new RegExp(`\\[Hosts\\]\\(${SITE}/skraft-plugin/reference/hosts\\.md#copilot-cli\\)`))
  assert.match(twin, new RegExp(`\\[Backlog\\]\\(${SITE}/skraft-plugin/explanation/backlog\\.md\\)`))
})

test('French and next permalinks give French and next twin URLs', () => {
  const fr = page({
    locale: 'fr',
    versionLabel: 'next',
    permalink: '/skraft-plugin/fr/next/how-to/run-gates',
    versionPath: '/skraft-plugin/fr/next',
    twins: new Map([['how-to/install-on-a-host.mdx', '/skraft-plugin/fr/next/how-to/install-on-a-host.md']]),
  })
  const twin = toMarkdownTwin('[installer](./install-on-a-host.mdx) · [hôtes](../reference/hosts.md)\n', fr)
  assert.equal(lines(twin)[2], `> Source: ${SITE}/skraft-plugin/fr/next/how-to/run-gates · Version next · fr · Updated 2026-10-30`)
  assert.match(twin, new RegExp(`\\(${SITE}/skraft-plugin/fr/next/how-to/install-on-a-host\\.md\\)`))
  assert.match(twin, new RegExp(`\\(${SITE}/skraft-plugin/fr/next/reference/hosts\\.md\\)`))
})

test('the twin of a page is its served path plus .md, index.md for the home of a version', () => {
  assert.equal(twinPathOf({ permalink: '/skraft-plugin/fr/next/how-to/run-gates', slug: '/how-to/run-gates' }), '/skraft-plugin/fr/next/how-to/run-gates.md')
  assert.equal(twinPathOf({ permalink: '/skraft-plugin/explanation/pipeline/', slug: '/explanation/pipeline/' }), '/skraft-plugin/explanation/pipeline.md')
  assert.equal(htmlPathOf({ permalink: '/skraft-plugin/explanation/pipeline/', slug: '/explanation/pipeline/' }), '/skraft-plugin/explanation/pipeline')
  assert.equal(twinPathOf({ permalink: '/skraft-plugin/fr/', slug: '/' }), '/skraft-plugin/fr/index.md')
  assert.equal(twinPathOf({ permalink: '/skraft-plugin/next', slug: '/' }), '/skraft-plugin/next/index.md')
})

test('an admonition becomes a blockquote with its type and title, in the page language', () => {
  const source = ':::warning[Locked gate]\nDo not remove it.\n\nEver.\n:::\n\n:::tip\nShort.\n:::\n'
  assert.deepEqual(lines(toMarkdownTwin(source, page())).slice(4, 13), [
    '> **Warning — Locked gate**',
    '>',
    '> Do not remove it.',
    '>',
    '> Ever.',
    '',
    '> **Tip**',
    '>',
    '> Short.',
  ])
  assert.match(toMarkdownTwin(source, page({ locale: 'fr' })), /> \*\*Attention — Locked gate\*\*/)
})

test('MDX imports go, and Tabs become one level-4 section per tab', () => {
  const source = [
    "import Tabs from '@theme/Tabs';",
    "import TabItem from '@theme/TabItem';",
    '',
    '<Tabs groupId="host" queryString="host">',
    '<TabItem value="claude-code" label="Claude Code" default>',
    '',
    'Type it.',
    '',
    '</TabItem>',
    '<TabItem value="vscode" label="VS Code">',
    '',
    'Click it.',
    '',
    '</TabItem>',
    '</Tabs>',
  ].join('\n')
  const twin = toMarkdownTwin(source, page())
  assert.doesNotMatch(twin, /import |<\/?Tabs|<\/?TabItem/)
  assert.ok(twin.indexOf('#### Claude Code') < twin.indexOf('Type it.'))
  assert.ok(twin.indexOf('Type it.') < twin.indexOf('#### VS Code'))
  assert.ok(twin.indexOf('#### VS Code') < twin.indexOf('Click it.'))
})

test('the workflow viewer becomes a link to the DOT file at the version ref', () => {
  const twin = toMarkdownTwin('<WorkflowViewer file="pipeline" />\n\n<WorkflowViewer file="review" direction="TB" />\n', page())
  assert.match(
    twin,
    new RegExp(`\\[Workflow \`pipeline\` \\(DOT source\\)\\]\\(${RAW}plugins/skraft-framework/workflows/pipeline\\.skraft\\.dot\\)`),
  )
  assert.match(
    twin,
    new RegExp(`\\[Workflow \`review\` \\(DOT source\\)\\]\\(${RAW}plugins/skraft-framework/workflows/review\\.skraft\\.dot\\)`),
  )
  assert.doesNotMatch(twin, /WorkflowViewer/)
})

test('a heading id written as an MDX comment keeps the HTML comment of the .md pages', () => {
  const twin = toMarkdownTwin('## Files {/* #files */}\n\nText.\n', page())
  assert.match(twin, /^## Files <!-- #files -->$/m)
  assert.doesNotMatch(twin, /\{\/\*/)
})

test('the bibliography becomes the list of citations', () => {
  const citations = [
    { key: 'evans-ddd-2003', authors: 'Evans, E.', year: 2003, title: 'Domain-Driven Design', publisher: 'Addison-Wesley' },
    { key: 'fowler-2018', authors: 'Fowler, M.', year: 2018, title: 'Refactoring', url: 'https://example.org/r' },
  ]
  const twin = toMarkdownTwin("import Bibliography from '@site/src/components/Bibliography';\n\n<Bibliography />\n", page({ citations }))
  assert.match(twin, /^- \*\*Evans, E\.\*\* \(2003\)\. \*Domain-Driven Design\*\. Addison-Wesley\.$/m)
  assert.match(twin, /^- \*\*Fowler, M\.\*\* \(2018\)\. \*Refactoring\*\. https:\/\/example\.org\/r$/m)
  assert.ok(twin.indexOf('Evans') < twin.indexOf('Fowler'))
})

test('images get absolute URLs: static ones on the site, relative ones on the repository', () => {
  const twin = toMarkdownTwin('![Terminal](/img/screenshots/shared/terminal-init.svg)\n\n![Local](./img/canvas.png)\n', page())
  assert.match(twin, new RegExp(`!\\[Terminal\\]\\(${SITE}/skraft-plugin/img/screenshots/shared/terminal-init\\.svg\\)`))
  assert.match(twin, new RegExp(`!\\[Local\\]\\(${RAW}docs/website/docs/how-to/img/canvas\\.png\\)`))
})

test('fenced code, console blocks included, is kept exactly as written', () => {
  const fence = ['```console title="Claude Code"', '> /plugin install skraft', ':::note', '[x](./a.md)', "import x from 'y'", '```']
  const twin = toMarkdownTwin(`${fence.join('\n')}\n`, page())
  assert.ok(twin.includes(fence.join('\n')))
})

test('a link inside inline code is not rewritten, and external links are left alone', () => {
  const twin = toMarkdownTwin('Write `[x](./a.md)` or see [site](https://example.org/a.md).\n', page())
  assert.ok(twin.includes('`[x](./a.md)`'))
  assert.ok(twin.includes('[site](https://example.org/a.md)'))
})
