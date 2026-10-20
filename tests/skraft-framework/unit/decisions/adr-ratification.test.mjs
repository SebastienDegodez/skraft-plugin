import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { agent, pipelineHost, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { ADR_1, ADR_2, adrText, afterDesign, architect, dispatched, eventsOf, INDEX, indexText, waitingOnEnvironment } from '../support/decisions.mjs'

const RATIFY = `Ratify the Proposed ADRs ${ADR_1}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`
const proposed = (it) => [agent()(it), architect({ [ADR_1]: adrText() })(it), ...afterDesign(it)]

test('a Proposed ADR and nobody to answer: the run waits on the question, and runs no agent past DESIGN', async () => {
  const host = scripted({}, proposed)

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'adr-ratification',
    reason: `${RATIFY} Answer with skraft decide adr-1 RATIFIED|REJECTED (a refusal with its reason).`,
  })
  assert.deepEqual(dispatched(host), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`])
  assert.deepEqual(host.human.questions, [{ key: 'adr-1', kind: 'adr-ratification', text: RATIFY, options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR' }])
  assert.deepEqual(host.types().slice(-2), ['step.started', 'question.asked'])
  const [asked] = eventsOf(host, 'question.asked')
  assert.deepEqual({ key: asked.key, step: asked.step, visit: asked.visit, subjects: asked.subjects }, { key: 'adr-1', step: 'adr', visit: 1, subjects: [ADR_1] })
  const view = await host.view()
  assert.equal(view.status, 'waiting')
  assert.equal(view.reason, RATIFY)
  assert.deepEqual(view.question, { key: 'adr-1', kind: 'adr-ratification', text: RATIFY, options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'] })
  assert.deepEqual(view.current, { step: 'adr', phase: 'DESIGN', agent: null, gates: null, question: 'adr-ratification', visit: 1, attempt: 1 })
})

test('a run started again without an answer asks the same question again and still waits; nothing is journaled twice', async () => {
  const host = scripted({}, proposed)
  await host.start()
  const journaled = host.events().length

  const outcome = await host.run()

  assert.equal(outcome.status, 'waiting')
  assert.equal(host.events().length, journaled)
  assert.deepEqual(host.human.questions.map((question) => question.key), ['adr-1', 'adr-1'])
  assert.equal(host.agentRunner.dispatches.length, 2)
})

test('skraft decide RATIFIED, then the next run marks the ADR Accepted, commits it and goes on to DISTILL without running an agent again', async () => {
  const host = scripted({ files: { [INDEX]: indexText(['| ADR-001 | Card payment | Proposed | Stripe | Pay by card through Stripe | — | 2026-10-11 |']) } }, proposed)
  await host.start()

  const decided = await host.decide({ key: 'adr-1', answer: 'ratified' })
  assert.deepEqual(decided, { ok: true, slug: SLUG, key: 'adr-1', code: null, reason: `${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on` })
  assert.equal((await host.view()).status, 'running')

  const outcome = await host.run()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(dispatched(host), [
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`,
    `skraft ${SLUG} · distill · attempt 1`, `skraft ${SLUG} · deliver · attempt 1`,
  ])
  assert.equal(await host.workspace.read(ADR_1), adrText().replace('status: Proposed', 'status: Accepted').replace('ratified_by: null', 'ratified_by: "human 2026-10-11"').replace('**Status:** Proposed', '**Status:** Accepted'))
  assert.equal(await host.workspace.read(INDEX), indexText(['| ADR-001 | Card payment | Accepted | Stripe | Pay by card through Stripe | human 2026-10-11 | 2026-10-11 |']))
  assert.deepEqual(host.git.engineCommits, [{ dir: '.', paths: [ADR_1, INDEX], message: 'docs(adr): ratify ADR-001' }])
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'RATIFIED', null, 'decide']])
  const [adr] = eventsOf(host, 'step.recorded').filter((event) => event.step === 'adr')
  assert.deepEqual({ outcome: adr.outcome, answer: adr.answer, next: adr.next, failures: adr.failures }, { outcome: 'answered', answer: 'RATIFIED', next: 'distill', failures: [] })
  assert.deepEqual(eventsOf(host, 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
})

