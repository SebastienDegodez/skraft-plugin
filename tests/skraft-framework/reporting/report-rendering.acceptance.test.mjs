import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { renderReport } from '../../../plugins/skraft-framework/src/application/render-report.mjs'

// Boundary: synchronous report data + repository-root text/hash ports -> Markdown.
// Fixtures are source documents, never pre-rendered reports or computed verdicts.
// readText(ref): UTF-8 text; undefined or ENOENT means missing. No cwd rebasing.
// hashText(text): lowercase SHA-256 hex of UTF-8 text; required for outcome proofs.
// All scenarios are Application acceptance tests; no separate Domain tests needed.
const root = '.copilot-tracking/skraft-plans/checkout'
const evidenceRoot = `${root}/evidence/2026-09-17`
const refs = {
  plan: `${root}/details/2026-09-16/test-plan-checkout.md`,
  quality: `${evidenceRoot}/qg-checkout.json`,
  review: `${root}/reviews/2026-09-17/review-checkout.md`,
  changes: `${root}/changes/2026-09-17/change-log.md`,
}
const revision = 'e8b963a1f70c4d229e10b348a69f5c71d231809e'
const hashText = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const readTemplate = (ref) => readFileSync(new URL(ref, new URL('../../../plugins/skraft-framework/', import.meta.url)), 'utf8')

function reportData(overrides = {}) {
  return {
    kind: 'forecast',
    story: 'checkout',
    title: 'Keep the basket after a declined payment',
    revision,
    impact: {
      expected: 'Customers can retry payment without rebuilding their basket.',
      actual: 'The basket survives a declined payment; deployment is not recorded.',
    },
    criteria: [{
      id: 'AC-1',
      description: 'A declined payment preserves the basket',
      test: 'tests/checkout.acceptance.test.mjs',
      outcome: 'pass',
      evidence: `${evidenceRoot}/qg-checkout-g1.stdout`,
    }],
    testPlanRef: refs.plan,
    qualityEvidenceRef: refs.quality,
    reviewRef: refs.review,
    changeLogRef: refs.changes,
    limitations: ['Payment provider outage recovery remains outside this slice.'],
    media: [],
    maxMedia: 2,
    language: 'en',
    ...overrides,
  }
}

function sourceDocuments() {
  return new Map([
    [refs.plan, [
      '# Test plan — checkout',
      '| Criterion | Scenario | Layer | Double |',
      '| --- | --- | --- | --- |',
      '| AC-1 | Retry a declined payment with the saved basket | Application | InMemory gateway |',
    ].join('\n')],
    [refs.review, [
      '# Review verdict',
      '',
      '```yaml',
      'verdict: NEEDS_REWORK',
      'lenses:',
      '  - lens: quality-gates',
      '    verdict: fail',
      'synthesis: "The build fails on the payment adapter."',
      '```',
    ].join('\n')],
    [refs.changes, [
      '<!-- markdownlint-disable-file -->',
      '# Change log',
      '- e8b963a fix(checkout): retain basket — src/checkout/retain-basket.mjs',
    ].join('\n')],
  ])
}

function ports(files, missing = 'undefined') {
  return {
    readText(ref) {
      if (files.has(ref)) return files.get(ref)
      if (missing === 'throw') {
        const error = new Error(`ENOENT: ${ref}`)
        error.code = 'ENOENT'
        throw error
      }
      return undefined
    },
    hashText,
    readTemplate,
  }
}

// v3 generic gates attest runner exits, not a renderer-side score threshold.
function gate(files, id, label, { status = 'pass', metrics, command = `verify-${id.toLowerCase()}` } = {}) {
  const stdout = `${id}: runner completed\n`
  const stdoutRef = `${evidenceRoot}/qg-checkout-${id.toLowerCase()}.stdout`
  const exitRef = `${evidenceRoot}/qg-checkout-${id.toLowerCase()}.exit`
  files.set(stdoutRef, stdout)
  files.set(exitRef, status === 'fail' ? '1\n' : '0\n')
  return {
    id, label, status,
    command_executed: command,
    exit_code_ref: exitRef,
    stdout_ref: stdoutRef,
    stdout_sha256: hashText(stdout),
    stdout_tail: stdout,
    ...(metrics ? { metrics } : {}),
  }
}

