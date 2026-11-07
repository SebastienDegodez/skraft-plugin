import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

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

/** A research document that cites `paths`, one per line under File analysis. @param {string[]} paths */
const citing = (paths) => [
  '# Research: the card payment',
  '',
  '## Research executed',
  '### File analysis',
  ...paths.map((path) => `- ${path}`),
  '',
].join('\n')

/** What the run recorded of each RESEARCH attempt. */
const recorded = (host) => host.events()
  .filter((event) => event.type === 'step.recorded' && event.step === 'research')
  .map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures])

const noFile = (cite) => `${RESEARCH} cites ${cite}, which is no file of the working copy (#517)`
/** A component-relative citation: its workspace paths, or a plain missing file when no component holds it. @param {string} cite @param {string | null} full */
const fromRoot = (cite, full) => (full === null ? noFile(cite) : `${noFile(cite).replace(' (#517)', '')}: write it from the workspace root, ${full} (#517)`)
const outOfRange = (cite, lines) => `${RESEARCH} cites ${cite}, outside the 1-${lines} line range (#517)`

test('a research document that cites a path the working copy has not sends the researcher back, wherever the citation sits and however often it cites it, and the run goes on once every path exists', async () => {
  const host = scripted({}, (it) => [
    researcher('src/Pricing/Discount.cs holds the fee, read in src/Pricing/Fee.cs and again in src/Pricing/Fee.cs, each with the tax of src/Pricing/Tax.cs.\n')(it),
    researcher(citing(['src/Pricing/Receipt.cs']))(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [noFile('src/Pricing/Discount.cs'), noFile('src/Pricing/Fee.cs'), noFile('src/Pricing/Tax.cs')]],
    [2, 'failed', 'research-records', [noFile('src/Pricing/Receipt.cs')]],
    [3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a line range cited past the end of its file sends the researcher back, and a range that ends on the last line of a file holds', async () => {
  const host = scripted({ files: MONEY }, (it) => [
    researcher(`${MAP}:12 names the bounded contexts, ${MAP}:10-12 the events it publishes, and ${MAP}:4\u20136 the policies that rule them.\n`)(it),
    researcher(citing([`${MONEY_PATH}:1-2`]))(it),
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

test('the engine reads the citations a working copy can hold, and leaves a folder, a relative path and its own tracking folder alone', async () => {
  const host = scripted({}, (it) => [
    researcher(citing([
      '.copilot-tracking/skraft-plans/checkout/research/2026-10-11/notes.md',
      './src/Pricing/Discount.cs:1-9',
      'docs/../src/Pricing/Discount.cs',
      '.github/workflows',
      'src/Pricing/Receipt.mjs',
    ]))(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [noFile('src/Pricing/Receipt.mjs')]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a citation written with back slashes names the same file, and each cited file is read by its own path', async () => {
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

test('a citation of an existing folder ending in a slash does not send the researcher back as a missing file', async () => {
  const host = scripted({ files: { 'tests/Checkout.Tests/Checkout.Tests.csproj': '<Project />' } }, (it) => [
    researcher(citing(['tests/Checkout.Tests/']))(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  await host.start()

  assert.deepEqual(recorded(host)[0], [1, 'done', null, []])
})

test('only a path with a folder is a citation: a bare name, a file or code alike, is never checked, and an absent path with a folder sends the researcher back', async () => {
  const host = scripted({ files: { 'package.json': '{}' } }, (it) => [
    researcher(`${citing(['package.json:9', 'missing.json:1', 'MissingFile', 'src/Pricing/Missing.cs'])}The domain uses no \`System.IO\`, \`java.util\` or \`process.env\`; Node.js and ASP.NET run it, and Program.cs boots it.\n`)(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [noFile('src/Pricing/Missing.cs')]],
    [2, 'done', null, []],
  ])
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

test('a path written from its component root sends the researcher back with the path from the workspace root, every component that holds it named', async () => {
  const web = { ...API, name: 'web', root: 'web', stack: 'react', commands: { test: 'npm test' } }
  const admin = { ...web, name: 'admin', root: '../admin' }
  const host = scripted({
    components: [API, web, admin],
    files: {
      'web/src/palette/Palette.tsx': 'export const Palette = () => null\n',
      'web/docs/notes.md': '# Web\n',
      '../admin/docs/notes.md': '# Admin\n',
    },
  }, (it) => [
    researcher(citing(['palette/Palette.tsx:1', 'docs/notes.md', 'src/Pricing/Absent.cs']))(it),
    researcher(citing(['web/src/palette/Palette.tsx:1', 'web/docs/notes.md']))(it),
    ...nominal(it).slice(1),
  ])

  await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      fromRoot('palette/Palette.tsx', null),
      fromRoot('docs/notes.md', 'web/docs/notes.md or ../admin/docs/notes.md'),
      noFile('src/Pricing/Absent.cs'),
    ]],
    [2, 'done', null, []],
  ])
})
