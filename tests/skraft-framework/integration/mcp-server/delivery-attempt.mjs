import assert from 'node:assert/strict'
import { scriptedLlm } from '../support/pipeline-repository.mjs'
import { skraft } from '../support/workspace.mjs'
import { loop, startAgents } from '../agent-loop/simulated-conductor.mjs'

/** Conducts the loop until the software engineer is dispatched, and leaves its attempt open. @param {string} cwd */
export const toDeliveryAttempt = async (cwd) => {
  const llm = scriptedLlm({ cwd })
  let { step } = await loop(cwd, ['next'])
  for (let turns = 0; turns < 100; turns += 1) {
    if (step.status === 'dispatch' && step.dispatches.some(({ agent }) => agent === 'software-engineer')) return step
    if (step.status === 'dispatch') {
      startAgents(step, llm)
      ;({ step } = await loop(cwd, ['record']))
    } else {
      assert.equal(step.status, 'waiting', step.reason)
      const { question } = JSON.parse((await skraft(cwd, ['status', '--json'])).stdout)
      await skraft(cwd, ['decide', question.key, question.options[0]])
      ;({ step } = await loop(cwd, ['next']))
    }
  }
  throw new Error('the software engineer was never dispatched')
}
