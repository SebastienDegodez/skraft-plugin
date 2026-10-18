import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgentAnswers, createSpawnAgentRunner } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/agent-runner.mjs'

const DISPATCH = { agent: 'solution-researcher', source: 'plugin', label: 'skraft checkout · research · attempt 1', prompt: '## Skraft dispatch' }
const REPOSITORY_DISPATCH = { agent: 'acme-security-reviewer', source: 'repository', label: 'skraft checkout · security · attempt 1', prompt: '## Skraft dispatch' }

/** A scripted `$.agent.spawn` and `$.session.usage` cost, around one answers registry. */
const runnerWith = ({ spawn, costs = [] }) => {
  const answers = createAgentAnswers()
  const spawned = []
  const queue = [...costs]
  const runner = createSpawnAgentRunner({
    spawn: async (args) => {
      spawned.push(args)
      return spawn(args, answers)
    },
    answers,
    pluginName: 'skraft',
    sessionCostUsd: async () => (queue.length > 0 ? queue.shift() : null),
  })
  return { runner, answers, spawned }
}

test('the dispatch spawns skraft:<agent> with the brief and the label, and answers the subagent turn', async () => {
  const { runner, spawned } = runnerWith({
    spawn: (args, answers) => {
      answers.complete({ agentId: 'a1', answer: 'research written', reason: 'answer' })
      return { model: 'm', agentId: 'a1' }
    },
  })

  assert.deepEqual(await runner.run(DISPATCH), { ok: true, text: 'research written' })
  assert.deepEqual(spawned, [{ prompt: '## Skraft dispatch', subagentType: 'skraft:solution-researcher', description: 'skraft checkout · research · attempt 1' }])
})

test('a dispatch naming a model family spawns the subagent on it', async () => {
  const { runner, spawned } = runnerWith({
    spawn: (args, answers) => {
      answers.complete({ agentId: `a${spawned.length}`, answer: 'reviewed', reason: 'answer' })
      return { agentId: `a${spawned.length}` }
    },
  })

  await runner.runMany([{ ...DISPATCH, model: 'sonnet' }, { ...REPOSITORY_DISPATCH, model: 'opus' }])

  assert.deepEqual(spawned.map(({ subagentType, model }) => [subagentType, model]), [['skraft:solution-researcher', 'sonnet'], ['acme-security-reviewer', 'opus']])
})

test('a repository agent is spawned under its own id, and named so when it cannot start or ends without an answer', async () => {
  const answered = runnerWith({
    spawn: (args, answers) => {
      answers.complete({ agentId: 'r1', answer: 'reviewed', reason: 'answer' })
      return { model: 'm', agentId: 'r1' }
    },
  })
  assert.deepEqual(await answered.runner.run(REPOSITORY_DISPATCH), { ok: true, text: 'reviewed' })
  assert.deepEqual(answered.spawned, [{ prompt: '## Skraft dispatch', subagentType: 'acme-security-reviewer', description: 'skraft checkout · security · attempt 1' }])

  assert.equal((await runnerWith({ spawn: () => ({ model: 'm' }) }).runner.run(REPOSITORY_DISPATCH)).error, 'acme-security-reviewer was not started')
  assert.equal((await runnerWith({ spawn: () => { throw new Error('unknown') } }).runner.run(REPOSITORY_DISPATCH)).error, 'acme-security-reviewer could not be started: unknown')
  const aborted = runnerWith({
    spawn: (args, answers) => {
      answers.complete({ agentId: 'r2', reason: 'aborted' })
      return { model: 'm', agentId: 'r2' }
    },
  })
  assert.equal((await aborted.runner.run(REPOSITORY_DISPATCH)).error, 'acme-security-reviewer ended: aborted')
})

