import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opening, section } from '../support/description.mjs'
import { agent, finding, lenses, nominal, refutes, reviews, says, scripted, SLUG } from '../support/pipeline-host.mjs'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'

/** The context map DESIGN writes and reworks. */
const ADR = 'docs/architecture/context-map.md'

/** A finding of a lens at a line of the context map. @param {string} id @param {string} severity @param {string} description @param {number} line @param {object} [more] */
const at = (id, severity, description, line, more = {}) => finding(id, severity, description, { location: `${ADR}:${line}`, ...more })

/** A finding of a lens at a location of its own. @param {string} id @param {string} severity @param {string} description @param {string} location @param {object} [more] */
const cites = (id, severity, description, location, more = {}) => finding(id, severity, description, { location, ...more })

/** The context map as DESIGN leaves it, line 3 then line 7 reworded when a rework gives them. @param {{ third?: string, seventh?: string }} [edits] */
const adr = ({ third = 'line 3', seventh = 'line 7' } = {}) => `${Array.from({ length: 20 }, (_, index) => ({ 2: third, 6: seventh })[index] ?? `line ${index + 1}`).join('\n')}\n`

/**
 * DESIGN commits its ADR and the context map, its rework rewrites the map as `reworked` holds it,
 * then does `more`; the rest of the run as usual.
 * @param {{ third?: string, seventh?: string }} reworked @param {(workspace: Map<string, string>, tracking: any) => void} [more]
 * @param {string[]} [written] more paths DESIGN commits
 */
const designReworking = (reworked, more = () => {}, written = []) => (it) => [
  agent()(it),
  agent({ work: ({ git }) => git.commit('docs(checkout): ADR for the card payment', ['docs/adr/adr-001-card-payment.md', ADR, ...written]) })(it),
  agent({ fill: false, work: ({ git, workspace, tracking }) => { workspace.files.set(ADR, adr(reworked)); more(workspace.files, tracking); git.commit('docs(checkout): rework the context map', [ADR]) } })(it),
  ...nominal(it).slice(2),
]

/** A lens answer that fails with these findings. @param {string} lens @param {object[]} found */
const fails = (lens, found) => says(lens, 'fail', found)

/** Refuter answers, in order. @param {...string} verdicts */
const answers = (...verdicts) => verdicts.map((verdict) => refutes(verdict))

/** The ids of the findings a pass noted. @param {ReturnType<typeof scripted>} host @param {number} visit */
const notedOn = (host, visit) => passEvents(host, 'review.noted', visit).map(({ lens, finding: id, since }) => `${lens} ${id} since ${since}`)

/** The refuter's checks of the design review on a pass, as `<what it refutes>`. @param {ReturnType<typeof scripted>} host @param {number} visit */
const checkedOn = (host, visit) => host.agentRunner.reviewed()
  .filter((dispatch) => dispatch.agent === 'finding-refuter' && dispatch.label.includes(' · design_review · ') && (visit > 1 ? dispatch.label.includes(`· pass ${visit} ·`) : !dispatch.label.includes('· pass ')))
  .map((dispatch) => dispatch.label.split(' · ')[2])

/** @param {ReturnType<typeof scripted>} host @param {string} type @param {number} visit */
const passEvents = (host, type, visit) => host.events().filter((event) => event.type === type && event.step === 'design_review' && event.visit === visit)

