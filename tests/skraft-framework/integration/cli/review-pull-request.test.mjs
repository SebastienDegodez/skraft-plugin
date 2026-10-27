import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tokenLineOf } from '../agent-loop/simulated-conductor.mjs'
import { COMMENT_URL, NUMBER, pullRequestRepository, reviewLlm, TEST_FILE } from '../support/pull-request-repository.mjs'
import { SKRAFT_COMMAND, skraft } from '../support/workspace.mjs'

/** One review command, its step as `--json` prints it. @param {ReturnType<typeof pullRequestRepository>} repo @param {string[]} args @param {object} [options] */
const review = async ({ cwd, env }, args, options = {}) => {
  const run = await skraft(cwd, ['review', '--pr', String(NUMBER), ...args, '--json'], { env, ...options })
  return { exit: run.status, step: JSON.parse(run.stdout), progress: run.stderr }
}

/** Starts each agent the step hands over with the scripted LLM, its reply saved with the brief's token. */
const startAgents = (step, llm) => {
  for (const { brief, reply } of step.dispatches) {
    const text = readFileSync(brief, 'utf8')
    writeFileSync(reply, `${llm.act(text)}\n${tokenLineOf(text)}\n`)
  }
}

/** The review conducted from its first command until it ends. */
const conduct = async (repo, llm, args = [], options = {}) => {
  const steps = []
  let run = await review(repo, args, options)
  while (run.step.status === 'dispatch') {
    steps.push(run.step)
    startAgents(run.step, llm)
    run = await review(repo, ['--record', ...args], options)
  }
  return { ...run, steps }
}

test('skraft review --pr hands the lenses, then the refuter, to the conducting agent and ends NEEDS_REWORK on the weakened assertion, its journal under skraft-reviews/', async (t) => {
  const repo = pullRequestRepository(t)
  const llm = reviewLlm()

  const { exit, step, steps } = await conduct(repo, llm)

  assert.equal(exit, 1)
  assert.deepEqual([step.status, step.pass, step.reasons], ['NEEDS_REWORK', 1, [`test-integrity F1 G9 blocker at ${TEST_FILE}:7: Assert.Equal(90m, total) became Assert.NotNull(total)`]])
  assert.deepEqual(steps.map(({ dispatches }) => dispatches.map(({ agent }) => agent)), [['test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens'], ['finding-refuter']])
  assert.equal(steps[0].then, `${SKRAFT_COMMAND} review --pr 12 --record`)
  const folder = join(repo.cwd, '.copilot-tracking', 'skraft-reviews', 'pr-12')
  assert.equal(step.file, join(folder, 'reviews', 'verdict-1', 'verdict.yaml'))
  const patch = readFileSync(join(folder, 'reviews', 'verdict-1', 'changes.patch'), 'utf8')
  assert.ok(patch.includes('-        Assert.Equal(90m, total);\n+        Assert.NotNull(total);\n'), patch)
  assert.ok(!existsSync(join(repo.cwd, 'skraft-config.json')))
  assert.ok(!existsSync(join(repo.cwd, '.copilot-tracking', 'skraft-plans')))
})

test('skraft review --pr --publish asks the consent at the terminal once, keeps it in ~/.skraft/config.json, then keeps one comment on the pull request across passes', async (t) => {
  const repo = pullRequestRepository(t)
  const asked = []
  const confirm = async (question) => {
    asked.push(question)
    return true
  }

  const first = await conduct(repo, reviewLlm(), ['--publish'], { confirm })
  const second = await review(repo, ['--publish'], { confirm })

  assert.deepEqual([first.step.comment, first.step.unpublished], [COMMENT_URL, null])
  assert.equal(asked.length, 1)
  assert.ok(asked[0].endsWith('kept in ~/.skraft/config.json for this repository, for every later review. [y/N] '), asked[0])
  assert.deepEqual(JSON.parse(readFileSync(join(repo.root, '.skraft', 'config.json'), 'utf8')), { reviewComments: { 'github.example.com/acme/shop': { accepted: true, questionVersion: 1 } } })
  assert.ok(!existsSync(join(repo.cwd, 'skraft-config.json')))
  assert.equal(second.step.status, 'dispatch')
  assert.equal(repo.forge.state().comments.length, 1)
  assert.ok(repo.forge.state().comments[0].body.includes('<sub>skraft-review pr=12</sub>'))
  const journal = readFileSync(join(repo.cwd, '.copilot-tracking', 'skraft-reviews', 'pr-12', 'events.jsonl'), 'utf8')
  assert.ok(journal.includes('"by":"cli-tty"'))
  assert.ok(!/gh[opsu]_[A-Za-z0-9]{20,}/.test(journal))
})

test('skraft review --pr on a working copy with uncommitted changes stops before any agent, naming them', async (t) => {
  const repo = pullRequestRepository(t)
  writeFileSync(join(repo.cwd, 'Local.cs'), 'class Local {}\n')

  const { exit, step } = await review(repo, [])

  assert.equal(exit, 1)
  assert.deepEqual([step.status, step.code, step.reason, step.dispatches], ['stopped', 'working-copy-dirty', 'the working copy has uncommitted changes (Local.cs); commit or stash them, then review again', []])
})

test('skraft review --pr with gh not signed in stops, names why, and hands no agent over', async (t) => {
  const repo = pullRequestRepository(t, { signedIn: false })

  const { exit, step } = await review(repo, [])

  assert.equal(exit, 1)
  assert.deepEqual([step.status, step.code, step.reason, step.dispatches], ['stopped', 'forge-unavailable', 'gh is not signed in to github.example.com; run gh auth login --hostname github.example.com', []])
})

test('skraft review prints its verdict for a human and refuses a malformed command line', async (t) => {
  const repo = pullRequestRepository(t)

  const text = await skraft(repo.cwd, ['review', '--pr', '12'], { env: repo.env })
  const record = await skraft(repo.cwd, ['review', '--pr', '12'], { env: repo.env })
  const malformed = await skraft(repo.cwd, ['review', '--pr', '012'], { env: repo.env })
  const nothing = await skraft(repo.cwd, ['review', '--pr', '13', '--record'], { env: repo.env })

  assert.equal(text.status, 0)
  assert.ok(text.stdout.startsWith('skraft review #12: dispatch — start these 3 agents, one after the other, save each final reply as it is to its reply file, then record\nagent 1: test-integrity-lens on'), text.stdout)
  assert.ok(text.stdout.endsWith(`then: ${SKRAFT_COMMAND} review --pr 12 --record\n`), text.stdout)
  assert.equal(text.stderr, 'pr-12: review of pull request #12 (test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity)\n')
  assert.equal(record.status, 1)
  assert.equal(record.stdout, 'skraft review #12: refused (not-recorded) — 3 handed over agents are not recorded yet: start each one, save its reply, then record\n')
  assert.equal(malformed.status, 2)
  assert.equal(nothing.stdout, 'skraft review #13: refused (nothing-to-record) — no agent was handed over; run the review without --record\n')
})
