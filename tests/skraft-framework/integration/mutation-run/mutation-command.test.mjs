import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pipelineRepository } from '../support/pipeline-repository.mjs'
import { startAgents } from '../agent-loop/simulated-conductor.mjs'
import { SKRAFT_COMMAND, commitAll, git, skraft } from '../support/workspace.mjs'

const BRANCH = 'feat/Card_Refund'
const SLUG = 'feat-card-refund'

/** A mutation command that writes `scopes` as its result to the file SKRAFT_MUTATION_RESULT names. */
const writesResult = (scopes) => [
  "import { writeFileSync } from 'node:fs'",
  `writeFileSync(process.env.SKRAFT_MUTATION_RESULT, JSON.stringify({ scopes: ${JSON.stringify(scopes)} }))`,
  '',
].join('\n')

/** The payment repository on BRANCH, its mutation command writing `scopes`. */
const onBranch = (t, scopes) => {
  const { cwd } = pipelineRepository(t)
  git(cwd, 'checkout', '-q', '-b', BRANCH)
  writeFileSync(join(cwd, 'tools', 'mutate.mjs'), writesResult(scopes))
  commitAll(cwd)
  return cwd
}

/** The journal of the branch's mutation run. @param {string} cwd */
const mutationJournal = (cwd) => readFileSync(join(cwd, '.copilot-tracking', 'skraft-mutation', SLUG, 'events.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))

/** @param {string} cwd @param {string[]} args */
const mutation = async (cwd, args = []) => {
  const run = await skraft(cwd, ['mutation', ...args, '--json'])
  return { ...run, step: JSON.parse(run.stdout) }
}

test('skraft mutation mutates the branch HEAD is on, in its own run apart from the pipelines, and the next one starts afresh', async (t) => {
  const cwd = onBranch(t, [{ name: 'global', score: 91 }])

  const first = await mutation(cwd)

  assert.equal(first.status, 0, first.stderr)
  assert.deepEqual(first.step, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: first.step.reason, dispatches: [], then: null })
  assert.deepEqual(mutationJournal(cwd).filter(({ type }) => type === 'gate.ran').map(({ gate, status }) => [gate, status]), [['mutation', 'pass']])
  assert.equal(readFileSync(join(cwd, '.copilot-tracking', 'skraft-mutation', '.active-slug'), 'utf8'), `${SLUG}\n`)
  assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft-plans')), false)

  const second = await mutation(cwd)

  assert.equal(second.step.status, 'done', second.step.reason)
  assert.deepEqual(mutationJournal(cwd).filter(({ type }) => type === 'run.started').length, 1)
  const doctor = JSON.parse((await skraft(cwd, ['doctor', '--json'])).stdout)
  assert.deepEqual(doctor.checks.find(({ subject }) => subject === 'mutation'), {
    subject: 'mutation', status: 'ok', detail: `app declares a mutation command; last run on ${BRANCH}: mutation passed (global 91 %), ended`,
  })
})

test('a branch below the bar hands the proposals over, each with its brief and reply file, then mutation record', async (t) => {
  const cwd = onBranch(t, [{ name: 'global', score: 60, survivors: ['src/pay.mjs:3 ArithmeticOperator'] }])

  const { status, step } = await mutation(cwd)

  assert.equal(status, 0)
  assert.equal(step.status, 'dispatch', step.reason)
  assert.deepEqual(step.dispatches.map(({ agent }) => agent), ['software-engineer'])
  assert.ok(step.dispatches[0].brief.startsWith(join(cwd, '.copilot-tracking', 'skraft-mutation', SLUG)), step.dispatches[0].brief)
  assert.equal(step.then, `${SKRAFT_COMMAND} mutation record`)

  const again = await mutation(cwd)
  assert.deepEqual([again.status, again.step.status, again.step.code], [1, 'refused', 'not-recorded'])
})

/**
 * The proposal agent as the conducting agent starts it: it fills the outcome of each mutant of
 * the proposal its brief names, writes its result, then replies.
 */
const proposes = {
  act: (brief) => {
    const proposal = /^- (\S+kill_proposal-[^\s]+\.md)$/m.exec(brief)[1]
    writeFileSync(proposal, readFileSync(proposal, 'utf8').replace('{{outcome}}', 'test: tests/unit/pay.test.mjs pays 3 and expects 3'))
    const result = /^- Write your result as JSON to (\S+\.json):/m.exec(brief)[1]
    writeFileSync(result, JSON.stringify({ status: 'done', summary: 'one test proposed' }))
    return 'proposed'
  },
}

test('once the proposals are recorded, the run asks the developer for the plan, to answer with mutation decide; STOP ends it and the next start is afresh', async (t) => {
  const cwd = onBranch(t, [{ name: 'global', score: 60, survivors: ['src/pay.mjs:3 ArithmeticOperator'] }])
  const { step: handed } = await mutation(cwd)
  startAgents(handed, proposes)

  const { status, step } = await mutation(cwd, ['record'])

  assert.deepEqual([status, step.status, step.code, step.then], [0, 'waiting', 'mutation-plan', `${SKRAFT_COMMAND} mutation`])
  assert.match(step.reason, new RegExp(`record that native reply with ${SKRAFT_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} mutation decide in a terminal`))
  assert.match(step.reason, /\.copilot-tracking\/skraft-mutation\/feat-card-refund\/proposals\/kill_proposal-1-g1\.md/)

  const decided = await skraft(cwd, ['mutation', 'decide', 'STOP'])
  assert.equal(decided.status, 0, decided.stderr)
  const stopped = await mutation(cwd)
  assert.deepEqual([stopped.step.code, mutationJournal(cwd).at(-1).type], ['stopped', 'run.finished'])

  const { step: afresh } = await mutation(cwd)
  assert.equal(afresh.status, 'dispatch')
  assert.deepEqual(mutationJournal(cwd).filter(({ type }) => type === 'run.started').length, 1)
})

test('mutation record with nothing handed over refuses, and writes nothing', async (t) => {
  const cwd = onBranch(t, [{ name: 'global', score: 91 }])

  const { status, step } = await mutation(cwd, ['record'])

  assert.deepEqual([status, step.status, step.code], [1, 'refused', 'nothing-to-record'])
  assert.equal(existsSync(join(cwd, '.copilot-tracking')), false)
})

test('on a detached HEAD skraft mutation starts nothing, and says why', async (t) => {
  const cwd = onBranch(t, [{ name: 'global', score: 91 }])
  git(cwd, 'checkout', '-q', '--detach')

  const { status, step } = await mutation(cwd)

  assert.deepEqual([status, step.status, step.code, step.slug], [1, 'refused', 'detached-head', null])
  assert.equal(step.reason, 'HEAD is on no branch, and a mutation run is the run of one; check out the branch to mutate, then start it again')
  assert.deepEqual(readdirSync(cwd).includes('.copilot-tracking'), false)
})

test('skraft mutation takes record and decide, and --json, else the usage', async (t) => {
  const cwd = onBranch(t, [{ name: 'global', score: 91 }])

  for (const args of [['mutation', '--pr', '3'], ['mutation', 'next'], ['mutation', 'record', 'now']]) {
    const run = await skraft(cwd, args)
    assert.equal(run.status, 2, args.join(' '))
    assert.match(run.stderr, /skraft mutation \[--json\]/)
  }
})