test('an answer that completes after the spawn resolved is matched by its agentId, not another one', async () => {
  const { runner, answers } = runnerWith({ spawn: () => ({ model: 'm', agentId: 'a2' }) })

  const pending = runner.run(DISPATCH)
  await new Promise((resolve) => setImmediate(resolve))
  answers.complete({ agentId: 'other', answer: 'not mine', reason: 'answer' })
  answers.complete({ answer: 'main loop', reason: 'answer' })
  answers.complete({ agentId: 'a2', answer: 'mine', reason: 'answer' })

  assert.deepEqual(await pending, { ok: true, text: 'mine' })
})

test('a refused spawn, or one with no agentId, is an agent the host cannot start', async () => {
  const denied = runnerWith({ spawn: () => ({ deny: 'agent type skraft:solution-researcher not found' }) })
  assert.deepEqual(await denied.runner.run(DISPATCH), {
    ok: false, text: '', unavailable: true, error: 'agent type skraft:solution-researcher not found',
  })

  const anonymous = runnerWith({ spawn: () => ({ model: 'm' }) })
  assert.deepEqual(await anonymous.runner.run(DISPATCH), {
    ok: false, text: '', unavailable: true, error: 'skraft:solution-researcher was not started',
  })

  const rejected = runnerWith({ spawn: () => { throw 'no session' } })
  assert.deepEqual(await rejected.runner.run(DISPATCH), {
    ok: false, text: '', unavailable: true, error: 'skraft:solution-researcher could not be started: no session',
  })
})

test('a turn that did not end on an answer is not ok, and says why', async () => {
  const { runner } = runnerWith({
    spawn: (args, answers) => {
      answers.complete({ agentId: 'a3', reason: 'aborted' })
      return { model: 'm', agentId: 'a3' }
    },
  })

  assert.deepEqual(await runner.run(DISPATCH), { ok: false, text: '', error: 'skraft:solution-researcher ended: aborted' })
})

test('the dispatch reports the session cost it added, and none when the session keeps no cost', async () => {
  const answering = (id) => (args, answers) => {
    answers.complete({ agentId: id, answer: 'ok', reason: 'answer' })
    return { model: 'm', agentId: id }
  }
  assert.equal((await runnerWith({ spawn: answering('c1'), costs: [0.5, 0.75] }).runner.run(DISPATCH)).costUsd, 0.25)
  assert.equal((await runnerWith({ spawn: answering('c2'), costs: [0.5, 0.5] }).runner.run(DISPATCH)).costUsd, 0)
  assert.ok(!('costUsd' in (await runnerWith({ spawn: answering('c3'), costs: [null, 0.75] }).runner.run(DISPATCH))))
  assert.ok(!('costUsd' in (await runnerWith({ spawn: answering('c4'), costs: [0.5, null] }).runner.run(DISPATCH))))
  assert.ok(!('costUsd' in (await runnerWith({ spawn: answering('c5'), costs: [0.75, 0.5] }).runner.run(DISPATCH))))
})

test('answers nobody waits for are kept up to a bound, oldest dropped first', async () => {
  const answers = createAgentAnswers({ keep: 2 })
  answers.complete({ agentId: 'x1', answer: 'one', reason: 'answer' })
  answers.complete({ agentId: 'x2', answer: 'two', reason: 'answer' })
  answers.complete({ agentId: 'x3', answer: 'three', reason: 'answer' })

  assert.equal((await answers.wait('x2')).answer, 'two')
  assert.equal((await answers.wait('x3')).answer, 'three')
  let dropped = 'pending'
  void answers.wait('x1').then((turn) => { dropped = turn.answer })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(dropped, 'pending')
  answers.complete({ agentId: 'x1', answer: 'again', reason: 'answer' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(dropped, 'again')
})

test('a kept answer is handed out once', async () => {
  const answers = createAgentAnswers()
  answers.complete({ agentId: 'y1', answer: 'first', reason: 'answer' })
  assert.equal((await answers.wait('y1')).answer, 'first')
  let second = 'pending'
  void answers.wait('y1').then((turn) => { second = turn.answer })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(second, 'pending')
})
