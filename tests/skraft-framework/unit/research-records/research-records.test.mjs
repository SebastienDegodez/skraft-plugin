import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const RESEARCH = 'research/2026-10-11/checkout-research.md'
/** A file of the working copy the harness holds, one line long. */
const MAP = 'docs/architecture/context-map.md'
/** Two lines, the last one without its newline, as a repository ends a file. */
const MONEY_PATH = 'src/Pricing/Money.cs'
const MONEY = { [MONEY_PATH]: 'public record Money(decimal Amount);\npublic record Fee(decimal Amount);' }

/**
 * A solution researcher that leaves `text` as its research document, and `beside` as the other
 * files of its folder.
 * @param {string} text @param {Record<string, string>} [beside]
 */
const researcher = (text, beside = {}) => agent({
  fill: false,
  work: ({ tracking }) => {
    tracking.write(SLUG, RESEARCH, text)
    for (const [path, other] of Object.entries(beside)) tracking.write(SLUG, path, other)
  },
})

/** A research document that cites `paths` as `#file:` citations, one per line under File analysis. @param {string[]} paths */
const citing = (paths) => [
  '# Research: the card payment',
  '',
  '## Research executed',
  '### File analysis',
  ...paths.map((path) => `- #file:${path}`),
  '',
].join('\n')

/** What the run recorded of each RESEARCH attempt. */
const recorded = (host) => host.events()
  .filter((event) => event.type === 'step.recorded' && event.step === 'research')
  .map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures])

const noFile = (path) => `${RESEARCH} cites #file:${path}, which is no file of the working copy (#517)`
const outOfRange = (cite, lines) => `${RESEARCH} cites #file:${cite}, outside the 1-${lines} line range (#517)`

test('a #file: citation of a path the working copy has not sends the researcher back, wherever the citation sits and however often it cites it, and the run goes on once every cited file exists', async () => {
  const host = scripted({}, (it) => [
    researcher('#file:src/Pricing/Discount.cs holds the fee, read in `#file:src/Pricing/Fee.cs` and again in #file:src/Pricing/Fee.cs, each with the tax (#file:src/Pricing/Tax.cs) of #file:src/Pricing/Vat.cs.\n')(it),
    researcher(citing(['src/Pricing/Receipt.cs']))(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [noFile('src/Pricing/Discount.cs'), noFile('src/Pricing/Fee.cs'), noFile('src/Pricing/Tax.cs'), noFile('src/Pricing/Vat.cs')]],
    [2, 'failed', 'research-records', [noFile('src/Pricing/Receipt.cs')]],
    [3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a #file: line range cited past the end of its file sends the researcher back, and a range that ends on the last line of a file holds', async () => {
  const host = scripted({ files: MONEY }, (it) => [
    researcher(`#file:${MAP}:12 names the bounded contexts, #file:${MAP}:10-12 the events it publishes, and #file:${MAP}:4\u20136 the policies that rule them.\n`)(it),
    researcher(`${citing([`${MONEY_PATH}:1-2`])}The fee is read at #file:${MONEY_PATH}:2.\n`)(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [outOfRange(`${MAP}:12`, 1), outOfRange(`${MAP}:10-12`, 1), outOfRange(`${MAP}:4\u20136`, 1)]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a range on a path the working copy has not is reported once, as a path it has not', async () => {
  const host = scripted({}, (it) => [
    researcher(citing(['src/Pricing/Discount.cs:120-160']))(it),
    researcher(citing([]))(it),
    ...nominal(it).slice(1),
  ])

  await host.start()

  assert.deepEqual(recorded(host)[0][3], [noFile('src/Pricing/Discount.cs')])
})

test('a #file: citation written with back slashes names the same file, and each cited file is read by its own path', async () => {
  const host = scripted({}, (it) => [
    researcher(citing(['src\\Pricing\\Discount.cs', 'docs\\architecture\\context-map.md:1-9']))(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [noFile('src/Pricing/Discount.cs'), outOfRange(`${MAP}:1-9`, 1)]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a backup an editor left beside the research document is no research document', async () => {
  const host = scripted({}, (it) => [
    researcher(citing([MAP]), { [`${RESEARCH}.bak`]: citing(['src/Pricing/Discount.cs']) })(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done')
})

test('a research document is checked when the researcher finishes, so a file it cited may be gone by a later step', async () => {
  const host = scripted({ files: MONEY }, (it) => [
    researcher(citing([MAP, MONEY_PATH]))(it),
    agent({
      work: ({ git, workspace }) => {
        git.change('docs/adr/adr-001-card-payment.md')
        workspace.files.delete(MONEY_PATH)
      },
    })(it),
    ...nominal(it).slice(2),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done')
})

test('a #file: citation outside the working copy is read nowhere and reported as no file of it: an absolute path, a .. segment, the tracking folder', async () => {
  const outside = {
    '/etc/hosts': 'localhost\n',
    'C:/Windows/win.ini': '[fonts]\n',
    '../secrets/token.txt': 'secret\n',
    'src/Pricing/Fee.cs': 'public record Fee;\n',
    'src/Pricing': 'a folder read as a file\n',
    '.copilot-tracking/skraft-plans/checkout/notes.md': 'notes\n',
  }
  const host = scripted({ files: outside }, (it) => [
    researcher(citing(['/etc/hosts:1', 'C:\\Windows\\win.ini', '../secrets/token.txt', 'docs/../src/Pricing/Fee.cs:1', 'src/Pricing/Fee/...', '.copilot-tracking/skraft-plans/checkout/notes.md', 'src/Pricing/Fee.cs:1']))(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      noFile('/etc/hosts'),
      noFile('C:/Windows/win.ini'),
      noFile('../secrets/token.txt'),
      noFile('docs/../src/Pricing/Fee.cs'),
      noFile('src/Pricing/Fee/..'),
      noFile('.copilot-tracking/skraft-plans/checkout/notes.md'),
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('text without #file: is never a citation: a code name, a shortened path, an absent instruction file or a range in prose leaves the researcher alone', async () => {
  const host = scripted({ files: { 'package.json': '{}', 'web/tests/setup.ts': 'export {}\n' } }, (it) => [
    researcher([
      '# Research: the card payment',
      '',
      'The domain uses no `System.IO`, `java.util` or `process.env`; `using System.Text.Json;` and `import fs from \'node:fs\'` stay out of it.',
      'The test setup sits in tests/setup.ts, the build in package.json:9, the fee in src/Pricing/Missing.cs:12-40.',
      'The repository holds no .github/copilot-instructions.md, and docs/architecture/context-map.md:7 names no context.',
      '',
    ].join('\n'))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done')
})

test('a range whose first line is past the end of its file sends the researcher back even when its last line is in range', async () => {
  const host = scripted({}, (it) => [
    researcher(citing([`${MAP}:2-1`]))(it),
    researcher(citing([`${MAP}:1`]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [outOfRange(`${MAP}:2-1`, 1)]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a range starting at line zero sends the researcher back as an invalid line range', async () => {
  const host = scripted({ files: MONEY }, (it) => [
    researcher(citing([`${MONEY_PATH}:0-1`]))(it),
    researcher(citing([`${MONEY_PATH}:1-2`]))(it),
    ...nominal(it).slice(1),
  ])

  await host.start()

  assert.deepEqual(recorded(host)[0], [
    1,
    'failed',
    'research-records',
    [outOfRange(`${MONEY_PATH}:0-1`, 2)],
  ])
})