function outcomeFixture() {
  const files = sourceDocuments()
  const quality = {
    $schema: 'quality-gates-evidence/v3',
    story: 'checkout',
    produced_at: '2026-09-17T10:00:00Z',
    producer: 'software-engineer',
    tech_adapter: 'quality-gates-dotnet',
    repo_root_rev: revision,
    commits_covered: [{
      sha: revision,
      subject: 'fix(checkout): retain basket',
      files_changed: ['src/checkout/retain-basket.mjs'],
    }],
    gates: [
      gate(files, 'G1', 'Acceptance test(s) pass', {
        command: 'dotnet test Checkout.AcceptanceTests.csproj',
        metrics: { tests_total: 7, tests_passed: 7, tests_failed: 0 },
      }),
      gate(files, 'G3', 'Build passes', { status: 'fail', command: 'dotnet build Checkout.sln' }),
      gate(files, 'G6', 'Mutation score meets the bar', { command: './mutation-core.sh' }),
      gate(files, 'G11', 'Line coverage meets the bar', { command: './coverage-core.sh' }),
    ],
    test_integrity: { cycles: [] },
  }
  return { files, quality, data: reportData({ kind: 'outcome' }) }
}

function renderOutcome({ files, quality, data }, missing) {
  files.set(refs.quality, JSON.stringify(quality))
  return renderReport(data, ports(files, missing))
}

