import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createNodeRunLock } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/lock-file.mjs'
import { lockCommand } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/lock-file-command.mjs'
import { copilotHost, fillsOutputs, journalLines, simulatedContext, stops, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { scriptedModHost } from '../claude-mod/support/scripted-mod-host.mjs'
import { leaseLeftToExpire, lockPath } from '../support/lease.mjs'
import { otherSession } from './other-process.mjs'

const SLUG = 'checkout'
const CREATOR = fileURLToPath(new URL('./creator.mjs', import.meta.url))
const COMMAND = fileURLToPath(new URL('../../../../plugins/skraft-framework/engine/infrastructure/tracking/lock-file-command.mjs', import.meta.url))
const ARCHITECT_BLOCKED = 'solution-architect is blocked: needs a decision on the payment provider'

/** The pipeline run by the Copilot workflow, its agents behaving as given. */
const copilotRun = async (cwd, behaviours = []) => {
  const run = simulatedContext({ args: { slug: SLUG }, behaviours })
  return { outcome: await runSkraftPipelineWorkflow(run.ctx, copilotHost(cwd)), calls: run.calls }
}

const withCopy = (body) => async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await body(cwd)
}

test('a session in another process drives the pipeline: the Copilot workflow is refused and calls no agent; once that session ends, the run goes', withCopy(async (cwd) => {
  const other = otherSession(cwd, SLUG)
  assert.equal(await other.said(), 'held')

  const refused = await copilotRun(cwd)
  assert.equal(refused.outcome.status, 'refused')
  assert.equal(refused.outcome.code, 'pipeline-locked')
  assert.match(refused.outcome.reason, /^checkout is driven by another session \(started \S+, last seen \S+\); let it finish or stop it, or run again after \S+ if that session is gone$/)
  assert.deepEqual(refused.calls, [])
  assert.deepEqual((await journalLines(cwd, SLUG)).map((line) => JSON.parse(line).type), ['run.started'])

  await other.release()
  const resumed = await copilotRun(cwd, [fillsOutputs(), stops()])

  assert.equal(resumed.outcome.reason, ARCHITECT_BLOCKED)
  assert.equal(existsSync(lockPath(cwd, SLUG)), false)
}))

test('a session killed while it drives the pipeline leaves its lease, which the next session takes once it expired', withCopy(async (cwd) => {
  const other = otherSession(cwd, SLUG)
  assert.equal(await other.said(), 'held')
  await other.kill()

  assert.equal((await copilotRun(cwd)).outcome.code, 'pipeline-locked')
  await leaseLeftToExpire(cwd, SLUG)
  const resumed = await copilotRun(cwd, [fillsOutputs(), stops()])

  assert.equal(resumed.outcome.reason, ARCHITECT_BLOCKED)
  assert.equal(existsSync(lockPath(cwd, SLUG)), false)
}))

test('a session in another process drives the pipeline: the Claude Code mod is refused and spawns no agent', withCopy(async (cwd) => {
  const other = otherSession(cwd, SLUG)
  assert.equal(await other.said(), 'held')
  const mod = await scriptedModHost({ cwd })

  await mod.command(SLUG)
  const outcome = await mod.settled()

  assert.equal(outcome.code, 'pipeline-locked')
  assert.deepEqual(mod.spawns, [])
  assert.match(mod.notes.at(-1), /^skraft checkout: refused \(pipeline-locked\) — checkout is driven by another session/)
  await other.release()
  assert.equal(existsSync(lockPath(cwd, SLUG)), false)
}))

/** Runs the lock-file command in its own process; resolves with its exit code. */
const commandProcess = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [COMMAND, ...args], { stdio: 'ignore' })
  child.once('error', reject)
  child.once('exit', resolve)
})

const folder = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-lock-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return join(dir, '.copilot-tracking', 'skraft-plans', SLUG, '.lock')
}

test('processes creating the lock file at once: exactly one creates it, with its whole text', async (t) => {
  const path = await folder(t)
  const texts = [1, 2, 3, 4, 5, 6].map((index) => `session-${index} 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n`)

  const exits = await Promise.all(texts.map((text) => commandProcess(['create', path, encodeURIComponent(text)])))

  assert.deepEqual(exits.filter((code) => code === 0).length, 1)
  assert.deepEqual(exits.filter((code) => code !== 0), [3, 3, 3, 3, 3])
  assert.equal(await readFile(path, 'utf8'), texts[exits.indexOf(0)])
  assert.deepEqual(await readdir(dirname(path)), ['.lock'])
})

test('processes taking over the same lease at once: exactly one replaces it, and no file is left aside', async (t) => {
  const path = await folder(t)
  const gone = 'session-0 2026-10-11T08:00:00.000Z 2026-10-11T08:00:00.000Z\n'
  await lockCommand(['create', path, encodeURIComponent(gone)])
  const texts = [1, 2, 3, 4, 5, 6].map((index) => `session-${index} 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n`)

  const exits = await Promise.all(texts.map((text) => commandProcess(['replace', path, encodeURIComponent(gone), encodeURIComponent(text)])))

  assert.deepEqual(exits.filter((code) => code === 0).length, 1)
  assert.equal(await readFile(path, 'utf8'), texts[exits.indexOf(0)])
  assert.deepEqual(await readdir(dirname(path)), ['.lock'])
})

