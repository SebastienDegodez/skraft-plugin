import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const MATRIX = 'details/2026-10-11/consistency-matrix-checkout.md'
const ADR = 'docs/adr/adr-002-refunds.md'

/** A solution architect that commits an ADR and writes in the tracking folder what `records` gives, its consistency matrix included. @param {Record<string, string>} records */
const architect = (records) => agent({
  records: false,
  fill: false,
  work: ({ git, tracking }) => {
    for (const [path, text] of Object.entries(records)) tracking.write(SLUG, path, text)
    git.commit('docs(checkout): ADR for the card payment', ['docs/adr/adr-001-card-payment.md'])
  },
})

const design = (host) => host.events().filter((event) => event.type === 'step.recorded' && event.step === 'design')

test('the solution architect is sent back while its consistency matrix is missing or does not pass, and goes on once it passes', async () => {
  const host = scripted({}, (it) => [
    agent()(it),
    architect({})(it),
    architect({ [MATRIX]: '| ADR | Verdict |\n- docs-relied-on: docs/architecture/context-map.md\n- consistency-gate: PASS \\| FAIL\n' })(it),
    architect({ [MATRIX]: '| ADR | Verdict |\n- docs-relied-on: docs/architecture/context-map.md\n- **consistency-gate:** PASS\n' })(it),
    ...nominal(it).slice(2),
  ])

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(design(host).map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures]), [
    [1, 'failed', 'missing-outputs', ['no consistency-matrix-<story>.md in the tracking folder: write it, its consistency-gate line reading PASS (G10)']],
    [2, 'failed', 'design-records', [`${MATRIX}: its consistency-gate line does not read PASS (G10)`]],
    [3, 'done', null, []],
  ])
  assert.deepEqual(design(host)[0].missing, [MATRIX])
  assert.ok(host.agentRunner.dispatches[2].prompt.endsWith([
    '', 'Refused in attempt 1 of 3:', '- no consistency-matrix-<story>.md in the tracking folder: write it, its consistency-gate line reading PASS (G10)',
  ].join('\n')), host.agentRunner.dispatches[2].prompt)
})

test('a consistency-gate line reading PASS may carry a comment after it; one that still reads FAIL or a choice of both does not pass', async () => {
  for (const [line, passes] of [
    ['- consistency-gate: PASS (re-run on pass 2 after the review findings; every row re-extracted)', true],
    ['- consistency-gate: **PASS** — every row matches its ADR', true],
    ['- consistency-gate: PASS | FAIL', false],
    ['- consistency-gate: PASSED with gaps', false],
    ['- consistency-gate: FAIL (PASS once ADR-002 lands)', false],
  ]) {
    const host = scripted({}, (it) => [agent()(it), architect({ [MATRIX]: `| ADR | Verdict |\n- docs-relied-on: docs/architecture/context-map.md\n${line}\n` })(it), () => ({ ok: false, unavailable: true, text: '' })])

    await host.start()

    assert.deepEqual(design(host).map(({ outcome }) => outcome), [passes ? 'done' : 'failed'], line)
  }
})

test('an ADR whose verdict sits in its file name, or a supersession the registry lacks, sends the architect back', async () => {
  const supersedes = '# ADR-002 Refunds\n\n**Status:** Proposed\n\n**Supersedes:** [ADR-001](./adr-001-card-payment.md) — refunds change the flow\n'
  const worker = { ...API, name: 'worker', root: 'worker' }
  const registry = '| date | superseded ADR | new ADR | reason |\n|---|---|---|---|\n| 2026-09-01 | ADR-001 | ADR-009 | an earlier change |\n| 2026-09-02 | ADR-0012 | ADR-0021 | another one |\n'
  const files = { [ADR]: supersedes, 'docs/adr/supersessions.md': registry, 'docs/adr/adr-003-sagas-rejected.md': '# ADR-003\n\n**Status:** Proposed\n', 'docs/adr/adr-005-cqrs-accepted.md': '# ADR-005\n\n**Status:** Proposed\n' }
  const host = scripted({ components: [API, worker], files }, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.commit('docs(checkout): ADRs for refunds', [ADR, 'docs/adr/adr-003-sagas-rejected.md', 'docs/adr/adr-004-old-superseded.md', 'docs/adr/adr-005-cqrs-accepted.md']) })(it),
  ])
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'stop here' }))

  await host.start()

  assert.deepEqual(design(host)[0].failures, [
    'docs/adr/adr-003-sagas-rejected.md: an ADR\'s verdict goes in its Status line, never in its file name (G14)',
    'docs/adr/adr-005-cqrs-accepted.md: an ADR\'s verdict goes in its Status line, never in its file name (G14)',
    `${ADR} supersedes ADR-001, and docs/adr/supersessions.md has no row naming ADR-001 and ADR-002 (G2, G12)`,
  ])
  assert.equal(design(host)[0].code, 'design-records')

  const unknown = scripted({}, (it) => [
    agent({ work: ({ git }) => git.commit('docs(checkout): research notes', [`.copilot-tracking/skraft-plans/${SLUG}/research/notes.md`]) })(it),
    agent({ work: ({ git }) => {
      const changedFiles = git.changedFiles.bind(git)
      git.changedFiles = async (dir, sha) => (sha === 'root-0' ? null : changedFiles(dir, sha))
    } })(it),
  ])
  assert.deepEqual(await unknown.start(), { status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: waitingOnEnvironment('design', 'Git cannot list what changed in . since root-0') })

  const registered = scripted({ answers: [{ answer: 'RATIFIED' }], files: { [ADR]: supersedes.replace('[ADR-001]', '[ADR-1]'), 'docs/adr/supersessions.md': '| 2026-10-11 | ADR-001 | ADR-2 | refunds change the flow |\n' } }, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.commit('docs(checkout): ADR for refunds', [ADR]) })(it),
    ...nominal(it).slice(2),
  ])
  assert.equal((await registered.start()).status, 'done')
})

