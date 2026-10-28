import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftReviewWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-review-workflow.mjs'
import { createHostConfirmation } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/host-confirmation.mjs'
import { actsAs, confirmingSession, PLUGIN_ROOT, simulatedContext } from './simulated-host.mjs'
import { COMMENT_URL, pullRequestRepository, reviewLlm, TEST_FILE } from '../support/pull-request-repository.mjs'

/**
 * The Copilot host of a review on the repository: gh is the fake forge on its PATH for the
 * test's length (createNodeAdapters reads this process's environment), the person confirms as told.
 * @param {import('node:test').TestContext} t @param {ReturnType<typeof pullRequestRepository>} repo @param {object} [person]
 */
const hostOf = (t, repo, person) => {
  const path = process.env.PATH
  process.env.PATH = repo.env.PATH
  t.after(() => { process.env.PATH = path })
  const session = confirmingSession(person)
  return { session, host: { cwd: repo.cwd, pluginRoot: PLUGIN_ROOT, home: `${repo.cwd}-home`, confirmation: createHostConfirmation({ session: () => session }) } }
}

test('the skraft-review workflow runs the lenses through ctx.agent, then the refuter, and returns NEEDS_REWORK on the weakened assertion', async (t) => {
  const repo = pullRequestRepository(t)
  const { host } = hostOf(t, repo)
  const { ctx, calls, logs } = simulatedContext({ args: { pr: 12 }, otherwise: actsAs(reviewLlm()) })

  const outcome = await runSkraftReviewWorkflow(ctx, host)

  assert.deepEqual([outcome.status, outcome.reasons], ['NEEDS_REWORK', [`test-integrity F1 G9 blocker at ${TEST_FILE}:7: Assert.Equal(90m, total) became Assert.NotNull(total)`]])
  assert.deepEqual(calls.map(({ agent }) => agent), ['skraft:test-integrity-lens', 'skraft:architecture-boundaries-lens', 'skraft:cold-reader-lens', 'skraft:finding-refuter'])
  assert.equal(logs.at(-1), 'skraft review #12: NEEDS_REWORK: NEEDS_REWORK: 1 reason to address')
})

test('publish: true asks the person to confirm the consent in the host, journaled host-confirmed, then keeps one comment', async (t) => {
  const repo = pullRequestRepository(t)
  const { host, session } = hostOf(t, repo)
  const { ctx } = simulatedContext({ args: { pr: 12, publish: true }, otherwise: actsAs(reviewLlm()) })

  const outcome = await runSkraftReviewWorkflow(ctx, host)

  assert.deepEqual([outcome.comment, outcome.unpublished], [COMMENT_URL, null])
  assert.deepEqual(session.asked, ['skraft: keep one review comment on pull request #12, rewritten at each review and posted as you?'])
  const journal = readFileSync(join(repo.cwd, '.copilot-tracking', 'skraft-reviews', 'pr-12', 'events.jsonl'), 'utf8')
  assert.ok(journal.includes('"by":"host-confirmed"'))
  assert.deepEqual(JSON.parse(readFileSync(join(`${repo.cwd}-home`, '.skraft', 'config.json'), 'utf8')).reviewComments, { 'github.example.com/acme/shop': { accepted: true, questionVersion: 1 } })
})

test('in autopilot the consent is not recorded and nothing is posted; the log says why with a fixed reason', async (t) => {
  const repo = pullRequestRepository(t)
  const { host } = hostOf(t, repo, { mode: 'autopilot' })
  const { ctx, logs } = simulatedContext({ args: { pr: 12, publish: true }, otherwise: actsAs(reviewLlm()) })

  const outcome = await runSkraftReviewWorkflow(ctx, host)

  assert.deepEqual([outcome.comment, outcome.unpublished], [null, 'not published: nobody answered review_consent-1; run skraft review --pr 12 --publish where you can answer it'])
  assert.ok(logs.includes('a consent is not recorded in autopilot; run skraft review --pr 12 --publish in a terminal'), logs.join('\n'))
  assert.ok(!logs.some((line) => line.includes('skraft decide')), logs.join('\n'))
  assert.deepEqual(repo.forge.state().comments, [])
})