test('a session renewing its lease never leaves the lock file free for a session that starts meanwhile', async (t) => {
  const path = await folder(t)
  const lock = createNodeRunLock({ root: dirname(dirname(dirname(dirname(path)))), owner: 'session-a' })
  const lease = (renewal) => `session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:${String(renewal % 60).padStart(2, '0')}.${String(renewal).padStart(3, '0').slice(-3)}Z\n`
  await lock.create(SLUG, lease(0))
  const creator = spawn(process.execPath, [CREATOR, path], { stdio: ['pipe', 'pipe', 'inherit'] })
  creator.stdout.setEncoding('utf8')
  const lines = []
  const said = () => new Promise((resolve) => {
    const next = () => (lines.length > 0 ? resolve(lines.shift()) : creator.stdout.once('data', (text) => { lines.push(...text.split('\n').filter(Boolean)); next() }))
    next()
  })
  assert.equal(await said(), 'ready')

  const refused = []
  for (let renewal = 1; renewal <= 300; renewal += 1) {
    if (!(await lock.renew(SLUG, lease(renewal - 1), lease(renewal)))) refused.push(renewal)
    if (refused.length > 0) break
  }
  creator.stdin.write('stop\n')

  assert.deepEqual({ refused, created: await said() }, { refused: [], created: '0' })
  assert.equal(await lock.read(SLUG), lease(300))
})

test('the lock file on Node: created once, replaced or removed only while it holds what was seen', async (t) => {
  const path = await folder(t)
  const root = dirname(dirname(dirname(dirname(path))))
  const lock = createNodeRunLock({ root, owner: 'session-a' })

  assert.equal(lock.owner, 'session-a')
  assert.equal(await lock.read(SLUG), null)
  assert.equal(await lock.replace(SLUG, 'a', 'b'), false)
  assert.equal(await lock.create(SLUG, 'a'), true)
  assert.equal(await lock.create(SLUG, 'b'), false)
  assert.equal(await lock.replace(SLUG, 'b', 'c'), false)
  assert.equal(await lock.read(SLUG), 'a')
  assert.equal(await lock.replace(SLUG, 'a', 'c'), true)
  assert.equal(await lock.read(SLUG), 'c')
  assert.equal(await lock.renew(SLUG, 'b', 'd'), false)
  assert.equal(await lock.renew(SLUG, 'c', 'd'), true)
  assert.equal(await lock.read(SLUG), 'd')
  assert.equal(await lock.replace(SLUG, 'd', null), true)
  assert.equal(await lock.renew(SLUG, 'd', 'e'), false)
  assert.equal(await lock.read(SLUG), null)
  assert.deepEqual(await readdir(dirname(path)), [])
  assert.notEqual(createNodeRunLock({ root }).owner, createNodeRunLock({ root }).owner)
})

test('the lock-file command answers 0 when done, 3 when refused, and refuses a verb it does not know', async (t) => {
  const path = await folder(t)
  const text = encodeURIComponent('session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n')

  assert.equal(await lockCommand(['create', path, text]), 0)
  assert.equal(await lockCommand(['create', path, text]), 3)
  assert.equal(await lockCommand(['replace', path, encodeURIComponent('other'), text]), 3)
  assert.equal(await lockCommand(['renew', path, encodeURIComponent('other'), text]), 3)
  assert.equal(await lockCommand(['renew', path, text, encodeURIComponent('renewed')]), 0)
  assert.equal(await lockCommand(['renew', path, encodeURIComponent('renewed'), text]), 0)
  assert.equal(await lockCommand(['remove', path, text]), 0)
  assert.equal(existsSync(path), false)
  await assert.rejects(lockCommand(['steal', path]), /usage: lock-file-command\.mjs create\|replace\|renew\|remove <path> <text>…, make-key <home>/)
  const home = join(dirname(path), 'home')
  const printed = []
  assert.equal(await lockCommand(['make-key', home], (text) => printed.push(text)), 0)
  const { id, key } = JSON.parse(printed.join(''))
  assert.match(`${id} ${key}`, /^[0-9a-f]{32} [0-9a-f]{64}$/)
  assert.equal(await readFile(join(home, '.skraft', 'journal-keys', `${id}.key`), 'utf8'), `${key}\n`)
  const homes = []
  assert.equal(await lockCommand(['home'], (text) => homes.push(text)), 0)
  assert.deepEqual(homes, [`${homedir()}\n`])
  await writeFile(path, 'x')
  assert.equal(await commandProcess(['remove', path, encodeURIComponent('x')]), 0)
  assert.equal(existsSync(path), false)
})
