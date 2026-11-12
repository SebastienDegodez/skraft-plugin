import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agent, API, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const RESEARCH = 'research/2026-10-11/checkout-research.md'
const TEMPLATE = readFileSync(new URL('../../../../plugins/skraft-framework/assets/templates/research.template.md', import.meta.url), 'utf8')
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

const completeResearch = () => TEMPLATE.replace(/\{\{[^{}]*\}\}/g, 'filled')
  .replace('(Source: filled)', '(Source: https://example.com/research)')
  .replace('### filled (recommended)', '### Option A (recommended)')
  .replace('### filled (rejected)', '### Option B (rejected)')
  .replace('| filled | filled | filled |', '| | | |')
  .replace('structural patterns DESIGN reuses: filled -> filled', 'structural patterns DESIGN reuses:')

/** What the run recorded of each RESEARCH attempt. */
const recorded = (host) => host.events()
  .filter((event) => event.type === 'step.recorded' && event.step === 'research')
  .map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures])

const noFile = (path) => `${RESEARCH} cites #file:${path}, which is no file of the working copy (#517)`
/** A citation written from a component root: the paths that component holds it at, from the workspace root. @param {string} cite @param {string} full */
const fromRoot = (cite, full) => `${noFile(cite).replace(' (#517)', '')}: write it from the workspace root, ${full} (#517)`
const outOfRange = (cite, lines) => `${RESEARCH} cites #file:${cite}, outside the 1-${lines} line range (#517)`

test('a #file: citation of a path the working copy has not sends the researcher back, wherever the citation sits and however often it cites it, and the run goes on once every cited file exists', async () => {
  const host = scripted({}, (it) => [
    researcher('#file:src/Pricing/Discount.cs holds the fee, read in `#file:src/Pricing/Fee.cs` and again in #file:src/Pricing/Fee.cs, each with the tax (#file:src/Pricing/Tax.cs) of #file:src/Pricing/Vat.cs. #file:card-payment.test.mjs covers payment.\n')(it),
    researcher(citing(['src/Pricing/Receipt.cs']))(it),
    researcher(citing([MAP]))(it),
    ...nominal(it).slice(1),
  ])

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [noFile('src/Pricing/Discount.cs'), noFile('src/Pricing/Fee.cs'), noFile('src/Pricing/Tax.cs'), noFile('src/Pricing/Vat.cs'), noFile('card-payment.test.mjs')]],
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

test('a #file: citation written from a component root sends the researcher back with its path from the workspace root, every component inside the working copy that holds it named', async () => {
  const web = { ...API, name: 'web', root: 'web', stack: 'react', commands: { test: 'npm test' } }
  const admin = { ...web, name: 'admin', root: 'admin' }
  const shop = { ...web, name: 'shop', root: '../shop' }
  const host = scripted({
    components: [API, web, admin, shop],
    files: {
      'web/src/palette/Palette.tsx': 'export const Palette = () => null\n',
      'web/docs/notes.md': '# Web\n',
      'admin/docs/notes.md': '# Admin\n',
      '../shop/docs/shop.md': '# Shop\n',
    },
  }, (it) => [
    researcher('#file:src/palette/Palette.tsx:1 draws it, #file:docs/notes.md and #file:docs/shop.md say why, #file:palette/Palette.tsx and #file:src/Pricing/Absent.cs do not exist.\n')(it),
    researcher('#file:web/src/palette/Palette.tsx:1 draws it, #file:web/docs/notes.md says why.\n')(it),
    ...nominal(it).slice(1),
  ])

  await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      fromRoot('src/palette/Palette.tsx', '#file:web/src/palette/Palette.tsx'),
      fromRoot('docs/notes.md', '#file:web/docs/notes.md or #file:admin/docs/notes.md'),
      noFile('docs/shop.md'),
      noFile('palette/Palette.tsx'),
      noFile('src/Pricing/Absent.cs'),
    ]],
    [2, 'done', null, []],
  ])
})

