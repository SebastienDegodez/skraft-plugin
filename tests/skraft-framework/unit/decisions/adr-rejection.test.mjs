import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { agent, scripted, SLUG } from '../support/pipeline-host.mjs'
import { ADR_1, ADR_2, adrText, afterDesign, architect, dispatched, eventsOf } from '../support/decisions.mjs'

const REASON = 'Stripe is not allowed here: use the bank gateway'
const refused = (it) => [agent()(it), architect({ [ADR_1]: adrText() })(it)]

test('a rejected ADR sends the architect back with the human\'s reason, on a new pass of DESIGN', async () => {
  const host = scripted({ answers: [{ answer: 'rejected', reason: `  ${REASON}\n` }, { answer: 'RATIFIED' }] }, (it) => [
    ...refused(it), architect({ [ADR_1]: adrText({ title: 'Bank gateway payment' }) })(it), ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(dispatched(host).slice(1, 3), [`skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · pass 2 · attempt 1`])
  const brief = host.agentRunner.dispatches[2].prompt
  assert.ok(brief.includes('- Pass: 2, after a human refused the work'), brief)
  assert.ok(brief.endsWith(['', 'A human refused the work of pass 1:', `- ${ADR_1}: ${REASON}`].join('\n')), brief)
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, reason }) => [key, answer, reason]), [['adr-1', 'REJECTED', REASON], ['adr-2', 'RATIFIED', null]])
  assert.deepEqual(eventsOf(host, 'step.recorded').filter((event) => event.step === 'adr').map(({ visit, answer, next, failures }) => [visit, answer, next, failures]), [
    [1, 'REJECTED', 'design', [`${ADR_1}: ${REASON}`]],
    [2, 'RATIFIED', 'distill', []],
  ])
  assert.equal(host.git.engineCommits.length, 1)
})

test('a rejection decided offline relaunches the architect on the next run, and only it', async () => {
  const host = scripted({}, (it) => [...refused(it), architect({ [ADR_1]: adrText({ title: 'Bank gateway payment' }) })(it)])
  await host.start()

  assert.equal((await host.decide({ key: 'adr-1', answer: 'REJECTED', reason: REASON })).ok, true)
  const outcome = await host.run()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'adr-ratification' })
  assert.deepEqual(dispatched(host), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · pass 2 · attempt 1`])
  assert.equal((await host.view()).question.key, 'adr-2')
})

test('rejected as often as the REJECTED edge allows, the run stops at its max_visits with the last reason', async () => {
  const answers = [1, 2, 3, 4].map((round) => ({ answer: 'REJECTED', reason: `round ${round}` }))
  const host = scripted({ answers }, (it) => [agent()(it), ...[1, 2, 3, 4].map((round) => architect({ [ADR_1]: adrText({ title: `Card payment ${round}` }) })(it))])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'loop-ceiling',
    reason: `adr -> design was already taken 3 times, its max_visits; ${ADR_1}: round 4`,
  })
  assert.equal(host.agentRunner.dispatches.length, 5)
})

test('a published ADR the human rejects is not touched by the engine', async () => {
  const git = new InMemoryGit({ published: [ADR_2] })
  const host = scripted({ git, files: { [ADR_2]: adrText({ number: 2, title: 'Card tokens' }) }, answers: [{ answer: 'REJECTED', reason: REASON }] }, (it) => [agent()(it), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])

  await host.start()

  assert.equal(await host.workspace.read(ADR_2), adrText({ number: 2, title: 'Card tokens' }))
  assert.deepEqual(git.engineCommits, [])
})

test('a pass a human refused has no failing test to stand for its red: a feat commit without a test commit is refused', async () => {
  const workflow = `digraph refused {
  start   [shape=Mdiamond]
  deliver [shape=box, agent="software-engineer", phase="DELIVER"]
  review  [shape=hexagon, question="adr-ratification"]
  exit    [shape=Msquare]
  start -> deliver -> review
  review -> exit    [label="RATIFIED"]
  review -> deliver [label="REJECTED", max_visits=2]
}`
  const host = scripted({ workflow, files: { [ADR_1]: adrText() }, answers: [{ answer: 'REJECTED', reason: REASON }] }, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.commit('feat(checkout): pay by bank', ['src/Pay.cs']) })(it),
    () => ({ ok: false, unavailable: true, text: '' }),
  ])

  await host.start()

  const [, refusedPass] = eventsOf(host, 'step.recorded').filter((event) => event.step === 'deliver')
  assert.deepEqual({ visit: refusedPass.visit, attempt: refusedPass.attempt, code: refusedPass.code }, { visit: 2, attempt: 1, code: 'tdd' })
  assert.match(refusedPass.failures[0], /makes code pass with no test commit since the last feat or fix/)
})
