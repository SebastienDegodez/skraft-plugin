import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { copilotHost, fillsOutputs, journalLines, simulatedContext, stops, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { scriptedModHost } from '../claude-mod/support/scripted-mod-host.mjs'

const SLUG = 'checkout'
const keysOf = (home) => join(home, '.skraft', 'journal-keys')
/** Each line's `sig` against the HMAC-SHA-256 Node computes over the line without it. */
const checkSignatures = async (lines, keyFile) => {
  const key = Buffer.from((await readFile(keyFile, 'utf8')).trim(), 'hex')
  for (const line of lines) {
    const { sig } = JSON.parse(line)
    assert.equal(sig, createHmac('sha256', key).update(line.replace(/,"sig":"[0-9a-f]{64}"}$/, '}'), 'utf8').digest('hex'))
  }
}

test('the Copilot workflow signs each line with HMAC-SHA-256 under a key kept in the home folder, outside the working copy', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  const { home } = copilotHost(cwd)
  t.after(cleanup)
  t.after(() => rm(home, { recursive: true, force: true }))
  const { ctx } = simulatedContext({ args: { slug: SLUG }, behaviours: [fillsOutputs(), stops()] })

  await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  const lines = await journalLines(cwd, SLUG)
  const { keyId } = JSON.parse(lines[0])
  assert.match(keyId, /^[0-9a-f]{32}$/)
  assert.deepEqual(await readdir(keysOf(home)), [`${keyId}.key`])
  assert.match(await readFile(join(keysOf(home), `${keyId}.key`), 'utf8'), /^[0-9a-f]{64}\n$/)
  await checkSignatures(lines, join(keysOf(home), `${keyId}.key`))
})

test('a journal whose key is gone from the home folder blocks the next run before any agent', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  const { home } = copilotHost(cwd)
  t.after(cleanup)
  t.after(() => rm(home, { recursive: true, force: true }))
  await runSkraftPipelineWorkflow(simulatedContext({ args: { slug: SLUG }, behaviours: [fillsOutputs(), stops()] }).ctx, copilotHost(cwd))
  await rm(keysOf(home), { recursive: true })
  const resumed = simulatedContext({ args: { slug: SLUG }, behaviours: [] })

  const outcome = await runSkraftPipelineWorkflow(resumed.ctx, copilotHost(cwd))

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: null, code: 'journal-unverifiable',
    reason: 'journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine; restore it from the machine that started the run, or start a new slug',
  })
  assert.deepEqual(resumed.calls, [])
})

test('the Claude Code mod signs the journal with the same key form, in the home folder $.env names', async (t) => {
  const mod = await scriptedModHost({ behaviours: [stops()] })
  t.after(mod.cleanup)

  await mod.command(SLUG)
  await mod.settled()

  const lines = (await readFile(mod.journalPath(SLUG), 'utf8')).split('\n').filter(Boolean)
  const { keyId } = JSON.parse(lines[0])
  assert.equal(existsSync(join(mod.root, '.skraft')), false)
  await checkSignatures(lines, join(keysOf(mod.home), `${keyId}.key`))
})