test('a host that asks in a dialog gets the answer in the same run', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, proposed)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ answer, by }) => [answer, by]), [['RATIFIED', 'host']])
  assert.ok(host.progress.lines.includes(`${SLUG}: adr RATIFIED`), host.progress.lines.join('\n'))
})

test('for a story with an issue, the ratification commit ends its body with Refs: #<issue>, and the run goes on', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }], files: { [INDEX]: indexText([]) } }, (it) => [agent()(it), architect({ [ADR_1]: adrText() }, REFS_42)(it), ...afterDesign(it, REFS_42)])

  const outcome = await host.start({ story: { issue: 42, title: 'Pay by card' } })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.git.engineCommits, [{ dir: '.', paths: [ADR_1, INDEX], message: 'docs(adr): ratify ADR-001\n\nRefs: #42' }])
})

test('an answer the question does not take, or a refusal without its reason, leaves the run waiting', async () => {
  const host = scripted({ answers: [{ answer: 'maybe' }, { answer: 'REJECTED', reason: '  ' }] }, proposed)

  assert.equal((await host.start()).status, 'waiting')
  assert.equal((await host.run()).status, 'waiting')

  assert.deepEqual(eventsOf(host, 'question.answered'), [])
  assert.ok(host.progress.lines.includes(`${SLUG}: adr-1 not answered: the answer must be one of RATIFIED, REJECTED, got "maybe"`), host.progress.lines.join('\n'))
  assert.ok(host.progress.lines.includes(`${SLUG}: adr-1 not answered: REJECTED needs the reason, which goes back to the agent`), host.progress.lines.join('\n'))
})

test('with no Proposed ADR, DESIGN goes on to DISTILL without a question', async () => {
  const host = scripted({ files: { [ADR_2]: adrText({ number: 2, status: 'Accepted' }) } }, (it) => [agent()(it), agent()(it), ...afterDesign(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.human.questions, [])
  const [adr] = eventsOf(host, 'step.recorded').filter((event) => event.step === 'adr')
  assert.deepEqual({ outcome: adr.outcome, answer: adr.answer, next: adr.next, reason: adr.reason }, { outcome: 'skipped', answer: 'RATIFIED', next: 'distill', reason: 'no Proposed ADR to ratify' })
  assert.deepEqual(host.git.engineCommits, [])
})

test('an ADR folder the machine cannot list asks the human to fix it, never skips the ratification; RETRY lists it again and asks', async () => {
  const host = scripted({ files: { [ADR_1]: adrText() } }, (it) => [agent()(it), agent()(it), ...afterDesign(it)])
  host.workspace.unlistable.set('docs/adr', 'git ls-files failed: fatal: index file corrupt')

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: waitingOnEnvironment('adr', 'docs/adr cannot be listed: git ls-files failed: fatal: index file corrupt') })
  assert.deepEqual(eventsOf(host, 'step.recorded').filter((event) => event.step === 'adr'), [])
  host.workspace.unlistable.clear()
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)
  assert.equal((await host.run()).code, 'adr-ratification')
  assert.deepEqual(eventsOf(host, 'question.asked').at(-1).subjects, [ADR_1])
  assert.equal(host.agentRunner.dispatches.length, 2)
})

