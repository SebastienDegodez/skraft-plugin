import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { actsAs, copilotHost, simulatedContext } from '../copilot-workflow/simulated-host.mjs'
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

test('a record after its lease expired and another host took the pipeline over is lost and records nothing', async (t) => {
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
})