/** A solution architect that writes only a passing matrix whose docs-relied-on line reads `line`. @param {string} line */
const citing = (line) => agent({
  records: false,
  fill: false,
  work: ({ tracking }) => tracking.write(SLUG, MATRIX, `| ADR | Verdict |\n${line}\n- consistency-gate: PASS\n`),
})

test('an architect that finds the story covered by the design documents already under docs/ cites them in its consistency matrix, and the run goes on to DISTILL', async () => {
  const documented = { 'docs/architecture/context-map.md': '# Context map\n\nPayment: Core\n', 'docs/domain/event-model/payment.md': '# Payment\n\nCardPaid\n' }
  const cited = citing('- docs-relied-on: `docs/architecture/context-map.md`, docs/domain/event-model/payment.md')
  const host = scripted({ files: documented }, (it) => [agent()(it), cited(it), ...nominal(it).slice(2)])

  assert.equal((await host.start()).status, 'done')

  const [started] = host.events().filter((event) => event.type === 'step.started' && event.step === 'design')
  assert.deepEqual(started.outputs, [MATRIX])
  assert.deepEqual(design(host).map(({ attempt, outcome, code, failures, documents }) => [attempt, outcome, code, failures, documents]), [
    [1, 'done', null, [], [MATRIX, 'details/2026-10-11/structural-scan.json']],
  ])
  assert.match(await host.tracking.read(SLUG, MATRIX), /docs-relied-on: `docs\/architecture\/context-map\.md`, docs\/domain\/event-model\/payment\.md/)
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started').map((event) => event.step).filter((step) => ['design', 'design_review', 'distill'].includes(step)), ['design', 'design_review', 'distill'])
  for (const [path, text] of Object.entries(documented)) assert.equal(await host.workspace.read(path), text)
})

test('an architect whose consistency matrix lists no file of a durable docs/ folder, or a file the working copy lacks, is sent back, and one citing its files with back slashes, lines and anchors goes on', async () => {
  const documented = { 'docs/README.md': '# Docs\n', 'docs/domain/event-model/payment.md': '# Payment\n', 'docs/architecture/legacy/old.md': '# Old\n' }
  const host = scripted({ files: documented }, (it) => [
    agent()(it),
    citing('- docs-relied-on: docs/adr, docs/adr/../../package.json, docs/architecture/legacy/../../../package.json, docs/README.md, docs/domain/, mydocs/architecture/context-map.md, /repo/docs/architecture/context-map.md, C:/repo/docs/architecture/context-map.md, ../docs/architecture/context-map.md, src/docs/architecture/context-map.md')(it),
    citing('- docs-relied-on: docs/architecture/payment.md, docs/architecture/legacy, docs/architecture/context-map.md')(it),
    citing('- docs-relied-on: docs\\architecture\\context-map.md:12:3, (docs/domain/event-model/payment.md#flow).')(it),
    ...nominal(it).slice(2),
  ])
  const read = host.workspace.read.bind(host.workspace)
  host.workspace.read = async (path) => {
    if (path === 'docs/architecture/legacy') throw new Error('EISDIR')
    return read(path)
  }

  assert.equal((await host.start()).status, 'done')

  const lacks = (/** @type {string} */ path) => `docs-relied-on lists ${path}, which is no file of the working copy (#410)`
  assert.deepEqual(design(host).map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures]), [
    [1, 'failed', 'design-records', [`${MATRIX}: its docs-relied-on line lists no docs/ file the story relies on, created or cited (#410)`]],
    [2, 'failed', 'design-records', [lacks('docs/architecture/payment.md'), lacks('docs/architecture/legacy')]],
    [3, 'done', null, []],
  ])
})