test('from the second pass, a finding at the place of one the refuter refuted on the last pass, by the same lens and gate, is carried over as refuted without asking the refuter; one new on a line the agent left as it was is a note, shown open in the description, the refuted ones folded', async () => {
  const host = scripted({ files: { [ADR]: adr() } }, designReworking({ third: 'line 3, reworked' }))
  host.agentRunner.review = lenses({
    consistency: [
      fails('consistency', [at('F1', 'blocker', 'the ADR contradicts the context map', 12)]),
      fails('consistency', [
        at('F1', 'blocker', 'the ADR still contradicts the map, worded anew', '12:5'), at('F2', 'high', 'two contexts own payments', 15),
        at('F3', 'medium', 'the reworded line hides the owner', 3),
      ]),
    ],
    'architecture-compliance': [says('architecture-compliance', 'pass'), says('architecture-compliance', 'pass', [at('F5', 'low', 'a name could be clearer', 17, { suggestion: 'name it Owner' })])],
    fitness: [fails('fitness', [at('F1', 'high', 'the latency budget is missing', 3)]), fails('fitness', [at('F1', 'high', 'the latency budget is still missing', 3)])],
    refuter: [refutes('refuted', 'ADR line 12 shows the ADR agrees with the map'), refutes('confirmed'), refutes('refuted', 'line 3 names the owner'), refutes('refuted', 'line 3 states the budget')],
  })

  await host.start()

  assert.deepEqual(checkedOn(host, 1), ['refute consistency F1', 'refute fitness F1'])
  assert.deepEqual(checkedOn(host, 2), ['refute consistency F3', 'refute fitness F1'])
  assert.deepEqual(passEvents(host, 'review.refuted', 2).map(({ lens, finding: id, verdict, reason, carried, assignment }) => [lens, id, verdict, reason, carried, assignment.family]), [
    ['consistency', 'F1', 'refuted', 'ADR line 12 shows the ADR agrees with the map', 1, passEvents(host, 'review.refuted', 1)[0].assignment.family],
    ['consistency', 'F3', 'refuted', 'line 3 names the owner', undefined, passEvents(host, 'review.refuted', 1)[0].assignment.family],
    ['fitness', 'F1', 'refuted', 'line 3 states the budget', undefined, passEvents(host, 'review.refuted', 1)[0].assignment.family],
  ])
  assert.deepEqual(notedOn(host, 2), ['consistency F2 since 1', 'architecture-compliance F5 since 1'])
  assert.deepEqual(reviews(host).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'adr']])
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review' && event.visit === 2)
  assert.equal(recorded.reason, 'APPROVED: no finding counts; 3 refuted (consistency F1, consistency F3, fitness F1); 2 notes (consistency F2, architecture-compliance F5)')
  const verdict = await host.tracking.read(SLUG, 'reviews/design_review-2/verdict.yaml')
  assert.ok(verdict.includes(`\nfindings: []\nnotes:\n  - lens: "consistency"\n    id: "F2"\n    gate: "G1"\n    severity: "high"\n    location: "${ADR}:15"\n    description: "two contexts own payments"\n    suggestion: null\n    severityReason: "high by the criterion"\n    drift: "structural"\n    occurrences: "${ADR}:15"\n    since: 1\n  - lens: "architecture-compliance"\n    id: "F5"`), verdict)
  assert.ok(verdict.includes('\nrefutations:\n  - lens: "consistency"\n    finding: "F1"\n    verdict: "refuted"\n    reason: "ADR line 12 shows the ADR agrees with the map"\n    carried: 1\n  - lens: "consistency"\n    finding: "F3"\n    verdict: "refuted"\n    reason: "line 3 names the owner"\n  - lens: "fitness"\n    finding: "F1"\n    verdict: "refuted"\n    reason: "line 3 states the budget"\nreused:'), verdict)
  assert.ok(host.progress.lines.some((line) => line.includes(`refuted: consistency F1 G1 blocker at ${ADR}:12:5: the ADR still contradicts the map, worded anew — ADR line 12 shows the ADR agrees with the map (carried over from pass 1)`)), host.progress.lines.join('\n'))
  assert.ok(host.progress.lines.includes(`  note: consistency F2 G1 high at ${ADR}:15: two contexts own payments (new on a line unchanged since pass 1)`), host.progress.lines.join('\n'))
  assert.ok(host.progress.lines.includes(`  note: architecture-compliance F5 G1 low at ${ADR}:17: a name could be clearer (new on a line unchanged since pass 1) (suggestion: name it Owner)`), host.progress.lines.join('\n'))
  const snapshot = JSON.parse(await host.tracking.read(SLUG, 'reviews/design_review-2/snapshot.json'))
  assert.equal(snapshot[ADR], adr({ third: 'line 3, reworked' }))
  const description = await host.tracking.read(SLUG, 'pull-request.md')
  assert.equal(opening(description, 'Review'), '<details><summary>Review: 2 notes, 3 refuted</summary>')
  assert.equal(section(description, 'Review'), [
    '**design_review** · 2 passes · lenses reviewer · refuter standard',
    '',
    '| Status | Severity | Lens | Location | Finding | Why |',
    '| --- | --- | --- | --- | --- | --- |',
    `| Note | high | consistency · G1 Every structural commitment has an ADR (F2) | \`${ADR}:15\` | two contexts own payments | new on a line unchanged since pass 1 |`,
    `| Note | low | architecture-compliance · G1 (F5) | \`${ADR}:17\` | a name could be clearer | new on a line unchanged since pass 1 |`,
    '',
    '<details><summary>3 refuted</summary>',
    '',
    '| Status | Severity | Lens | Location | Finding | Why |',
    '| --- | --- | --- | --- | --- | --- |',
    `| Refuted | blocker | consistency · G1 Every structural commitment has an ADR (F1) | \`${ADR}:12:5\` | the ADR still contradicts the map, worded anew | ADR line 12 shows the ADR agrees with the map (refuted on pass 1) |`,
    `| Refuted | medium | consistency · G1 Every structural commitment has an ADR (F3) | \`${ADR}:3\` | the reworded line hides the owner | line 3 names the owner |`,
    `| Refuted | high | fitness · G1 (F1) | \`${ADR}:3\` | the latency budget is still missing | line 3 states the budget |`,
    '',
    '</details>',
  ].join('\n'))
  const matrix = `.copilot-tracking/skraft-plans/${SLUG}/details/2026-10-11/consistency-matrix-${SLUG}.md`
  assert.equal(snapshot[matrix], await host.tracking.read(SLUG, `details/2026-10-11/consistency-matrix-${SLUG}.md`))
})