test('a workflow that ratifies at two nodes asks at each, about the ADRs each one finds Proposed', async () => {
  const workflow = `digraph twice {
    start   [shape=Mdiamond]
    design  [shape=box, agent="solution-architect", phase="DESIGN"]
    adr     [shape=hexagon, question="adr-ratification"]
    refine  [shape=box, agent="solution-architect", phase="DESIGN"]
    adr_again [shape=hexagon, question="adr-ratification"]
    exit    [shape=Msquare]
    start -> design -> adr
    adr -> refine [label="RATIFIED"]
    adr -> design [label="REJECTED", max_visits=3]
    refine -> adr_again
    adr_again -> exit [label="RATIFIED"]
    adr_again -> refine [label="REJECTED", max_visits=3]
  }`
  const host = scripted({ workflow, answers: [{ answer: 'RATIFIED' }, { answer: 'RATIFIED' }] }, (it) => [
    architect({ [ADR_1]: adrText() })(it), architect({ [ADR_2]: adrText({ number: 2, title: 'Card tokens' }) })(it),
  ])

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(host.human.questions.map(({ key }) => key), ['adr-1', 'adr_again-1'])
  assert.match(await host.workspace.read(ADR_2), /^status: Accepted$/m)
})

test('every Proposed ADR is asked about at once, in file order, and ratified together', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [agent()(it), architect({ [ADR_2]: adrText({ number: 2, title: 'Card tokens' }), [ADR_1]: adrText() })(it), ...afterDesign(it)])

  await host.start()

  assert.equal(host.human.questions[0].text, `Ratify the Proposed ADRs ${ADR_1}, ${ADR_2}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`)
  assert.deepEqual(host.git.engineCommits.map((commit) => commit.message), ['docs(adr): ratify ADR-001, ADR-002'])
  assert.match(await host.workspace.read(ADR_2), /^status: Accepted$/m)
})

test('a ratification Git cannot commit asks the human to fix the machine; RETRY commits it without asking again', async () => {
  const git = new InMemoryGit({ commitFails: 'git commit failed: Please tell me who you are' })
  const host = scripted({ git, answers: [{ answer: 'RATIFIED' }] }, proposed)

  const outcome = await host.start()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'environment' })
  assert.equal((await host.view()).question.text, 'adr cannot run on this machine: git commit failed: Please tell me who you are. Fix it, then RETRY; or ABORT the run.')
  git.commitFails = null
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)
  assert.equal((await host.run()).status, 'done')
  assert.deepEqual(host.human.questions.map((question) => question.key), ['adr-1', 'adr-2'])
  assert.deepEqual(host.git.engineCommits.map((commit) => commit.message), ['docs(adr): ratify ADR-001'])
})

test('skraft decide refuses an answer nobody waits for, a key no question has, one already answered, and a wrong answer', async () => {
  const idle = pipelineHost()
  assert.equal((await idle.decide({ answer: 'RATIFIED' })).code, 'no-active-pipeline')

  const host = scripted({}, proposed)
  await host.init()
  assert.deepEqual(await host.decide({ answer: 'RATIFIED' }), { ok: false, slug: SLUG, key: null, code: 'no-question', reason: 'no question to answer; no question is waiting' })
  await host.run()

  assert.deepEqual(await host.decide({ key: 'adr-2', answer: 'RATIFIED' }), { ok: false, slug: SLUG, key: 'adr-2', code: 'no-question', reason: 'no question adr-2; waiting: adr-1' })
  assert.deepEqual(await host.decide({ key: 'adr-1', answer: 'yes' }), { ok: false, slug: SLUG, key: 'adr-1', code: 'invalid-answer', reason: 'the answer must be one of RATIFIED, REJECTED, got "yes"' })
  assert.deepEqual(await host.decide({ answer: 'rejected' }), { ok: false, slug: SLUG, key: 'adr-1', code: 'invalid-answer', reason: 'REJECTED needs the reason, which goes back to the agent' })
  assert.equal((await host.decide({ slug: 'other', answer: 'RATIFIED' })).code, 'slug-mismatch')
  assert.equal((await host.decide({ answer: 'RATIFIED' })).ok, true)
  assert.deepEqual(await host.decide({ key: 'adr-1', answer: 'REJECTED', reason: 'too late' }), { ok: false, slug: SLUG, key: 'adr-1', code: 'already-answered', reason: 'adr-1 was already answered RATIFIED' })
})
