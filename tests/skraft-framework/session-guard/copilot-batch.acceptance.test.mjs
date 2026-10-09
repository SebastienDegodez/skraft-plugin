// Acceptance — the session guard under Copilot CLI, end to end through the hook CLI, with
// preToolUse inputs shaped as a Copilot session really sends them (fixtures/
// copilot-pretooluse.json): no agent name, tool calls batched in `toolCalls`. Every batched
// call reaches G7; a workspace write passes whoever the session is (#206).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const HOOK_CLI = join(PLUGIN, 'src/cli/hook.mjs')
const INPUTS = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/copilot-pretooluse.json', import.meta.url)), 'utf8'))

const inDeliver = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-copilot-batch-'))
  try {
    const tracking = join(root, 'tracking')
    mkdirSync(join(tracking, 'checkout'), { recursive: true })
    writeFileSync(join(tracking, '.active-slug'), 'checkout\n')
    writeFileSync(join(tracking, 'checkout', ['state', 'json'].join('.')), JSON.stringify({ projectSlug: 'checkout', currentPhase: 'DELIVER' }))
    const env = {
      ...process.env,
      SKRAFT_TRACKING_ROOT: tracking,
      SKRAFT_AUDIT_LOG: join(root, 'audit.jsonl'),
      SKRAFT_CONFIG: join(PLUGIN, 'skraft-framework.config.json'),
      PLUGIN_ROOT: PLUGIN,
    }
    delete env.SKRAFT_PROJECT_SLUG
    delete env.SKRAFT_HARNESS
    delete env.CLAUDE_PLUGIN_ROOT
    fn({ root, env })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const preToolUse = (env, payload) => {
  const stdout = execFileSync('node', [HOOK_CLI, 'PreToolUse'], { input: JSON.stringify(payload), encoding: 'utf8', env })
  return stdout.trim() ? JSON.parse(stdout) : undefined
}

test('Copilot batched src/ and tests/ writes pass during DELIVER, sub-agent or orchestrator', () => {
  inDeliver(({ root, env }) => {
    assert.equal(preToolUse(env, { ...INPUTS.subagentWrites, cwd: root }), undefined)
    assert.equal(preToolUse(env, { ...INPUTS.orchestratorWrite, cwd: root }), undefined)
  })
})

test('one Copilot batched call rewriting the tracked state refuses the whole batch', () => {
  inDeliver(({ root, env }) => {
    const output = preToolUse(env, { ...INPUTS.trackedStateInBatch, cwd: root })
    assert.equal(output?.permissionDecision, 'deny')
    assert.match(output.permissionDecisionReason, /only through the state CLI/)
  })
})
