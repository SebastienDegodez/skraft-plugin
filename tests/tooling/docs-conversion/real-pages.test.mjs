// The converter against the nine pages WP0 converted by hand, EN and FR.
// fixtures/real-pages/jekyll: the Jekyll originals, docs/site/{en,fr} of origin/integration/v2-next at 00cc4de8.
// fixtures/real-pages/docusaurus: the hand conversions, docs/website of origin/docs/docusaurus at 8cc5480e.
// Both are frozen copies, so a later readability pass on docs/website does not move this comparison.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkPage, convertPage } from '../../../eng/docs/convert-jekyll.mjs'

const root = fileURLToPath(new URL('./fixtures/real-pages/', import.meta.url))
const PAGES = [
  'index',
  'tutorials/getting-started',
  'tutorials/first-run-copilot',
  'how-to/install-on-a-host',
  'how-to/run-gates',
  'explanation/pipeline/index',
  'explanation/pipeline/design',
  'reference/cli',
  'reference/citations',
]
// WP0 wrote install-on-a-host as .mdx: in the bulk run the converter reads that from the existing file.
const MDX_DOCS = ['how-to/install-on-a-host']

const TABS_OPEN = '<Tabs groupId="host" queryString="host">\n<TabItem value="claude-code" label="Claude Code" default>\n'
const TABS_IMPORTS = "import Tabs from '@theme/Tabs';\nimport TabItem from '@theme/TabItem';\n\n"

/**
 * Every place where the converter's output and the hand conversion differ, with the reason.
 * Each `from` must occur in the converter's output; replaced by `to`, the output equals the hand page.
 */
const DIFFERENCES = [
  {
    pages: ['en/how-to/install-on-a-host', 'fr/how-to/install-on-a-host'],
    reason: 'Tabs per host are written by hand (reported by the converter as host sections)',
    edits: [
      ['---\n\n# ', `---\n\n${TABS_IMPORTS}# `],
      ['### Claude Code\n', TABS_OPEN],
      ['### GitHub Copilot CLI\n', '</TabItem>\n<TabItem value="copilot-cli" label="GitHub Copilot CLI">\n'],
      ['### VS Code\n', '</TabItem>\n<TabItem value="vscode" label="VS Code">\n'],
    ],
  },
  {
    pages: ['en/how-to/install-on-a-host'],
    reason: 'end of the Tabs, written by hand',
    edits: [['\n\n## 2. Add the optional plugins', '\n\n</TabItem>\n</Tabs>\n\n## 2. Add the optional plugins']],
  },
  {
    pages: ['fr/how-to/install-on-a-host'],
    reason: 'end of the Tabs, written by hand',
    edits: [['\n\n## 2. Ajouter les plugins optionnels', '\n\n</TabItem>\n</Tabs>\n\n## 2. Ajouter les plugins optionnels']],
  },
  {
    pages: ['en/how-to/run-gates', 'fr/how-to/run-gates'],
    reason: 'skraft CLI output: the plan (§2.5) makes it a console block without prompt; WP0 left it text',
    edits: [['```console\nskraft checkout: gates passed', '```text\nskraft checkout: gates passed']],
  },
  {
    pages: ['en/tutorials/getting-started', 'fr/tutorials/getting-started'],
    reason: 'slash commands under a paragraph naming Claude Code: the plan (§2.5) gives them a > prompt and the host title; WP0 left this block text and converted the same shape in step 5',
    edits: [[
      '```console title="Claude Code"\n> /plugin marketplace add SebastienDegodez/skraft-plugin\n> /plugin install skraft\n',
      '```text\n/plugin marketplace add SebastienDegodez/skraft-plugin\n/plugin install skraft\n',
    ]],
  },
  {
    pages: ['en/reference/cli'],
    reason: 'WP0 dropped the blank line after this heading by hand; the converter keeps the source layout (same rendering)',
    edits: [['## Going further <!-- #see-also -->\n\n', '## Going further <!-- #see-also -->\n']],
  },
  {
    pages: ['fr/reference/cli'],
    reason: 'WP0 dropped the blank line after this heading by hand; the converter keeps the source layout (same rendering)',
    edits: [['## Pour aller plus loin <!-- #see-also -->\n\n', '## Pour aller plus loin <!-- #see-also -->\n']],
  },
  {
    pages: ['en/index'],
    reason: 'WP0 dropped the blank line after this heading by hand; the converter keeps the source layout (same rendering)',
    edits: [['## Available today, and what comes next {/* #roadmap */}\n\n', '## Available today, and what comes next {/* #roadmap */}\n']],
  },
  {
    pages: ['fr/index'],
    reason: 'WP0 dropped the blank line after this heading by hand; the converter keeps the source layout (same rendering)',
    edits: [['## Disponible aujourd\'hui, et ce qui arrive {/* #roadmap */}\n\n', '## Disponible aujourd\'hui, et ce qui arrive {/* #roadmap */}\n']],
  },
]

/** What the converter leaves for a hand resolution on these pages. */
const FINDINGS = {
  'en/tutorials/first-run-copilot': [{ rule: 'code-fences', line: 139, reason: 'host slash commands, but no single host named above the block' }],
  'fr/tutorials/first-run-copilot': [{ rule: 'code-fences', line: 140, reason: 'host slash commands, but no single host named above the block' }],
  'en/how-to/install-on-a-host': [{ rule: 'extension', line: 26, reason: 'host sections (Claude Code, GitHub Copilot CLI, VS Code): write Tabs groupId="host" by hand' }],
  'fr/how-to/install-on-a-host': [{ rule: 'extension', line: 26, reason: 'host sections (Claude Code, GitHub Copilot CLI, VS Code): write Tabs groupId="host" by hand' }],
}

const handPage = (locale, docId) => {
  const base = join(root, 'docusaurus', locale, docId)
  const extension = existsSync(`${base}.mdx`) ? '.mdx' : '.md'
  return { text: readFileSync(base + extension, 'utf8'), extension }
}

const convert = (locale, docId, source) => convertPage(source, { docId, locale, mdxDocs: MDX_DOCS })

const applyDifferences = (key, text) => DIFFERENCES.filter((difference) => difference.pages.includes(key))
  .flatMap((difference) => difference.edits)
  .reduce((current, [from, to]) => {
    assert.equal(current.split(from).length, 2, `${key}: expected exactly one ${JSON.stringify(from)}`)
    return current.replace(from, () => to)
  }, text)

for (const locale of ['en', 'fr']) {
  for (const docId of PAGES) {
    const key = `${locale}/${docId}`
    test(`${key}: the converter's output is the hand conversion, up to the listed differences`, () => {
      const source = readFileSync(join(root, 'jekyll', locale, `${docId}.md`), 'utf8')
      const hand = handPage(locale, docId)
      const result = convert(locale, docId, source)
      assert.equal(result.extension, hand.extension)
      assert.equal(applyDifferences(key, result.text), hand.text)
      assert.deepEqual(result.findings, FINDINGS[key] ?? [])
    })

    test(`${key}: converting the output again changes nothing, and the check passes`, () => {
      const source = readFileSync(join(root, 'jekyll', locale, `${docId}.md`), 'utf8')
      const once = convert(locale, docId, source)
      assert.equal(convert(locale, docId, once.text).text, once.text)
      assert.deepEqual(checkPage(once.text, { extension: once.extension }), [])
      const hand = handPage(locale, docId)
      assert.deepEqual(checkPage(hand.text, { extension: hand.extension }), [])
    })
  }
}
