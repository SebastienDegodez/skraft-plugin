import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logMatches, readTrace } from '../../../../plugins/skraft-framework/engine/application/evidence/run-trace-store.mjs'
import { SLUG, pipelineRepository } from '../support/pipeline-repository.mjs'
import { git, inProcessServices, journal, skraft } from '../support/workspace.mjs'
import { toDeliveryAttempt } from '../mcp-server/delivery-attempt.mjs'
import { mcpHost } from '../mcp-server/mcp-host.mjs'

// Real git, real programs, real journal key under a temporary home: what the server traces of a
// run, and what the engine reads back of it.
const BOUNDED = { timeout: 90_000 }
const NODE = JSON.stringify(process.execPath)
const FOLDER = 'logs/runs/deliver-1-1'

const attemptWithRepl = async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()
  t.after(() => host.close())
  return { cwd, host }
}

const traceOf = (cwd) => readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, FOLDER, 'runs.jsonl'), 'utf8')

const readBack = (cwd) => readTrace(inProcessServices(cwd).adapters(), { slug: SLUG, folder: FOLDER, events: journal(cwd, SLUG) })

test('a run is traced with the HEAD of the repository before and after it, a clean tree, the hash of its log, and a signature the engine verifies', BOUNDED, async (t) => {
  const { cwd, host } = await attemptWithRepl(t)
  const head = git(cwd, 'rev-parse', 'HEAD')

  await host.call('skraft_repl', { code: `await gate('test', [${NODE}, '-e', 'console.log("seen")'], { label: 'real' })` })

  const read = await readBack(cwd)
  assert.equal(read.ok, true, read.reason)
  const [started, ended] = read.records
  assert.deepEqual([started.type, started.gate, started.label], ['start', 'test', 'real'])
  assert.deepEqual([ended.type, ended.exitCode, ended.started, ended.headBefore, ended.headAfter, ended.clean], ['run', 0, true, head, head, true])
  const log = readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, ended.log), 'utf8')
  assert.equal(log, 'seen\n')
  assert.equal(ended.sha256, createHash('sha256').update(log).digest('hex'))
  assert.equal(await logMatches(inProcessServices(cwd).adapters(), { slug: SLUG }, ended), true)
})

test('a file written after a run was traced is refused: a line edited, a line added without the key and a log rewritten each show', BOUNDED, async (t) => {
  const { cwd, host } = await attemptWithRepl(t)
  await host.call('skraft_repl', { code: `await gate('test', [${NODE}, '-e', 'process.exit(1)'])` })
  const path = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, FOLDER, 'runs.jsonl')
  const original = traceOf(cwd)

  writeFileSync(path, original.replace('"exitCode":1', '"exitCode":0'))
  const edited = await readBack(cwd)
  writeFileSync(path, `${original}${JSON.stringify({ type: 'run', run: 9, exitCode: 0, gate: 'test' })}\n`)
  const added = await readBack(cwd)
  writeFileSync(path, original)
  const [, ended] = (await readBack(cwd)).records
  writeFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, ended.log), 'tests passed\n')

  assert.deepEqual([edited.ok, edited.reason], [false, "runs.jsonl line 2 does not carry the signature of the run's key"])
  assert.deepEqual([added.ok, added.reason], [false, 'runs.jsonl line 3 is not signed'])
  assert.equal(await logMatches(inProcessServices(cwd).adapters(), { slug: SLUG }, ended), false)
})

test('a run started with a file left uncommitted in the working copy is traced as not clean, and an ignored file does not make it so', BOUNDED, async (t) => {
  const { cwd, host } = await attemptWithRepl(t)
  mkdirSync(join(cwd, 'reports'))
  writeFileSync(join(cwd, 'reports', 'ignored.txt'), 'ignored\n')
  await host.call('skraft_repl', { code: `await gate('lint', [${NODE}, '-e', '0'])` })
  writeFileSync(join(cwd, 'wip.mjs'), 'export {}\n')

  await host.call('skraft_repl', { code: `await gate('lint', [${NODE}, '-e', '0'])` })

  const ended = (await readBack(cwd)).records.filter(({ type }) => type === 'run')
  assert.deepEqual(ended.map(({ clean }) => clean), [true, false])
})
