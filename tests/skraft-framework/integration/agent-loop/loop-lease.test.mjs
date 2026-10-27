import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { join } from 'node:path'
import { actsAs, copilotHost, simulatedContext, trackingDir } from '../copilot-workflow/simulated-host.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { journal, skraft } from '../support/workspace.mjs'
import { lockPath } from '../support/lease.mjs'
import { loop, startAgents } from './simulated-conductor.mjs'

const LEASE = /^([0-9a-f-]{36}) (\S+) (\S+) 1800000\n$/

test('between next and record the loop keeps the pipeline\'s lease for its agent: another host is refused until the run ends', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd })

  const { step } = await loop(cwd, ['next'])

  assert.equal(step.status, 'dispatch')
  const [, owner] = LEASE.exec(readFileSync(lockPath(cwd, SLUG), 'utf8')) ?? []
  assert.ok(owner, readFileSync(lockPath(cwd, SLUG), 'utf8'))
  const other = simulatedContext({ args: {}, otherwise: actsAs(llm) })
  assert.equal((await runSkraftPipelineWorkflow(other.ctx, copilotHost(cwd))).code, 'pipeline-locked')
  assert.deepEqual(other.calls, [])

  startAgents(step, llm)
  const recorded = await loop(cwd, ['record'])
  assert.equal(recorded.step.status, 'dispatch')
  assert.equal(LEASE.exec(readFileSync(lockPath(cwd, SLUG), 'utf8'))?.[1], owner)
  let last = recorded.step
  while (last.status === 'dispatch' || last.status === 'waiting') {
    if (last.status === 'dispatch') startAgents(last, llm)
    else await skraft(cwd, ['decide', JSON.parse((await skraft(cwd, ['status', '--json'])).stdout).question.options[0]])
    ;({ step: last } = await loop(cwd, [last.status === 'dispatch' ? 'record' : 'next']))
  }

  assert.equal(last.status, 'done')
  assert.equal(existsSync(lockPath(cwd, SLUG)), false)
})

const pendingOf = (cwd) => JSON.parse(readFileSync(join(trackingDir(cwd, SLUG), 'results', 'loop', 'pending.json'), 'utf8'))
const agentsOf = (steps) => steps.dispatches.map(({ agent }) => agent)

test('a record after another host took the pipeline over is lost, records nothing, and the next next goes on from the journal', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd })
  const { step } = await loop(cwd, ['next'])
  startAgents(step, llm)
  writeFileSync(lockPath(cwd, SLUG), `another-host ${new Date().toISOString()} ${new Date().toISOString()}\n`)
  const before = journal(cwd, SLUG).length

  const late = await loop(cwd, ['record'])

  assert.deepEqual([late.exit, late.step.status, late.step.code], [1, 'blocked', 'lock-lost'])
  assert.equal(journal(cwd, SLUG).length, before)
  assert.deepEqual(pendingOf(cwd).dispatches, [])
  rmSync(lockPath(cwd, SLUG))
  const again = await loop(cwd, ['next'])
  assert.deepEqual([again.exit, again.step.status], [0, 'dispatch'])
})

test('a second record while the first one drives the run is refused and leaves the agents pending', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const { step } = await loop(cwd, ['next'])
  startAgents(step, scriptedLlm({ cwd }))
  const [owner] = readFileSync(lockPath(cwd, SLUG), 'utf8').split(' ')
  const now = new Date().toISOString()
  writeFileSync(lockPath(cwd, SLUG), `${owner} ${now} ${now}\n`)

  const second = await loop(cwd, ['record'])

  assert.deepEqual([second.step.status, second.step.code], ['refused', 'pipeline-locked'])
  assert.deepEqual(pendingOf(cwd).dispatches.map(({ agent }) => agent), agentsOf(step))
})

test('a record stopped once it took the lease back marks its agents taken; the next record picks them up as any session, with the replies saved', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const { step } = await loop(cwd, ['next'])
  startAgents(step, scriptedLlm({ cwd }))
  // The machine fails the run right after the take-back: the configuration cannot be read.
  const config = join(cwd, 'skraft-config.json')
  const saved = readFileSync(config, 'utf8')
  rmSync(config)
  mkdirSync(config)

  await assert.rejects(loop(cwd, ['record']))

  assert.equal(pendingOf(cwd).taken, true)
  assert.deepEqual(pendingOf(cwd).dispatches.map(({ agent }) => agent), agentsOf(step))
  assert.equal(existsSync(lockPath(cwd, SLUG)), false)
  assert.equal((await loop(cwd, ['next'])).step.code, 'not-recorded')
  rmSync(config, { recursive: true })
  writeFileSync(config, saved)

  const resumed = await loop(cwd, ['record'])

  assert.equal(resumed.step.status, 'dispatch')
  assert.deepEqual(agentsOf(resumed.step), ['solution-architect'])
  assert.ok(journal(cwd, SLUG).some((event) => event.type === 'step.recorded' && event.step === 'research' && event.outcome === 'done'))
  assert.deepEqual(pendingOf(cwd).taken, undefined)
})

test('a record whose agents cannot be marked taken leaves them and its lease to a retry, which records them', { skip: process.platform === 'win32' && 'a read-only file is refused only on POSIX here' }, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const { step } = await loop(cwd, ['next'])
  startAgents(step, scriptedLlm({ cwd }))
  const pending = join(trackingDir(cwd, SLUG), 'results', 'loop', 'pending.json')
  chmodSync(pending, 0o444)

  await assert.rejects(loop(cwd, ['record']))

  chmodSync(pending, 0o644)
  assert.match(readFileSync(lockPath(cwd, SLUG), 'utf8'), / 1800000\n$/)
  assert.deepEqual(pendingOf(cwd).dispatches.map(({ agent }) => agent), agentsOf(step))
  const retried = await loop(cwd, ['record'])
  assert.deepEqual([retried.step.status, agentsOf(retried.step)], ['dispatch', ['solution-architect']])
  assert.ok(journal(cwd, SLUG).some((event) => event.type === 'step.recorded' && event.step === 'research' && event.outcome === 'done'))
})

test('a record refused before it reaches the lease leaves the agents pending', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const { step } = await loop(cwd, ['next'])
  startAgents(step, scriptedLlm({ cwd }))
  rmSync(join(`${cwd}-home`, '.skraft', 'journal-keys'), { recursive: true })

  const refused = await loop(cwd, ['record'])

  assert.equal(refused.step.code, 'journal-unverifiable')
  assert.deepEqual(pendingOf(cwd).dispatches.map(({ agent }) => agent), agentsOf(step))
})