test('a finding on a line the agent changed, at a place the refuter confirmed, or in a file that came or went since the last pass, is checked again, and counts when it stands', async () => {
  // One rework only: the run stops at the review's ceiling after the second pass.
  const once = edit(BUILT_IN_WORKFLOW, ['design_review -> design  [label="NEEDS_REWORK", max_visits=2]', 'design_review -> design  [label="NEEDS_REWORK", max_visits=1]'])
  const host = scripted({ workflow: once, files: { [ADR]: adr(), 'docs/architecture/old.md': 'old\nrule\n' } }, designReworking({ third: 'line 3, reworked', seventh: 'line 7, reworked' }, (files) => {
    files.delete('docs/architecture/old.md')
    files.set('docs/architecture/payments.md', 'payments\nowner\n')
  }))
  host.agentRunner.review = lenses({
    consistency: [
      fails('consistency', [at('F1', 'blocker', 'the map contradicts the ADR', 3), at('F2', 'medium', 'the ADR names no owner', 9), cites('F4', 'medium', 'the old rule is stale', 'docs/architecture/old.md:2')]),
      fails('consistency', [
        at('F1', 'blocker', 'the map still contradicts the ADR', 3), at('F2', 'medium', 'still no owner', 9), at('F3', 'medium', 'the new wording hides the rule', 7),
        cites('F4', 'medium', 'the old rule is gone', 'docs/architecture/old.md:2'), cites('F6', 'medium', 'payments has no owner', 'docs/architecture/payments.md:2'), at('F7', 'high', 'the map has no legend', 19),
      ]),
    ],
    fitness: [fails('fitness', [at('F2', 'medium', 'no budget', 18)]), fails('fitness', [at('F7', 'high', 'the reworded line drops the budget', 3)])],
    refuter: answers('refuted', 'confirmed', 'refuted', 'refuted', 'refuted', 'refuted', 'refuted', 'refuted', 'refuted', 'confirmed'),
  })

  await host.start()

  assert.deepEqual(checkedOn(host, 2), ['refute consistency F1', 'refute consistency F2', 'refute consistency F3', 'refute consistency F4', 'refute consistency F6', 'refute fitness F7'])
  assert.deepEqual(passEvents(host, 'review.refuted', 2).filter(({ carried }) => carried !== undefined), [])
  assert.deepEqual(notedOn(host, 2), ['consistency F7 since 1'])
  assert.deepEqual(host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review' && event.visit === 2).failures, [`fitness F7 G1 high at ${ADR}:3: the reworded line drops the budget`])
  // The note on an unchanged line is not among what the review leaves to a human at its ceiling.
  assert.deepEqual(host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review' && event.visit === 2).findings.map(({ lens, id }) => `${lens} ${id}`), ['fitness F7'])
  const [ceiling] = host.human.questions
  assert.ok(ceiling.text.includes('Blocker and high (1):\n- high · fitness F7 G1'), ceiling.text)
  assert.equal(ceiling.text.includes('consistency F7'), false, ceiling.text)
})

test('a finding at a line whose text the file now holds twice, in a file one pass could not read, or without a line where the last one had one, is no repeat: the refuter checks it again; a new one of another gate, another path or another lens is a note on an unchanged line; one where a low one was refuted carries that refutation', async () => {
  const host = scripted({ files: { [ADR]: adr() } }, designReworking({ seventh: 'line 12' }))
  host.agentRunner.review = lenses({
    consistency: [
      fails('consistency', [
        at('F1', 'blocker', 'the ADR contradicts the context map', 12), at('F2', 'high', 'the ADR has no status', 15), cites('F3', 'medium', 'no diagram', 'docs/missing.md:4'),
        at('F4', 'low', 'a name could be clearer', 17), cites('F7', 'medium', 'the map has no legend', ADR), at('F8', 'medium', 'the map ends abruptly', 20),
        cites('F9', 'medium', 'no status here either', 'docs/elsewhere.md:14', { gate: 'G2' }), cites('F10', 'medium', 'outside', '../outside.md:3'),
      ]),
      fails('consistency', [
        at('F1', 'blocker', 'the ADR contradicts the context map', 12), at('F2', 'high', 'the ADR has no status', 15, { gate: 'G2' }), cites('F3', 'medium', 'no diagram', 'docs/missing.md:4'),
        at('F4', 'medium', 'a name hides the owner', 17), at('F6', 'high', 'the latency budget is missing', 16), at('F7', 'medium', 'the map has no legend', 19),
        cites('F8', 'medium', 'the map ends abruptly', ADR), at('F9', 'medium', 'no status here either', 14, { gate: 'G2' }), at('F11', 'medium', 'the title is vague', 1),
      ]),
    ],
    fitness: [fails('fitness', [at('F1', 'high', 'the latency budget is missing', 5), at('F2', 'high', 'the latency budget is missing', 16)])],
    refuter: answers('refuted', 'refuted', 'refuted', 'refuted', 'refuted', 'refuted', 'refuted', 'refuted', 'confirmed', 'refuted', 'refuted', 'refuted', 'refuted'),
  })

  await host.start()

  assert.deepEqual(checkedOn(host, 2), ['refute consistency F1', 'refute consistency F3', 'refute consistency F8'])
  assert.deepEqual(passEvents(host, 'review.refuted', 2).map(({ finding: id, carried }) => [id, carried]), [['F4', 1], ['F1', undefined], ['F3', undefined], ['F8', undefined]])
  assert.deepEqual(notedOn(host, 2), ['consistency F2 since 1', 'consistency F6 since 1', 'consistency F7 since 1', 'consistency F9 since 1', 'consistency F11 since 1'])
  assert.deepEqual(reviews(host)[1], ['design_review', 2, 'approved', 'adr'])
  const snapshot = JSON.parse(await host.tracking.read(SLUG, 'reviews/design_review-1/snapshot.json'))
  assert.equal(snapshot['docs/missing.md'], null)
  assert.equal('../outside.md' in snapshot, false)
})

test('a finding without a line is a repeat only at the same location with the same claim, word for word', async () => {
  const host = scripted({ files: { [ADR]: adr() } }, designReworking({}))
  host.agentRunner.review = lenses({
    consistency: [
      fails('consistency', [cites('F1', 'medium', 'the map has no legend', ADR), cites('F2', 'medium', 'the ADR has no status', 'docs/adr/adr-001-card-payment.md')]),
      fails('consistency', [cites('F1', 'medium', 'the map has no title', ADR), cites('F2', 'medium', 'the ADR has no status', 'docs/adr/adr-002.md')]),
    ],
    fitness: [fails('fitness', [at('F1', 'high', 'the latency budget is missing', 5)])],
    refuter: answers('refuted', 'refuted', 'confirmed', 'refuted', 'refuted'),
  })

  await host.start()

  assert.deepEqual(checkedOn(host, 2), ['refute consistency F1', 'refute consistency F2'])
})

test('a resumed pass journals once each finding it carried over and each it noted', async () => {
  const host = scripted({ files: { [ADR]: adr() } }, designReworking({ third: 'line 3, reworked' }))
  host.agentRunner.review = lenses({
    consistency: [
      fails('consistency', [at('F1', 'blocker', 'the ADR contradicts the context map', 12), at('F2', 'high', 'two contexts own payments', 14)]),
      fails('consistency', [at('F1', 'blocker', 'still', 12), at('F2', 'high', 'still two', 14), at('F3', 'high', 'no legend', 15), at('F4', 'high', 'no title', 16)]),
    ],
    fitness: [
      fails('fitness', [at('F1', 'high', 'the latency budget is missing', 13), at('F2', 'high', 'no throughput', 3)]),
      fails('fitness', [at('F1', 'high', 'still missing', 13), at('F3', 'high', 'no error budget', 17), at('F4', 'high', 'the reworded line drops the budget', 3)]),
    ],
    refuter: [...answers('refuted', 'refuted', 'refuted', 'confirmed'), { ok: false, text: '', unavailable: true, error: 'finding-refuter is not installed' }, refutes('refuted')],
  })

  assert.equal((await host.start()).code, 'agent-unavailable')
  await host.run()

  assert.deepEqual(passEvents(host, 'review.refuted', 2).map(({ lens, finding: id, carried }) => `${lens} ${id} ${carried}`), ['consistency F1 1', 'consistency F2 1', 'fitness F1 1', 'fitness F4 undefined'])
  assert.deepEqual(notedOn(host, 2), ['consistency F3 since 1', 'consistency F4 since 1', 'fitness F3 since 1'])
  assert.deepEqual(reviews(host)[1], ['design_review', 2, 'approved', 'adr'])
})

test('a file longer than a snapshot keeps, or one the working copy cannot read, counts as changed; a last snapshot that is no JSON takes nothing from the last pass', async () => {
  const big = `${'x'.repeat(1_000_000)}\nline\n`
  const edge = `${'y'.repeat(999_994)}\nline\n`
  const host = scripted({ files: { [ADR]: adr(), 'docs/architecture/big.md': big, 'docs/architecture/edge.md': edge } }, designReworking({}, (files, tracking) => tracking.files.set(`${SLUG}/reviews/design_review-1/snapshot.json`, '{ not json'), ['docs/architecture/big.md', 'docs/architecture/edge.md', 'docs/architecture/locked']))
  const read = host.workspace.read.bind(host.workspace)
  host.workspace.read = async (path) => { if (path === 'docs/architecture/locked') throw new Error('EISDIR'); return read(path) }
  host.agentRunner.review = lenses({
    consistency: [fails('consistency', [at('F1', 'blocker', 'the ADR contradicts the context map', 12)]), fails('consistency', [at('F1', 'blocker', 'still', 12)])],
    fitness: [fails('fitness', [at('F1', 'high', 'the latency budget is missing', 5)])],
    refuter: answers('refuted', 'confirmed', 'refuted'),
  })

  await host.start()

  const snapshot = JSON.parse(await host.tracking.read(SLUG, 'reviews/design_review-2/snapshot.json'))
  assert.equal(snapshot['docs/architecture/big.md'], null)
  assert.equal(snapshot['docs/architecture/edge.md'], edge)
  assert.equal(snapshot['docs/architecture/locked'], null)
  assert.deepEqual(checkedOn(host, 2), ['refute consistency F1'])
})

test('a finding the engine reads again word for word where the refuter refuted it is carried over; its findings are never notes', async () => {
  const host = scripted({ files: { [ADR]: adr() } }, (it) => [
    ...nominal(it).slice(0, 2),
    agent({ work: ({ git }) => {
      git.patched('tests/Acceptance/PayTests.cs', ['new file mode 100644', '--- /dev/null', '+++ b/tests/Acceptance/PayTests.cs', '@@ -0,0 +1,1 @@', '+// test'])
      git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/PayTests.cs'])
    } })(it),
    agent({ fill: false })(it),
    () => ({ ok: false, unavailable: true, text: '', error: 'stop here' }),
  ])
  host.agentRunner.review = lenses({ refuter: [refutes('refuted', 'the unit project holds it'), refutes('confirmed')] })

  await host.start()

  const second = host.events().filter((event) => event.type === 'review.refuted' && event.step === 'distill_review' && event.visit === 2)
  assert.deepEqual(second.map(({ lens, finding: id, verdict, carried }) => [lens, id, verdict, carried]), [['testability#layout', 'F1', 'refuted', 1], ['testability#layout', 'F2', 'confirmed', undefined]])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.noted'), [])
  assert.deepEqual(reviews(host)[2], ['distill_review', 2, 'needs-rework', 'distill'])
})
