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
import { runSkraftPipelineWorkflow, createSkraftDecideTool, createSkraftClosePhaseTool } from '../../../plugins/skraft-framework/src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs'
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
    // A previous pipeline left the hooks' pointer behind.
    await mkdir(join(repo, '.copilot-tracking/skraft-plans'), { recursive: true })
    await writeFile(join(repo, '.copilot-tracking/skraft-plans/.active-slug'), 'old-story\n')
    const ctx = fakeContext(repo)
    const run = () => runSkraftPipelineWorkflow(ctx, { cwd: repo, pluginRoot: PLUGIN_ROOT, env })

    // Attempt 1: the DESIGN checkpoint pauses the run (ctx.pause throws AbortError).
    await assert.rejects(run(), { name: 'AbortError', message: 'paused at adr-ratification:007' })
    const state1 = JSON.parse(await readFile(join(repo, '.copilot-tracking/skraft-plans/checkout/state.json'), 'utf8'))
    assert.equal(state1.adrRatification.checkpointStatus, 'awaiting_human')
    assert.ok(state1.phaseArtifacts.RESEARCH.some((p) => p.endsWith('structural-scan.json')), 'real structural scan recorded')
    assert.deepEqual(ctx.phases, ['RESEARCH', 'DESIGN'])
    assert.equal(ctx.calls[0].agent, 'Skraft - Solution Researcher', 'Copilot agents are addressed by their .agent.md name')

    // The human answers through the skraft_decide tool.
    const decide = createSkraftDecideTool({ cwd: () => repo, pluginRoot: PLUGIN_ROOT, env })
    assert.match(await decide.handler({ slug: SLUG, key: 'adr-ratification:007', answer: 'accept all' }), /^Recorded "accept all"/)

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

    // The settings hooks now guard this run: the pointer names it, G1 lets its DELIVER
    // specialist through, and G6 injects no prose-orchestrator steps after a code dispatch.
    assert.equal((await readFile(join(repo, '.copilot-tracking/skraft-plans/.active-slug'), 'utf8')).trim(), SLUG)
    const engineerPrompt = ctx.calls.findLast((c) => c.agent === 'Skraft - Software Engineer').prompt
    const hook = (args, payload) => execFileSync(process.execPath, [join(PLUGIN_ROOT, 'src/cli/hook.mjs'), ...args], {
      cwd: repo,
      env: { ...env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, SKRAFT_AUDIT_LOG: join(repo, 'audit.jsonl') },
      input: JSON.stringify({ ...payload, cwd: repo, session_id: 's', transcript_path: '' }),
      encoding: 'utf8',
    })
    const agentCall = { tool_name: 'Agent', tool_input: { subagent_type: 'skraft:software-engineer', description: 'DELIVER', prompt: engineerPrompt } }
    assert.equal(hook(['PreToolUse', 'Agent'], { hook_event_name: 'PreToolUse', ...agentCall }), '', 'G1/G9 allow the DELIVER specialist')
    assert.doesNotMatch(hook(['PostToolUse', 'Agent'], { hook_event_name: 'PostToolUse', ...agentCall, tool_response: 'done' }), /SKRAFT G6/)
    const audit = (await readFile(join(repo, 'audit.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(audit.some((e) => e.event === 'DispatchEvaluated' && e.projectSlug === SLUG && e.decision === 'ALLOW'))
    assert.ok(audit.some((e) => e.eventType === 'ContinuationSkipped'))

    // The human validated their own reworks: skraft_close_phase closes DELIVER.
    const close = createSkraftClosePhaseTool({ cwd: () => repo, pluginRoot: PLUGIN_ROOT, env })
    assert.match(await close.handler({ slug: SLUG, phase: 'DELIVER', findings: 2 }), /^DELIVER closed by human validation \(reviews\/.+\/manual-close\.md\); next: DONE/)
    assert.match(await readFile(join(repo, `.copilot-tracking/skraft-plans/${SLUG}/reviews/${new Date().toISOString().slice(0, 10)}/manual-close.md`), 'utf8'), /verdict: "APPROVED"/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
