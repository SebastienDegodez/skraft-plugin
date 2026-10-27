import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSkraftCommand } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/command-args.mjs'
import { actsAs, scriptedModHost } from './support/scripted-mod-host.mjs'
import { COMMENT_URL, pullRequestRepository, reviewLlm, TEST_FILE } from '../support/pull-request-repository.mjs'

/** `$.process.run` on the repository's PATH, where gh is the fake forge. @param {NodeJS.ProcessEnv} env */
const runOn = (env) => ([program, ...args], init = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: init.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' && program === 'gh' })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.once('error', reject)
  child.once('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
})

/** The mod on the pull request's working copy, the scripted LLM answering every spawn. @param {ReturnType<typeof pullRequestRepository>} repo @param {object} [options] */
const modOn = async (repo, options = {}) => {
  const mod = await scriptedModHost({ cwd: repo.cwd, otherwise: actsAs(reviewLlm()), ...options })
  mod.host.run = runOn(repo.env)
  return mod
}

test('/skraft review <number> [--publish] is a review request, never a slug', () => {
  assert.deepEqual(parseSkraftCommand('review 12'), { command: 'review', number: 12, publish: false })
  assert.deepEqual(parseSkraftCommand('review --publish 12'), { command: 'review', number: 12, publish: true })
  assert.deepEqual(parseSkraftCommand('review 12 --publish'), { command: 'review', number: 12, publish: true })
  assert.deepEqual(parseSkraftCommand('review'), { command: 'review', number: null, publish: false })
  assert.deepEqual(parseSkraftCommand('review 012'), { command: 'review', number: null, publish: false })
  assert.deepEqual(parseSkraftCommand('review 12 13'), { command: 'review', number: null, publish: false })
  assert.deepEqual(parseSkraftCommand('review twelve'), { command: 'review', number: null, publish: false })
})

test('/skraft review 12 spawns the lenses together, then the refuter, and notifies NEEDS_REWORK on the weakened assertion', async (t) => {
  const repo = pullRequestRepository(t)
  const mod = await modOn(repo)

  assert.equal(await mod.command('review 12'), 'skraft review #12 started — progress in the Skraft pane.')
  const outcome = await mod.settled()

  assert.deepEqual([outcome.status, outcome.reasons], ['NEEDS_REWORK', [`test-integrity F1 G9 blocker at ${TEST_FILE}:7: Assert.Equal(90m, total) became Assert.NotNull(total)`]])
  assert.deepEqual(mod.spawns.map(({ subagentType }) => subagentType), ['skraft:test-integrity-lens', 'skraft:architecture-boundaries-lens', 'skraft:cold-reader-lens', 'skraft:finding-refuter'])
  assert.deepEqual(mod.notes, ['skraft review #12: NEEDS_REWORK — NEEDS_REWORK: 1 reason to address'])
  assert.ok(mod.published.at(-1).log.includes('pr-12: review of pull request #12 (test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity)'), mod.published.at(-1).log.join('\n'))
  const events = readFileSync(join(repo.cwd, '.copilot-tracking', 'skraft-reviews', 'pr-12', 'events.jsonl'), 'utf8')
  assert.ok(events.includes('"outcome":"needs-rework"'))
  assert.equal(await mod.command('review 12'), 'skraft review #12 started — progress in the Skraft pane.')
  await mod.settled()
})

test('/skraft review 12 --publish asks the consent in the dialog, then keeps one comment on the pull request', async (t) => {
  const repo = pullRequestRepository(t)
  const mod = await modOn(repo)

  await mod.command('review 12 --publish')
  const outcome = await mod.settled()

  assert.equal(outcome.comment, COMMENT_URL)
  assert.deepEqual(mod.asked.map(({ options }) => options), [{ options: ['ACCEPTED', 'DECLINED'], header: 'Review comment' }])
  assert.equal(repo.forge.state().comments.length, 1)
  assert.deepEqual(JSON.parse(readFileSync(join(`${repo.cwd}-home`, '.skraft', 'config.json'), 'utf8')).reviewComments, { 'github.example.com/acme/shop': { accepted: true, questionVersion: 1 } })
})

test('/skraft review without a number says how to type it; a second review waits for the first', async (t) => {
  const repo = pullRequestRepository(t)
  const mod = await modOn(repo)
  mod.host.later = () => {}

  assert.equal(await mod.command('review'), 'skraft: /skraft review <pull request number> [--publish]')
  assert.equal(await mod.command('review 12'), 'skraft review #12 started — progress in the Skraft pane.')
  assert.equal(await mod.command('review 12'), 'skraft is already running review #12; see the Skraft pane.')
})