test('a research document missing a section from its template sends the researcher back, and a complete document opens DESIGN', async () => {
  const missing = 'Scope and success criteria'
  const complete = completeResearch()
  const host = scripted({}, (it) => [
    researcher(complete.replace(`## ${missing}\n`, ''))(it),
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [`${RESEARCH} is missing section "${missing}" (#517)`]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a malformed external research URL sends the researcher back, and a valid HTTPS URL opens DESIGN', async () => {
  const complete = completeResearch()
  const invalid = complete.replace('https://example.com/research', 'not-a-url')
  const host = scripted({}, (it) => [
    researcher(invalid)(it),
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [`${RESEARCH} cites invalid source URL "not-a-url" (#517)`]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('an external research URL containing whitespace sends the researcher back', async () => {
  const complete = completeResearch()
  const invalid = complete.replace('https://example.com/research', 'https://example.com/research notes')
  const host = scripted({}, (it) => [
    researcher(invalid)(it),
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      `${RESEARCH} cites invalid source URL "https://example.com/research notes" (#517)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('external research sources are checked independently across lines', async () => {
  const complete = completeResearch()
  const invalid = complete.replace(
    '(Source: https://example.com/research)',
    '(Source: https://example.com/research notes\n- Another source (Source: https://example.org/research)',
  )
  const host = scripted({}, (it) => [
    researcher(invalid)(it),
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      `${RESEARCH} cites invalid source URL "https://example.com/research notes" (#517)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('evaluated approaches require exactly one recommended option and at least one rejected option', async () => {
  const complete = completeResearch()
  const duplicate = complete.replace('### Option B (rejected)', '### Option B (recommended)')
  const noRecommended = complete.replace('### Option A (recommended)', '### Option A')
  const host = scripted({}, (it) => [
    researcher(duplicate)(it),
    researcher(noRecommended)(it),
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      `${RESEARCH} must have exactly one recommended approach under "Evaluated approaches" (found 2) (#517)`,
      `${RESEARCH} must have at least one rejected approach under "Evaluated approaches" (#517)`,
    ]],
    [2, 'failed', 'research-records', [
      `${RESEARCH} must have exactly one recommended approach under "Evaluated approaches" (found 0) (#517)`,
    ]],
    [3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('an Existing tests row must name a test in its existing file', async () => {
  const testFile = 'tests/checkout/card-payment.test.mjs'
  const complete = completeResearch()
    .replace('| | | |', `| #file:${testFile} | records card payment | card payment |`)
  const missingFile = complete.replace(`#file:${testFile}`, '#file:card-payment.test.mjs')
  const missingTest = complete.replace('records card payment', 'captures card payment')
  const host = scripted({ files: { [testFile]: "test('records card payment', () => {})" } }, (it) => [
    researcher(missingFile)(it),
    researcher(missingTest)(it),
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [noFile('card-payment.test.mjs')]],
    [2, 'failed', 'research-records', [
      `${RESEARCH} cannot find test "captures card payment" in ${testFile} (#517)`,
    ]],
    [3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('an Existing tests name wrapped in backticks is found in its cited file', async () => {
  const testFile = 'tests/checkout/card-payment.test.mjs'
  const complete = completeResearch()
    .replace('| | | |', `| #file:${testFile} | \`records card payment\` | card payment |`)
  const host = scripted({ files: { [testFile]: "test('records card payment', () => {})" } }, (it) => [
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done')
})

test('a Handoff to DESIGN pair must name a symbol in its existing file', async () => {
  const sourceFile = 'src/Payments/PaymentService.mjs'
  const complete = completeResearch()
  const handoff = '- Existing aggregates, use cases, interfaces and structural patterns DESIGN reuses:'
  const missingSymbol = complete.replace(`${handoff}\n`, `${handoff} PaymentAuthorization -> #file:${sourceFile}\n`)
  const existingSymbol = complete.replace(`${handoff}\n`, `${handoff} authorizePayment -> #file:${sourceFile}\n`)
  const host = scripted({ files: { [sourceFile]: 'export function authorizePayment() {}' } }, (it) => [
    researcher(missingSymbol)(it),
    researcher(existingSymbol)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      `${RESEARCH} cannot find "PaymentAuthorization" in ${sourceFile} (#517)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('Handoff accepts bulleted rows, inline names, and multiple names for one cited file', async () => {
  const sourceFile = 'src/Payments/PaymentService.mjs'
  const complete = completeResearch()
  const handoff = '- Existing aggregates, use cases, interfaces and structural patterns DESIGN reuses:\n'
  const rows = [
    '- authorizePayment -> #file:' + sourceFile,
    '- `capturePayment` -> #file:' + sourceFile,
    '- authorizePayment, capturePayment -> #file:' + sourceFile,
  ].join('\n')
  const output = complete.replace(handoff, `${handoff}${rows}\n`)
  const host = scripted({ files: { [sourceFile]: 'export function authorizePayment() {} export function capturePayment() {}' } }, (it) => [
    researcher(output)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done')
})

test('every Handoff name is checked against its cited file', async () => {
  const sourceFile = 'src/Payments/PaymentService.mjs'
  const complete = completeResearch()
  const handoff = '- Existing aggregates, use cases, interfaces and structural patterns DESIGN reuses:\n'
  const invalid = complete.replace(
    handoff,
    `${handoff}- authorizePayment, missingPayment -> #file:${sourceFile}\n`,
  )
  const host = scripted({ files: { [sourceFile]: 'export function authorizePayment() {}' } }, (it) => [
    researcher(invalid)(it),
    researcher(complete)(it),
    ...nominal(it).slice(1),
  ])
  host.deps.templates.templates['research.template.md'] = TEMPLATE

  const outcome = await host.start()

  assert.deepEqual(recorded(host), [
    [1, 'failed', 'research-records', [
      `${RESEARCH} cannot find "missingPayment" in ${sourceFile} (#517)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})
