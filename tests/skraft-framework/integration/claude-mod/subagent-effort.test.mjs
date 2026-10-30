import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { nodeModFs, scriptedModHost, stops } from './support/scripted-mod-host.mjs'

const STEP = { turnId: 't1', index: 0, model: 'sonnet', effort: 'medium' }

/** A subagent that stops its phase; the step the driver passes on for it is read once its spawn resolved, before its turn completes. */
const stepping = (mod, seen) => async (spawn, host) => {
  await stops()(spawn, { answer: () => ({}) })
  let agentId
  const answer = host.answerAfter(spawn, new Promise((resolve) => setImmediate(resolve)).then(() => seen.push(mod.driver.turnStep({ ...STEP, agentId }))))
  agentId = answer.agentId
  return answer
}

const withEffortConfigured = (mod) =>
  nodeModFs.write(join(mod.home, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { 'claude-code': { model: 'sonnet', effort: 'high' } } } }))

test('the step of a skraft subagent goes on with the effort skraft-config.json gives its dispatch\'s family on Claude Code, and only while it runs', async () => {
  const seen = []
  const mod = await scriptedModHost({ behaviours: [(spawn, host) => stepping(mod, seen)(spawn, host)] })
  try {
    await withEffortConfigured(mod)
    await mod.command('checkout')
    const outcome = await mod.settled()

    assert.equal(outcome?.status, 'blocked')
    assert.deepEqual(seen, [{ ...STEP, agentId: 'agent-1', effort: 'high' }])
    assert.deepEqual(mod.driver.turnStep({ ...STEP, agentId: 'agent-1' }), { ...STEP, agentId: 'agent-1' })
  } finally {
    await mod.cleanup()
  }
})

test('the step of the main loop and of an agent skraft did not start goes on unchanged', async () => {
  const mod = await scriptedModHost({ behaviours: [stops()] })
  try {
    await withEffortConfigured(mod)
    await mod.command('checkout')
    await mod.settled()

    const main = { ...STEP }
    const stranger = { ...STEP, agentId: 'agent-99' }
    assert.equal(mod.driver.turnStep(main), main)
    assert.equal(mod.driver.turnStep(stranger), stranger)
  } finally {
    await mod.cleanup()
  }
})