test('model-written arguments are refused without echoing them, and nothing starts', async (t) => {
  const repo = pullRequestRepository(t)
  const { host } = hostOf(t, repo)
  const refusal = { status: 'refused', number: null, code: 'invalid-args', reason: 'the review takes pr, a pull request number, and only publish (true or false) and agentIds besides; nothing was started' }

  for (const args of [{}, { pr: '12' }, { pr: 0 }, { pr: 1.5 }, { pr: 12, publish: 'yes' }, { pr: 12, model: 'secret-model' }, null]) {
    const { ctx, calls } = simulatedContext({ args })
    if (args === null) ctx.args = ['12']
    assert.deepEqual(await runSkraftReviewWorkflow(ctx, host), refusal)
    assert.deepEqual(calls, [])
  }
  const { ctx } = simulatedContext({ args: { pr: 12, agentIds: { 'cold-reader-lens': 'other' } }, agents: [{ id: 'skraft:cold-reader-lens' }] })
  assert.equal((await runSkraftReviewWorkflow(ctx, host)).code, 'invalid-agent-ids')
})

test('no working directory, an unexpected error, a cancellation: refused, a fixed reason, rethrown', async (t) => {
  const repo = pullRequestRepository(t)
  const { host } = hostOf(t, repo)

  assert.deepEqual(await runSkraftReviewWorkflow(simulatedContext({ args: { pr: 12 } }).ctx, { ...host, cwd: null }), { status: 'refused', number: null, code: 'no-directory', reason: 'the session has no working directory yet' })
  mkdirSync(join(repo.cwd, '.copilot-tracking', 'skraft-reviews', 'pr-12', 'events.jsonl'), { recursive: true })
  const broken = simulatedContext({ args: { pr: 12 } })
  assert.deepEqual(await runSkraftReviewWorkflow(broken.ctx, host), { status: 'error', number: null, code: 'unexpected', reason: 'the review stopped on an unexpected error; start it again to resume it from its journal' })
  assert.ok(!broken.logs.some((line) => line.includes('EISDIR')))
})

test('a review the host cancels while a lens runs is rethrown, not turned into an outcome', async (t) => {
  const repo = pullRequestRepository(t)
  const { host } = hostOf(t, repo)
  const controller = new AbortController()
  const cancelled = simulatedContext({ args: { pr: 12 }, signal: controller.signal, otherwise: async () => { controller.abort(); throw new Error('cancelled by the host') } })

  await assert.rejects(runSkraftReviewWorkflow(cancelled.ctx, host), /cancelled by the host/)
})

test('a consent the person does not confirm, a dialog the host never shows, or a host without a dialog, posts nothing and says so for the review', async (t) => {
  const repo = pullRequestRepository(t)
  for (const [person, line] of [
    [{ answer: false }, 'you did not confirm keeping a review comment on pull request #12'],
    [{ confirm: async () => undefined }, 'Copilot did not ask you to confirm; run skraft review --pr 12 --publish in a terminal'],
    [{ elicitation: false }, 'this Copilot host cannot ask you to confirm; run skraft review --pr 12 --publish in a terminal'],
    [{ mode: 7 }, 'Copilot did not say whether a person is there; run skraft review --pr 12 --publish in a terminal'],
  ]) {
    const { host } = hostOf(t, repo, person)
    const { ctx, logs } = simulatedContext({ args: { pr: 12, publish: true }, otherwise: actsAs(reviewLlm()) })
    const outcome = await runSkraftReviewWorkflow(ctx, host)
    assert.equal(outcome.comment, null)
    assert.ok(logs.includes(line), logs.join('\n'))
  }
})
