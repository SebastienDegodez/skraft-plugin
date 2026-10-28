import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { copilotHost, fillsOutputs, journalLines, settled, simulatedContext, stops, workingCopy } from '../copilot-workflow/simulated-host.mjs'
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

  await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)))

  const lines = await journalLines(cwd, SLUG)
  const { keyId } = JSON.parse(lines[0])
  assert.match(keyId, /^[0-9a-f]{32}$/)
  assert.deepEqual(await readdir(keysOf(home)), [`${keyId}.key`])
  assert.match(await readFile(join(keysOf(home), `${keyId}.key`), 'utf8'), /^[0-9a-f]{64}\n$/)
  await checkSignatures(lines, join(keysOf(home), `${keyId}.key`))
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(keysOf(home), `${keyId}.key`))).mode & 0o777, 0o600)
    assert.equal((await stat(keysOf(home))).mode & 0o777, 0o700)
  }
})

test('a journal whose key is gone from the home folder blocks the next run before any agent', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  const { home } = copilotHost(cwd)
  t.after(cleanup)
  t.after(() => rm(home, { recursive: true, force: true }))
  await settled(runSkraftPipelineWorkflow(simulatedContext({ args: { slug: SLUG }, behaviours: [fillsOutputs(), stops()] }).ctx, copilotHost(cwd)))
  await rm(keysOf(home), { recursive: true })
  const resumed = simulatedContext({ args: { slug: SLUG }, behaviours: [] })

  const outcome = await runSkraftPipelineWorkflow(resumed.ctx, copilotHost(cwd))

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: null, code: 'journal-unverifiable',
    reason: 'journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine (unverified: lines 1-11: 1 run.started, 4 step.started, 4 step.recorded, 1 phase.closed, 1 question.asked); restore it from the machine that started the run, or adopt the journal on this machine with skraft journal adopt, typed in your own terminal (its earlier lines stay unverified)',
  })
  assert.deepEqual(resumed.calls, [])
})

test('the Claude Code mod signs the journal with the same key form, kept owner-only in the home folder $.env names, the key on no command line', async (t) => {
  const mod = await scriptedModHost({ behaviours: [stops()] })
  t.after(mod.cleanup)
  const argvs = []
  const run = mod.host.run
  mod.host.run = (argv, init) => {
    argvs.push(argv)
    return run(argv, init)
  }

  await mod.command(SLUG)
  await mod.settled()

  const lines = (await readFile(mod.journalPath(SLUG), 'utf8')).split('\n').filter(Boolean)
  const { keyId } = JSON.parse(lines[0])
  assert.equal(existsSync(join(mod.root, '.skraft')), false)
  await checkSignatures(lines, join(keysOf(mod.home), `${keyId}.key`))
  const key = (await readFile(join(keysOf(mod.home), `${keyId}.key`), 'utf8')).trim()
  assert.deepEqual(argvs.flat().filter((arg) => arg.includes(key)), [])
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(keysOf(mod.home), `${keyId}.key`))).mode & 0o777, 0o600)
    assert.equal((await stat(keysOf(mod.home))).mode & 0o777, 0o700)
  }
})
