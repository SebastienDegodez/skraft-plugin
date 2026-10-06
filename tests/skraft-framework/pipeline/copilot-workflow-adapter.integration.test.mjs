// The Copilot dynamic-workflow adapter against a real repository on disk: real
// state.json writer, real git, real structural-scan and qg-verify CLIs. Only the
// workflow context is simulated (ctx.agent is the scripted LLM, ctx.pause a durable
// one-shot checkpoint as the SDK documents it).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../plugins/skraft-framework/src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs'
import { requiredTrackedOutputs } from '../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs'
import { CONFIG, PLUGIN_ROOT, ADR_INDEX_HEADER, review } from './fake-host.mjs'

const SLUG = 'checkout'
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

const fakeContext = (repo) => {
  const paused = new Set()
  const calls = []
  const today = new Date().toISOString().slice(0, 10)
  const tracking = join(repo, '.copilot-tracking/skraft-plans', SLUG)
  const ctx = {
    args: { slug: SLUG },
    signal: new AbortController().signal,
    phases: [],
    logs: [],
    calls,
    phase: (title) => ctx.phases.push(title),
    log: (message) => ctx.logs.push(message),
    pause: async (key) => {
      if (paused.has(key)) return
      paused.add(key)
      const error = new Error(`paused at ${key}`)
      error.name = 'AbortError'
      throw error
    },
    agent: async (prompt, options) => {
      calls.push({ prompt, ...options })
      const agent = options.agent
      if (/-reviewer$|Reviewer$/.test(agent)) {
        const out = prompt.match(/`\.copilot-tracking\/skraft-plans\/checkout\/(reviews\/[^`]+)`/)
        await mkdir(join(tracking, out[1], '..'), { recursive: true })
        await writeFile(join(tracking, out[1]), review('APPROVED'))
        return 'reviewed'
      }
      if (prompt.includes('Ratify mode')) {
        const index = join(repo, 'docs/adr/decisions-index.md')
        await writeFile(index, (await readFile(index, 'utf8')).replace('| Proposed |', '| Accepted |'))
        return 'ratified'
      }
      for (const pattern of requiredTrackedOutputs(agent, CONFIG)) {
        const path = join(tracking, pattern.replace(/\{date\}/g, today).replace(/\{slug\}/g, SLUG).replace(/\{story\}/g, 's1').replace(/\{[^}]+\}/g, 'x'))
        await mkdir(join(path, '..'), { recursive: true })
        await writeFile(path, pattern.endsWith('.json') ? '{"schema":"not-a-real-log"}' : `# ${agent}`)
      }
      if (agent === CONFIG.phaseAgents.DELIVER.specialist) {
        await writeFile(join(repo, 'feature.txt'), 'code')
        git(repo, 'add', '.')
        git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat(checkout): slice')
      }
      return 'done'
    },
  }
  return ctx
}

test('copilot workflow: pauses durably at the ADR checkpoint, resumes with the recorded answer, and runs qg-verify itself', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'skraft-copilot-'))
  try {
    git(repo, 'init', '-q')
    await mkdir(join(repo, 'docs/adr'), { recursive: true })
    await writeFile(join(repo, 'docs/adr/decisions-index.md'), `${ADR_INDEX_HEADER}| 007 | Conformist | Proposed | x | y | — | d |\n`)
    git(repo, 'add', '.')
    git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'chore(repo): init')

    const env = { ...process.env, SKRAFT_TRACKING_ROOT: '' }
    delete env.SKRAFT_TRACKING_ROOT
    const ctx = fakeContext(repo)
    const run = () => runSkraftPipelineWorkflow(ctx, { cwd: repo, pluginRoot: PLUGIN_ROOT, env })

    // Attempt 1: the DESIGN checkpoint pauses the run (ctx.pause throws AbortError).
    await assert.rejects(run(), { name: 'AbortError', message: 'paused at adr-ratification:007' })
    const state1 = JSON.parse(await readFile(join(repo, '.copilot-tracking/skraft-plans/checkout/state.json'), 'utf8'))
    assert.equal(state1.adrRatification.checkpointStatus, 'awaiting_human')
    assert.ok(state1.phaseArtifacts.RESEARCH.some((p) => p.endsWith('structural-scan.json')), 'real structural scan recorded')
    assert.deepEqual(ctx.phases, ['RESEARCH', 'DESIGN'])
    assert.equal(ctx.calls[0].agent, 'Skraft - Solution Researcher', 'Copilot agents are addressed by their .agent.md name')

    // The human answers through the CLI (the skraft_decide tool writes the same file).
    execFileSync(process.execPath, [join(PLUGIN_ROOT, 'src/cli/decide.mjs'), '--slug', SLUG, '--key', 'adr-ratification:007', '--answer', 'accept all'], { cwd: repo, env })

    // Attempt 2 (resume): the recorded answer ratifies, DISTILL and DELIVER run, and the
    // code runs the real qg-verify on the engineer's (bogus) evidence log: inconclusive,
    // so the run pauses again at the environment checkpoint.
    await assert.rejects(run(), { name: 'AbortError', message: /paused at environment:DELIVER/ })
    const state2 = JSON.parse(await readFile(join(repo, '.copilot-tracking/skraft-plans/checkout/state.json'), 'utf8'))
    assert.equal(state2.adrRatification.checkpointStatus, 'resolved')
    assert.deepEqual(state2.phasesCompleted, ['RESEARCH', 'DESIGN', 'DISTILL'])
    assert.equal(state2.currentPhase, 'DELIVER')
    assert.ok(ctx.logs.some((line) => /^qg-verify evidence\/.+qg-s1\.json: inconclusive$/.test(line)), ctx.logs.join('\n'))
    assert.ok(!ctx.calls.slice(1).some((c) => c.agent === 'Skraft - Solution Researcher'), 'RESEARCH is not redone on resume')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
