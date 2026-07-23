import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// End-to-end boundary for the composition root: drives the real cli/hook.mjs with stdin +
// the CLI args the manifest forwards (event + matcher), proving the PreToolUse guards are
// actually wired (previously the preToolUse slot was unwired and the router returned no
// decision). Uses env seams so nothing touches the repo working tree.
const HOOK_CLI = resolve(fileURLToPath(import.meta.url), '../../../plugins/src/cli/hook.mjs')
const REAL_CONFIG = resolve(fileURLToPath(import.meta.url), '../../../plugins/skraft-framework.config.json')

const runHook = (args, payload) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-hook-'))
  try {
    const stdout = execFileSync('node', [HOOK_CLI, ...args], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: {
        ...process.env,
        SKRAFT_TRACKING_ROOT: dir,
        SKRAFT_AUDIT_LOG: join(dir, 'audit.jsonl'),
        SKRAFT_CONFIG: REAL_CONFIG,
      },
    })
    return stdout.trim() ? JSON.parse(stdout) : undefined
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('PreToolUse/Bash: a shell command writing state.json is denied (G7 now active)', () => {
  const result = runHook(['PreToolUse', 'Bash'], {
    toolInput: { command: 'echo "{}" > .copilot-tracking/skraft/p/state.json' },
  })
  assert.equal(result.decision, 'deny')
})

test('PreToolUse/Bash: a benign shell command is allowed', () => {
  const result = runHook(['PreToolUse', 'Bash'], { toolInput: { command: 'ls -la' } })
  assert.equal(result.decision, 'allow')
})

test('PreToolUse/Agent: a standalone agent dispatch with no projectSlug is allowed (G1 skipped, not blocked)', () => {
  // No projectSlug, no state file at all: G1 must be skipped so a directly-invoked
  // product agent is not fail-closed blocked. The session guard fail-opens on the
  // unreadable state after its unconditional G7 check passes.
  const result = runHook(['PreToolUse', 'Agent'], { toolInput: { subagentType: 'backlog-planner' } })
  assert.equal(result.decision, 'allow')
})
