import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const MATRIX = 'details/2026-10-11/consistency-matrix-checkout.md'
const DRIFT = 'blockers/2026-10-11/decision-drift-checkout-001.md'
const ADR = 'docs/adr/adr-002-refunds.md'

/** A solution architect that commits an ADR and writes what `records` gives in the tracking folder. @param {Record<string, string>} records */
const architect = (records) => agent({
  records: false,
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
    architect({ [MATRIX]: '| ADR | Verdict |\n- consistency-gate: PASS \\| FAIL\n' })(it),
    architect({ [MATRIX]: '| ADR | Verdict |\n- **consistency-gate:** PASS\n' })(it),
    ...nominal(it).slice(2),
  ])

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(design(host).map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures]), [
    [1, 'failed', 'design-records', ['no consistency-matrix-<story>.md in the tracking folder: write it, its consistency-gate line reading PASS (G10)']],
    [2, 'failed', 'design-records', [`${MATRIX}: its consistency-gate line does not read PASS (G10)`]],
    [3, 'done', null, []],
  ])
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
    const host = scripted({}, (it) => [agent()(it), architect({ [MATRIX]: `| ADR | Verdict |\n${line}\n` })(it), () => ({ ok: false, unavailable: true, text: '' })])

    await host.start()

    assert.deepEqual(design(host).map(({ outcome }) => outcome), [passes ? 'done' : 'failed'], line)
  }
})

test('an empty resolution answers no drift: the run stays stopped until a human writes the decision in it', async () => {
  const RESOLUTION = 'blockers/2026-10-11/decision-drift-checkout-001-resolution.md'
  const host = scripted({}, (it) => [
    agent()(it),
    architect({ [MATRIX]: '- consistency-gate: PASS\n', [DRIFT]: '# Drift\n', [RESOLUTION]: '  \n' })(it),
    ...nominal(it).slice(2),
  ])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.reason], ['blocked', `${DRIFT} has an empty decision-drift-checkout-001-resolution.md beside it: a human writes the decision there, then resumes the run (G13)`])
  await host.tracking.write(SLUG, RESOLUTION, 'chosen: A\n')
  assert.equal((await host.run()).status, 'done')
})

test('a decision drift the architect leaves without its resolution stops the run for a human; once answered, the resumed run checks the step again and goes on', async () => {
  const open = scripted({}, (it) => [
    agent()(it),
    architect({ [MATRIX]: '- consistency-gate: PASS\n', [DRIFT]: '# Drift\n' })(it),
    ...nominal(it).slice(2),
  ])

  const outcome = await open.start()

  const line = `${DRIFT} has no decision-drift-checkout-001-resolution.md beside it: a human answers the drift there, then resumes the run (G13)`
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: line })
  assert.deepEqual(design(open), [])
  await open.tracking.write(SLUG, 'blockers/2026-10-11/decision-drift-checkout-001-resolution.md', 'chosen: A\n')
  assert.equal((await open.run()).status, 'done')
  assert.deepEqual(open.agentRunner.dispatches.filter(({ agent: id }) => id === 'solution-architect').map(({ label }) => label), [
    `skraft ${SLUG} · design · attempt 1`,
  ])
  assert.deepEqual(design(open).map(({ attempt, outcome: result }) => [attempt, result]), [[1, 'done']])

  const resolved = scripted({}, (it) => [
    agent()(it),
    architect({ [MATRIX]: '- consistency-gate: PASS\n', [DRIFT]: '# Drift\n', 'blockers/2026-10-11/decision-drift-checkout-001-resolution.md': 'chosen: A\n' })(it),
    ...nominal(it).slice(2),
  ])
  assert.equal((await resolved.start()).status, 'done')
})

test('an ADR whose verdict sits in its file name, or a supersession the registry lacks, sends the architect back', async () => {
  const supersedes = '# ADR-002 Refunds\n\nStatus: Accepted\n\n**Supersedes:** [ADR-001](./adr-001-card-payment.md) — refunds change the flow\n'
  const worker = { ...API, name: 'worker', root: 'worker' }
  const registry = '| date | superseded ADR | new ADR | reason |\n|---|---|---|---|\n| 2026-09-01 | ADR-001 | ADR-009 | an earlier change |\n| 2026-09-02 | ADR-0012 | ADR-0021 | another one |\n'
  const files = { [ADR]: supersedes, 'docs/adr/supersessions.md': registry, 'docs/adr/adr-003-sagas-rejected.md': '# ADR-003\n', 'docs/adr/adr-005-cqrs-accepted.md': '# ADR-005\n' }
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
  assert.deepEqual(await unknown.start(), { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: 'Git cannot list what changed in . since root-0' })

  const registered = scripted({ files: { [ADR]: supersedes.replace('[ADR-001]', '[ADR-1]'), 'docs/adr/supersessions.md': '| 2026-10-11 | ADR-001 | ADR-2 | refunds change the flow |\n' } }, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.commit('docs(checkout): ADR for refunds', [ADR]) })(it),
    ...nominal(it).slice(2),
  ])
  assert.equal((await registered.start()).status, 'done')
})
