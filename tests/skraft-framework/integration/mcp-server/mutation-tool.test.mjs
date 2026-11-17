import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pipelineRepository } from '../support/pipeline-repository.mjs'
import { commitAll, git } from '../support/workspace.mjs'
import { startAgents } from '../agent-loop/simulated-conductor.mjs'
import { mcpHost } from './mcp-host.mjs'

/** The payment repository on a branch, its mutation command writing a result below the bar. */
const belowTheBar = (t) => {
  const { cwd } = pipelineRepository(t)
  git(cwd, 'checkout', '-q', '-b', 'feat/refund')
  writeFileSync(join(cwd, 'tools', 'mutate.mjs'), [
    "import { writeFileSync } from 'node:fs'",
    "writeFileSync(process.env.SKRAFT_MUTATION_RESULT, JSON.stringify({ scopes: [{ name: 'global', score: 60, survivors: ['src/pay.mjs:3 ArithmeticOperator'] }] }))",
    '',
  ].join('\n'))
  commitAll(cwd)
  return cwd
}

/** The proposal agent: it fills the outcome of its proposal, writes its result, then replies. */
const proposes = {
  act: (brief) => {
    const proposal = /^- (\S+kill_proposal-[^\s]+\.md)$/m.exec(brief)[1]
    writeFileSync(proposal, readFileSync(proposal, 'utf8').replace('{{outcome}}', 'test: tests/unit/pay.test.mjs pays 3 and expects 3'))
    writeFileSync(/^- Write your result as JSON to (\S+\.json):/m.exec(brief)[1], JSON.stringify({ status: 'done', summary: 'one test proposed' }))
    return 'proposed'
  },
}

test('a host that runs its own pipeline conducts the branch\'s mutation run through skraft_mutation alone, the developer\'s plan relayed to it without a terminal', async (t) => {
  const cwd = belowTheBar(t)
  const host = mcpHost({ roots: [cwd], client: 'GitHub Copilot CLI' })
  await host.initialize()

  const handed = await host.json('skraft_mutation')
  assert.deepEqual([handed.status, handed.then], ['dispatch', 'call the skraft_mutation tool with {"record":true}'])
  startAgents(handed, proposes)

  const asked = await host.json('skraft_mutation', { record: true })
  assert.deepEqual([asked.status, asked.code, asked.then], ['waiting', 'mutation-plan', 'call the skraft_mutation tool with {}'])
  assert.match(asked.reason, /Relay ONLY the returned human reply: call the skraft_mutation tool with \{"key":"mutation_plan-1","answer":"<the reply>"\}/)
  assert.doesNotMatch(asked.reason, /skraft_answer|terminal/)

  const recorded = await host.json('skraft_mutation', { key: 'mutation_plan-1', answer: 'STOP' })
  assert.equal(recorded.ok, true, recorded.reason)
  assert.equal((await host.json('skraft_mutation')).code, 'stopped')
  await host.close()
})
