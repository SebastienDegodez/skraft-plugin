import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runCli } from '../../../eng/docs/convert-jekyll.mjs'

const script = fileURLToPath(new URL('../../../eng/docs/convert-jekyll.mjs', import.meta.url))
const FR_DOCS = join('i18n', 'fr', 'docusaurus-plugin-content-docs', 'current')

const page = (title, body) => `---\nlayout: doc\nlang: en\ntitle: "${title}"\n---\n\n# ${title}\n\n${body}\n`

const SITE = {
  'en/how-to/run-gates.md': page('Run the gates', 'Install first: [install]({{ "/en/how-to/install-on-a-host" | relative_url }}#skraft-command).'),
  'en/how-to/install-on-a-host.md': page('Install', 'The Jekyll original of a page already converted by hand.'),
  'en/tutorials/first-run-copilot.md': page('First run', 'Type the command:\n\n```text\n/skraft checkout #42\n```'),
  'en/dashboard/index.md': '---\nlayout: dashboard\nlang: en\npermalink: /en/dashboard/\n---\n',
  'fr/how-to/run-gates.md': page('Lancer les gates', 'Voir [la CLI]({{ "/en/reference/cli" | relative_url }}).'),
}

const withTree = (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-convert-'))
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  try {
    for (const [file, text] of Object.entries(SITE)) write(join('site', file), text)
    write(join('website', 'docs', 'how-to', 'install-on-a-host.mdx'), '# Install\n\nConverted by hand, with Tabs.\n')
    const lines = []
    const cli = (...argv) => runCli(argv, { cwd: dir, print: (line) => lines.push(line) })
    run({ dir, cli, lines, read: (file) => readFileSync(join(dir, file), 'utf8'), write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('--src converts every page into the Docusaurus tree and --report lists what needs a hand resolution', () => {
  withTree(({ cli, read, dir }) => {
    assert.equal(cli('--src', 'site', '--dest', 'website', '--report', 'report.json'), 0)
    assert.match(read('website/docs/how-to/run-gates.md'), /\[install\]\(\.\/install-on-a-host\.mdx#skraft-command\)/)
    assert.equal(read('website/docs/how-to/install-on-a-host.mdx'), '# Install\n\nConverted by hand, with Tabs.\n')
    assert.ok(existsSync(join(dir, 'website', FR_DOCS, 'how-to', 'run-gates.md')))
    assert.ok(!existsSync(join(dir, 'website', 'docs', 'dashboard')))
    const report = JSON.parse(read('report.json'))
    assert.equal(report.pages, 5)
    assert.equal(report.converted, 3)
    assert.deepEqual(report.handResolution, [
      {
        source: 'en/tutorials/first-run-copilot.md',
        target: 'docs/tutorials/first-run-copilot.md',
        line: 11,
        rule: 'code-fences',
        reason: 'host slash commands, but no single host named above the block',
      },
      {
        source: 'fr/how-to/run-gates.md',
        target: `${FR_DOCS.split('\\').join('/')}/how-to/run-gates.md`,
        line: 9,
        rule: 'internal-links',
        reason: 'link to another locale: /en/reference/cli',
      },
    ])
    assert.deepEqual(report.skipped, [
      { source: 'en/dashboard/index.md', reason: 'dashboard page: a static app outside the docs (permalink /en/dashboard/)' },
      { source: 'en/how-to/install-on-a-host.md', reason: 'target exists: docs/how-to/install-on-a-host.mdx' },
    ])
  })
})

test('--dry-run writes the report and no page; --locale keeps one locale', () => {
  withTree(({ cli, read, dir }) => {
    assert.equal(cli('--src', 'site', '--dest', 'website', '--locale', 'fr', '--dry-run', '--report', 'report.json'), 0)
    assert.ok(!existsSync(join(dir, 'website', FR_DOCS)))
    const report = JSON.parse(read('report.json'))
    assert.equal(report.pages, 1)
    assert.deepEqual(report.handResolution.map((entry) => entry.source), ['fr/how-to/run-gates.md'])
  })
})

test('--check exits 1 and names each file and line still holding Liquid; 0 once resolved', () => {
  withTree(({ cli, lines, write }) => {
    cli('--src', 'site', '--dest', 'website')
    lines.length = 0
    assert.equal(cli('--check', '--dest', 'website'), 1)
    assert.deepEqual(lines, [
      `${FR_DOCS.split('\\').join('/')}/how-to/run-gates.md:7: Liquid left in prose: {{ "/en/reference/cli" | relative_url }}`,
      '1 problem in 4 pages',
    ])
    write(join('website', FR_DOCS, 'how-to', 'run-gates.md'), '# Lancer les gates\n\nVoir [la CLI](../reference/cli.md).\n')
    assert.equal(cli('--check', '--dest', 'website'), 0)
  })
})

test('--in-place converts pages already moved into the Docusaurus tree, renaming those that need .mdx', () => {
  withTree(({ cli, read, write, dir }) => {
    write(join('website', 'docs', 'how-to', 'run-gates.md'), SITE['en/how-to/run-gates.md'])
    write(join('website', 'docs', 'reference', 'citations.md'), page('Bibliography', '{% for cite in site.data.citations %}\n<div></div>\n{% endfor %}'))
    assert.equal(cli('--in-place', '--dest', 'website'), 0)
    assert.match(read('website/docs/how-to/run-gates.md'), /^---\ntitle: "Run the gates"\n---\n/)
    assert.ok(!existsSync(join(dir, 'website', 'docs', 'reference', 'citations.md')))
    assert.match(read('website/docs/reference/citations.mdx'), /<Bibliography \/>/)
    assert.equal(read('website/docs/how-to/install-on-a-host.mdx'), '# Install\n\nConverted by hand, with Tabs.\n')
  })
})

test('an unknown option is a usage error', () => {
  withTree(({ cli, lines }) => {
    assert.equal(cli('--src', 'site', '--colour', 'red'), 2)
    assert.match(lines.join('\n'), /unknown option --colour/)
  })
})

test('the script runs from the command line: a dry run, then the check of what it would write', () => {
  withTree(({ dir }) => {
    const argv = [script, '--src', 'site', '--dest', 'website', '--locale', 'en', '--dry-run', '--check']
    const result = spawnSync(process.execPath, argv, { cwd: dir, encoding: 'utf8' })
    assert.equal(result.stderr, '')
    assert.equal(result.status, 0)
    assert.match(result.stdout, /converted 2 pages of 4 \(0 \.mdx\), dry run: nothing written; 1 finding needs a hand resolution; 2 skipped\n/)
    assert.match(result.stdout, /no problems in 2 pages\n$/)
  })
})
