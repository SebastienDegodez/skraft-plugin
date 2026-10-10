// Acceptance — G8 through the settings hook (hooks.json → src/cli/hook.mjs PreToolUse), the
// path a host without mods or the Copilot extension still runs: a Claude Code payload names
// the caller (agent_type) and is judged; a Copilot preToolUse names nobody and passes,
// audited UNIDENTIFIED_CALLER. Real hook process, real config, a temporary project.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const HOOK_CLI = join(PLUGIN, 'src/cli/hook.mjs')

const inPipeline = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-g8-hook-'))
  try {
    const tracking = join(root, '.copilot-tracking', 'skraft-plans')
    mkdirSync(join(tracking, 'checkout'), { recursive: true })
    writeFileSync(join(tracking, '.active-slug'), 'checkout\n')
    const env = { ...process.env, SKRAFT_AUDIT_LOG: join(root, 'audit.jsonl'), SKRAFT_CONFIG: join(PLUGIN, 'skraft-framework.config.json') }
    for (const name of ['SKRAFT_PROJECT_SLUG', 'SKRAFT_HARNESS', 'SKRAFT_TRACKING_ROOT', 'PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT']) delete env[name]
    fn({ root, env })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const preToolUse = (env, payload) => {
  const stdout = execFileSync('node', [HOOK_CLI, 'PreToolUse'], { input: JSON.stringify(payload), encoding: 'utf8', env })
  return stdout.trim() ? JSON.parse(stdout) : undefined
}
const audited = (env) => (existsSync(env.SKRAFT_AUDIT_LOG)
  ? readFileSync(env.SKRAFT_AUDIT_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.event === 'SessionGuardEvaluated')
  : [])

const claudeWrite = (root, agentType, filePath) => ({
  session_id: 's', transcript_path: '/tmp/t.jsonl', cwd: root, hook_event_name: 'PreToolUse',
  ...(agentType ? { agent_id: 'a1', agent_type: agentType } : {}),
  tool_name: 'Write', tool_input: { file_path: join(root, filePath), content: 'x' },
})

test('Claude Code: the payload names the caller, and its write rights decide', () => {
  inPipeline(({ root, env }) => {
    const refused = preToolUse(env, claudeWrite(root, 'skraft:software-engineer-reviewer', 'src/Orders/Order.cs'))
    assert.equal(refused?.hookSpecificOutput?.permissionDecision, 'deny')
    assert.match(refused.hookSpecificOutput.permissionDecisionReason, /Skraft - Software Engineer Reviewer \(reviewer\) writes only/)
    assert.equal(preToolUse(env, claudeWrite(root, 'skraft:software-engineer', 'src/Orders/Order.cs')), undefined)
    assert.equal(preToolUse(env, claudeWrite(root, 'skraft:skraft-orchestrator', 'tests/OrderTests.cs'))?.permissionDecision, 'deny')
    assert.deepEqual(audited(env).map(({ decision, code }) => [decision, code]),
      [['DENY', 'WRITE_RIGHT_DENIED'], ['ALLOW', 'CONFORMING'], ['DENY', 'WRITE_RIGHT_DENIED']])
  })
})

test('Copilot: a preToolUse that names no agent passes, single or batched, audited UNIDENTIFIED_CALLER', () => {
  inPipeline(({ root, env }) => {
    const single = { sessionId: 'toolu_x', cwd: root, toolName: 'create', toolArgs: JSON.stringify({ path: 'src/Orders/Order.cs', file_text: 'x' }) }
    assert.equal(preToolUse(env, single), undefined)
    const batch = { sessionId: 'toolu_x', cwd: root, toolCalls: [{ id: 't1', name: 'create', args: { path: 'src/a.ts', file_text: '' } }, { id: 't2', name: 'bash', args: { command: 'echo x > tests/a.test.ts' } }] }
    assert.equal(preToolUse(env, batch), undefined)
    assert.deepEqual(audited(env).map(({ decision, code }) => [decision, code]), Array(3).fill(['ALLOW', 'UNIDENTIFIED_CALLER']))
  })
})
