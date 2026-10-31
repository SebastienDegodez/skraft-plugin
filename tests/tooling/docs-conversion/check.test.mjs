import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPage } from '../../../eng/docs/convert-jekyll.mjs'

test('the check finds Liquid left in prose, with its line, but not in code', () => {
  const page = [
    '---',
    'title: "T"',
    '---',
    '',
    '# T',
    '',
    'See [the CLI]({{ "/en/reference/cli" | relative_url }}).',
    '{% include doc-pager.html %}',
    '',
    'The template holds no `{{…}}` any more.',
    '',
    '```mermaid',
    'flowchart LR',
    '  a{{"mutation-plan"}}',
    '```',
    '',
  ].join('\n')
  assert.deepEqual(checkPage(page, { extension: '.md' }), [
    { rule: 'check', line: 7, reason: 'Liquid left in prose: {{ "/en/reference/cli" | relative_url }}' },
    { rule: 'check', line: 8, reason: 'Liquid left in prose: {% include doc-pager.html %}' },
  ])
})

test('the check finds a kramdown heading ID, unless classic heading IDs are kept', () => {
  const page = '# T\n\n## Install {#install}\n\n```text\n## not a heading {#x}\n```\n'
  assert.deepEqual(checkPage(page, { extension: '.md' }), [
    { rule: 'check', line: 3, reason: 'kramdown heading ID left: {#install}' },
  ])
  assert.deepEqual(checkPage(page, { extension: '.md', headingIds: 'classic' }), [])
})

test('in an .mdx page, the check finds unescaped braces and a < that opens no tag', () => {
  const page = [
    "import Tabs from '@theme/Tabs';",
    '',
    '## Roadmap {/* #roadmap */}',
    '',
    'Escaped \\{ fine \\}, code `{ a < b }` fine, <Tabs groupId="host"> and <em>x</em> fine.',
    'Starts with { slug: "x" } and waits on <slug>.',
    '',
  ].join('\n')
  assert.deepEqual(checkPage(page, { extension: '.mdx' }), [
    { rule: 'check', line: 6, reason: 'unescaped { in .mdx prose' },
    { rule: 'check', line: 6, reason: 'unescaped } in .mdx prose' },
    { rule: 'check', line: 6, reason: 'JSX hazard in .mdx prose: <slug>' },
  ])
  assert.deepEqual(checkPage('Starts with { slug } and <slug>.\n', { extension: '.md' }), [])
})
