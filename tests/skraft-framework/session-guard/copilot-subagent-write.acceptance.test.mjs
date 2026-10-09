// Acceptance — G8 under Copilot CLI, end to end through the hook CLI, with the hook inputs
// a Copilot session really sends (fixtures/copilot-subagent). Copilot names no agent on a
// sub-agent's preToolUse — only its own sessionId, and the batched `toolCalls` — so the
// engineer's src/ writes used to be refused as the orchestrator's (#206).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const HOOK_CLI = join(PLUGIN, 'src/cli/hook.mjs')
const FIXTURES = fileURLToPath(new URL('./fixtures/copilot-subagent/', import.meta.url))
const INPUTS = JSON.parse(readFileSync(join(FIXTURES, 'hook-inputs.json'), 'utf8'))

const inDeliver = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-copilot-g8-'))
  try {
    const tracking = join(root, 'tracking')
    mkdirSync(join(tracking, 'checkout'), { recursive: true })
    writeFileSync(join(tracking, '.active-slug'), 'checkout\n')
    writeFileSync(join(tracking, 'checkout', 'state.json'), JSON.stringify({ projectSlug: 'checkout', currentPhase: 'DELIVER' }))
    const transcript = join(root, 'events.jsonl')
    copyFileSync(join(FIXTURES, 'events.jsonl'), transcript)
    const env = {
      ...process.env,
      SKRAFT_TRACKING_ROOT: tracking,
      SKRAFT_AUDIT_LOG: join(root, 'skraft', 'skill-audit.jsonl'),
      SKRAFT_CONFIG: join(PLUGIN, 'skraft-framework.config.json'),
      PLUGIN_ROOT: PLUGIN,
    }
    delete env.SKRAFT_PROJECT_SLUG
    delete env.SKRAFT_HARNESS
    delete env.CLAUDE_PLUGIN_ROOT
    fn({ root, env, transcript })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const hook = (env, event, payload) => {
  const stdout = execFileSync('node', [HOOK_CLI, event], { input: JSON.stringify(payload), encoding: 'utf8', env })
  return stdout.trim() ? JSON.parse(stdout) : undefined
}

const at = (root, payload) => ({ ...payload, cwd: root })

test('the DELIVER engineer dispatched by Copilot writes src/ and tests/ in one batched call', () => {
  inDeliver(({ root, env, transcript }) => {
    hook(env, 'SubagentStart', at(root, { ...INPUTS.subagentStart, transcriptPath: transcript }))

    const output = hook(env, 'PreToolUse', at(root, INPUTS.subagentPreToolUse))
    assert.equal(output?.permissionDecision, undefined, `engineer write refused: ${output?.permissionDecisionReason}`)

    const audit = readFileSync(env.SKRAFT_AUDIT_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    const evaluated = audit.filter((entry) => entry.event === 'SessionGuardEvaluated')
    assert.deepEqual(evaluated.map(({ agentName, decision }) => ({ agentName, decision })), [
      { agentName: 'skraft:software-engineer', decision: 'ALLOW' },
      { agentName: 'skraft:software-engineer', decision: 'ALLOW' },
    ])
  })
})

test('the Copilot orchestrator session is still refused a src/ write during DELIVER', () => {
  inDeliver(({ root, env, transcript }) => {
    hook(env, 'SubagentStart', at(root, { ...INPUTS.subagentStart, transcriptPath: transcript }))

    const output = hook(env, 'PreToolUse', at(root, INPUTS.orchestratorPreToolUse))
    assert.equal(output?.permissionDecision, 'deny')
    assert.match(output.permissionDecisionReason, /monitored DELIVER sub-agent/)
  })
})

test('a Copilot sub-agent session no recorded transcript names is refused', () => {
  inDeliver(({ root, env }) => {
    const output = hook(env, 'PreToolUse', at(root, INPUTS.subagentPreToolUse))
    assert.equal(output?.permissionDecision, 'deny')
  })
})