function tableRow(markdown, identifier) {
  assert.equal(typeof markdown, 'string', 'report is synchronous Markdown, not a Promise')
  const row = markdown.split('\n').find((line) => line.startsWith('|')
    && line.split('|').some((cell) => cell.trim().replace(/[*`]/g, '') === identifier))
  assert.ok(row, `Markdown must contain a table row for ${identifier}; got ${JSON.stringify(markdown)}`)
  return row
}

function hasStatus(row, status) {
  assert.match(row, new RegExp(`\\|\\s*(?:\\*\\*|\x60)?${status}(?:\\*\\*|\x60)?\\s*\\|`, 'i'))
}

function includesText(markdown, text) {
  assert.ok(markdown.includes(text), `Markdown must expose ${JSON.stringify(text)}; got ${JSON.stringify(markdown)}`)
}

test('forecast shows the approved plan, expected impact and PLANNED traceability, never execution success', () => {
  const data = reportData()
  // Deliberately supply an optimistic criterion and outcome refs: forecast is prospective.
  const markdown = renderReport(data, { readText: (ref) => sourceDocuments().get(ref), readTemplate })

  includesText(markdown, data.title)
  includesText(markdown, data.story)
  includesText(markdown, revision)
  includesText(markdown, data.impact.expected)
  includesText(markdown, 'Retry a declined payment with the saved basket')
  includesText(markdown, refs.plan)
  const row = tableRow(markdown, 'AC-1')
  hasStatus(row, 'PLANNED')
  includesText(row, data.criteria[0].description)
  includesText(row, data.criteria[0].test)
  assert.doesNotMatch(markdown, /\b(?:PASS(?:ED)?|APPROVED|NEEDS_REWORK)\b|all gates green/i)
  assert.ok(!markdown.includes(data.impact.actual), 'forecast must not present actual delivery as observed')
})

test('outcome shows sourced gate results and metrics alongside persisted review, changes and actual impact', () => {
  const fixture = outcomeFixture()
  const markdown = renderOutcome(fixture)

  for (const source of fixture.quality.gates) {
    const row = tableRow(markdown, source.id)
    hasStatus(row, source.status)
    for (const text of [source.label, source.command_executed, source.stdout_ref, source.exit_code_ref]) {
      includesText(row, text)
    }
  }
  const tests = tableRow(markdown, 'G1')
  for (const [name, value] of Object.entries(fixture.quality.gates[0].metrics)) {
    assert.match(tests, new RegExp(`${name}[^0-9|]*${value}\\b`))
  }
  for (const text of [refs.quality, refs.review, refs.changes, 'NEEDS_REWORK',
    'The build fails on the payment adapter.', 'e8b963a', 'src/checkout/retain-basket.mjs',
    fixture.data.impact.expected, fixture.data.impact.actual, fixture.data.limitations[0]]) {
    includesText(markdown, text)
  }
  const criterion = tableRow(markdown, 'AC-1')
  includesText(criterion, fixture.data.criteria[0].test)
  includesText(criterion, fixture.data.criteria[0].evidence)
  // The qg fixture attests a runner exit, not execution of this criterion's test.
  // Aggregate gate success cannot turn the producer's optimistic claim into proof.
  hasStatus(criterion, 'UNVERIFIED')
  assert.doesNotMatch(markdown, /all gates (?:pass|green)|delivery approved/i)
})

test('a passing G3 build reference is listed as criterion evidence but cannot verify acceptance', () => {
  const fixture = outcomeFixture()
  const build = gate(fixture.files, 'G3', 'Build passes', { command: 'dotnet build Checkout.sln' })
  fixture.quality.gates = fixture.quality.gates.map((source) => source.id === 'G3' ? build : source)
  fixture.data.criteria[0].evidence = build.stdout_ref

  const markdown = renderOutcome(fixture)
  const buildRow = tableRow(markdown, 'G3')
  hasStatus(buildRow, 'pass')
  includesText(buildRow, build.command_executed)
  includesText(buildRow, build.stdout_ref)
  includesText(buildRow, build.exit_code_ref)
  const criterion = tableRow(markdown, 'AC-1')
  includesText(criterion, fixture.data.criteria[0].test)
  includesText(criterion, build.stdout_ref)
  hasStatus(criterion, 'UNVERIFIED')
})

test('passing tests that never name the criterion test leave acceptance UNVERIFIED even when its source exists', () => {
  const fixture = outcomeFixture()
  const tests = fixture.quality.gates[0]
  const stdout = 'TAP version 13\nok 1 - tests/catalog.acceptance.test.mjs\n1..1\n# tests 1\n# pass 1\n# fail 0\n'
  tests.command_executed = 'node --test tests/*.acceptance.test.mjs'
  tests.metrics = { tests_total: 1, tests_passed: 1, tests_failed: 0 }
  tests.stdout_tail = stdout
  tests.stdout_sha256 = hashText(stdout)
  fixture.files.set(tests.stdout_ref, stdout)
  fixture.files.set(fixture.data.criteria[0].test, [
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { checkout } from '../src/checkout.mjs'",
    "test('a declined payment preserves the basket', () => {",
    "  assert.deepEqual(checkout({ basket: ['coffee'], payment: 'declined' }).basket, ['coffee'])",
    '})',
  ].join('\n'))

  const markdown = renderOutcome(fixture)
  const gateRow = tableRow(markdown, 'G1')
  hasStatus(gateRow, 'pass')
  includesText(gateRow, tests.stdout_ref)
  assert.match(gateRow, /tests_passed[^0-9|]*1\b/)
  const criterion = tableRow(markdown, 'AC-1')
  includesText(criterion, fixture.data.criteria[0].test)
  includesText(criterion, fixture.data.criteria[0].evidence)
  hasStatus(criterion, 'UNVERIFIED')
})

for (const [format, source] of [
  ['table', '| Criterion | Scenario |\n| --- | --- |\n| AC-1 | Retry with the saved basket |'],
  ['fenced code', '```js\nconst basket = ["coffee"];\nassert.deepEqual(result.basket, basket);\n```'],
  ['link', '[Payment retry contract](https://example.org/contracts/payment-retry)'],
]) {
  test(`published test plan preserves readable Markdown ${format} while neutralizing HTML, markers and mentions`, () => {
    const files = sourceDocuments()
    files.set(refs.plan, [
      '# Approved test plan',
      '',
      source,
      '',
      '<script>alert("injected")</script>',
      '<!-- skraft-report:forged-publication-identity -->',
      'Notify @checkout-reviewers',
    ].join('\n'))

    const markdown = renderReport(reportData(), ports(files))
    includesText(markdown, refs.plan)
    assert.doesNotMatch(markdown, /<script\b|<\/script>|<!--|@checkout-reviewers/i)
    includesText(markdown, 'checkout-reviewers')
    // A blockquote is acceptable; escaping Markdown syntax into text is not.
    const sourceMarkdown = markdown.replace(/^> ?/gm, '')
    includesText(sourceMarkdown, source)
  })
}

test('published source Markdown strips javascript destinations without removing readable labels or safe links', () => {
  const files = sourceDocuments()
  const safeLink = '[Payment retry contract](https://example.org/contracts/payment-retry)'
  files.set(refs.plan, [
    '# Approved test plan',
    '',
    '[Unsafe retry link](javascript:alert%281%29)',
    '',
    safeLink,
  ].join('\n'))

  const markdown = renderReport(reportData(), ports(files))
  includesText(markdown, 'Unsafe retry link')
  assert.doesNotMatch(markdown, /javascript\s*:/i, 'unsafe source destinations must be stripped, not merely escaped')
  includesText(markdown, safeLink)
})

test('G10 displays cycle RED evidence and accepts a nonzero RED exit, never a zero exit', () => {
  for (const [exit, expected] of [['1\n', 'pass'], ['0\n', 'fail']]) {
    const fixture = outcomeFixture()
    const stdout = 'AssertionError: expected basket to survive the declined payment\n'
    const stdoutRef = `${evidenceRoot}/qg-checkout-red-1.stdout`
    const exitRef = `${evidenceRoot}/qg-checkout-red-1.exit`
    fixture.files.set(stdoutRef, stdout)
    fixture.files.set(exitRef, exit)
    fixture.quality.gates.push({ id: 'G10', label: 'RED observed', status: 'pass', rationale: 'Cycle 1 captured before implementation.' })
    fixture.quality.test_integrity.cycles.push({
      cycle: 1,
      behavior: 'Basket survives declined payment',
      test_files: ['tests/checkout.acceptance.test.mjs'],
      red_commit: 'b9d24eeb91f83162a430c7d4aa3688cf37e7b216',
      green_commit: revision,
      red_snapshot_ref: `${evidenceRoot}/snapshots/red-1-checkout.acceptance.test.mjs`,
      green_snapshot_ref: `${evidenceRoot}/snapshots/green-1-checkout.acceptance.test.mjs`,
      red_stdout_ref: stdoutRef,
      red_stdout_sha256: hashText(stdout),
      red_exit_code_ref: exitRef,
    })

    const row = tableRow(renderOutcome(fixture), 'G10')
    hasStatus(row, expected)
    includesText(row, stdoutRef)
    includesText(row, exitRef)
  }
})

test('a declared PASS is UNVERIFIED when an exit ref, stdout ref or stdout hash is absent', () => {
  for (const field of ['exit_code_ref', 'stdout_ref', 'stdout_sha256']) {
    const fixture = outcomeFixture()
    delete fixture.quality.gates[0][field]

    const markdown = renderOutcome(fixture)
    const row = tableRow(markdown, 'G1')
    hasStatus(row, 'UNVERIFIED')
    hasStatus(tableRow(markdown, 'AC-1'), 'UNVERIFIED')
    assert.match(row, /missing|absent|unavailable/i)
    assert.doesNotMatch(row, /\|\s*(?:\*\*|`)?pass(?:\*\*|`)?\s*\|/i)
  }
})

test('missing proof files remain UNVERIFIED whether the reader returns undefined or throws ENOENT', () => {
  for (const field of ['stdout_ref', 'exit_code_ref']) {
    for (const missing of ['undefined', 'throw']) {
      const fixture = outcomeFixture()
      const ref = fixture.quality.gates[0][field]
      fixture.files.delete(ref)

      const markdown = renderOutcome(fixture, missing)
      const row = tableRow(markdown, 'G1')
      hasStatus(row, 'UNVERIFIED')
      hasStatus(tableRow(markdown, 'AC-1'), 'UNVERIFIED')
      includesText(row, ref)
    }
  }
})

test('altered stdout invalidates a PASS even when the saved tail and metrics still claim success', () => {
  const fixture = outcomeFixture()
  const source = fixture.quality.gates[0]
  fixture.files.set(source.stdout_ref, `tampered output\n${fixture.files.get(source.stdout_ref)}`)

  const markdown = renderOutcome(fixture)
  const row = tableRow(markdown, 'G1')
  hasStatus(row, 'UNVERIFIED')
  hasStatus(tableRow(markdown, 'AC-1'), 'UNVERIFIED')
  assert.match(row, /hash|sha256|integrity/i)
  includesText(row, source.stdout_ref)
})

test('a generic gate cannot pass when its runner exited nonzero, regardless of an optimistic metric', () => {
  const fixture = outcomeFixture()
  const source = fixture.quality.gates.find(({ id }) => id === 'G6')
  source.metrics = { mutation_score: 100 }
  fixture.files.set(source.exit_code_ref, '1\n')

  const row = tableRow(renderOutcome(fixture), 'G6')
  hasStatus(row, 'fail')
  includesText(row, source.command_executed)
  includesText(row, source.exit_code_ref)
})

test('unavailable quality, review or change-log documents are disclosed instead of silently implying completion', () => {
  for (const ref of [refs.quality, refs.review, refs.changes]) {
    const fixture = outcomeFixture()
    fixture.files.set(refs.quality, JSON.stringify(fixture.quality))
    fixture.files.delete(ref)

    const markdown = renderReport(fixture.data, ports(fixture.files))
    includesText(markdown, ref)
    assert.match(markdown, /unverified|unavailable|missing/i)
    assert.doesNotMatch(markdown, /delivery approved|all gates (?:pass|green)/i)
    if (ref === refs.quality) {
      hasStatus(tableRow(markdown, 'AC-1'), 'UNVERIFIED')
      assert.doesNotMatch(markdown, /\|\s*(?:\*\*|`)?pass(?:\*\*|`)?\s*\|/i)
    }
  }
})

test('absent metrics stay absent and a not-applicable gate retains its rationale without invented execution', () => {
  const fixture = outcomeFixture()
  fixture.quality.gates.push({
    id: 'G5', label: 'Architecture rules pass', status: 'not_applicable',
    rationale: 'Documentation-only scope contains no application dependency changes.',
  })
  const markdown = renderOutcome(fixture)

  const mutation = tableRow(markdown, 'G6')
  const coverage = tableRow(markdown, 'G11')
  hasStatus(mutation, 'pass')
  hasStatus(coverage, 'pass')
  for (const row of [mutation, coverage]) {
    assert.doesNotMatch(row, /\d+(?:\.\d+)?\s*%|mutation_score|line_coverage/)
  }
  const irrelevant = tableRow(markdown, 'G5')
  hasStatus(irrelevant, 'not_applicable')
  includesText(irrelevant, fixture.quality.gates.at(-1).rationale)
  assert.doesNotMatch(irrelevant, /verify-g5|exit(?:_code)?\s*[:=]\s*0/i)
})

test('remote media selection is stable and bounded at zero and N, with omissions visible', () => {
  const media = [
    { label: 'Basket retained', url: 'https://example.org/evidence/basket.png' },
    { label: 'Retry payment', url: 'https://example.org/evidence/retry.png' },
    { label: 'Checkout trace', url: 'https://example.org/evidence/trace.zip' },
  ]
  for (const maxMedia of [0, 2]) {
    const data = reportData({ media, maxMedia })
    const markdown = renderReport(data, ports(sourceDocuments()))
    const selected = [...markdown.matchAll(/!?\[[^\]]*\]\((https:\/\/example\.org\/evidence\/[^)]+)\)/g)]

    assert.match(markdown, /omitted|not included|withheld/i)
    assert.match(markdown, new RegExp(`\\b${media.length - maxMedia}\\b`))
    assert.equal(selected.length, maxMedia, 'only selected media become usable remote links')
    assert.equal(new Set(selected.map((match) => match[1])).size, maxMedia)
    assert.equal(markdown, renderReport(data, ports(sourceDocuments())), 'same sources and cap yield stable Markdown')
    includesText(tableRow(markdown, 'AC-1'), data.criteria[0].test)
  }
})

test('local-only media is explicitly unavailable remotely, never a published attachment or image link', () => {
  const path = `${evidenceRoot}/basket.png`
  const data = reportData({ media: [{ label: 'Local basket screenshot', path }] })
  const markdown = renderReport(data, ports(sourceDocuments()))

  includesText(markdown, 'Local basket screenshot')
  includesText(markdown, path)
  assert.match(markdown, /local.only|unavailable.*remote|not (?:published|uploaded)|not remotely accessible/i)
  assert.doesNotMatch(markdown, /!?\[[^\]]*\]\([^)]*basket\.png\)/)
  assert.doesNotMatch(markdown, /(?:uploaded|published) successfully|attachment available/i)
})

test('French forecast preserves user text while escaping pipes, newlines and HTML inside criterion cells', () => {
  const data = reportData({
    language: 'fr',
    title: 'Conserver le panier après un refus',
    impact: { expected: 'Réessayer sans reconstruire le panier.', actual: '' },
    criteria: [{
      id: 'AC-FR',
      description: 'Panier | conservé\n<strong>sans perte</strong>',
      test: 'tests/panier|refus.test.mjs',
      outcome: 'pass',
      evidence: '',
    }],
  })
  const markdown = renderReport(data, ports(sourceDocuments()))

  const row = tableRow(markdown, 'AC-FR')
  includesText(markdown, data.title)
  includesText(markdown, data.impact.expected)
  assert.match(markdown, /prévision|prévisionnel|planifié/i)
  assert.match(row, /Panier (?:\\\||&#124;|&#x7c;) conservé/i)
  assert.match(row, /tests\/panier(?:\\\||&#124;|&#x7c;)refus\.test\.mjs/i)
  includesText(row, '&lt;strong&gt;sans perte&lt;/strong&gt;')
  assert.doesNotMatch(markdown, /<strong>|\n<strong>|\bPASS\b/)
})