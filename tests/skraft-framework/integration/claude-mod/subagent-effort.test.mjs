import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { nodeModFs, scriptedModHost, stops } from './support/scripted-mod-host.mjs'

/** A subagent that stops its phase; what `driver.stepEffort` answers for it is read once its spawn resolved, before its turn completes. */
const readingItsEffort = (mod, seen) => async (spawn, host) => {
  await stops()(spawn, { answer: () => ({}) })
  let agentId
  const answer = host.answerAfter(spawn, new Promise((resolve) => setImmediate(resolve)).then(() => seen.push(mod.driver.stepEffort(agentId))))
  agentId = answer.agentId
  return answer
}

test('the effort skraft-config.json gives the dispatch\'s family on Claude Code reaches the subagent\'s model requests through turn.step, by its agentId, and only while it runs', async () => {
  const seen = []
  const mod = await scriptedModHost({ behaviours: [(spawn, host) => readingItsEffort(mod, seen)(spawn, host)] })
  try {
    await nodeModFs.write(join(mod.home, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { 'claude-code': { model: 'sonnet', effort: 'high' } } } }))
    await mod.command('checkout')
    const outcome = await mod.settled()

    assert.equal(outcome?.status, 'blocked')
    assert.deepEqual(seen, ['high'])
    assert.equal(mod.driver.stepEffort('agent-1'), undefined)
    assert.equal(mod.driver.stepEffort(undefined), undefined)
  } finally {
    await mod.cleanup()
  }
})
