// Acceptance — who may dispatch whom. Claude Code ignores the Agent(...) allowlist of a
// subagent definition, so the hook enforces the dispatch tree the descriptors declare
// (dispatched_by): an agent never dispatches itself, and an agent with a declared
// dispatcher runs only when that dispatcher asks — whenever the caller is known.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/hook.mjs', import.meta.url))

const dispatch = ({ caller, requested }) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-provenance-'))
  const env = { ...process.env, SKRAFT_TRACKING_ROOT: join(root, 'tracking'), SKRAFT_AUDIT_LOG: join(root, 'audit.jsonl') }
  delete env.SKRAFT_PROJECT_SLUG
  try {
    const payload = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { subagent_type: requested, description: 'x', prompt: 'x' },
      cwd: root,
      ...(caller ? { agent_id: 'a-1', agent_type: caller } : {}),
    }
    const out = execFileSync('node', [HOOK, 'PreToolUse', 'Agent'], { input: JSON.stringify(payload), encoding: 'utf8', env })
    let audit = []
    try { audit = readFileSync(join(root, 'audit.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) } catch { /* none */ }
    return { output: out.trim() ? JSON.parse(out) : undefined, audit }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('an agent that dispatches itself is refused', () => {
  const { output, audit } = dispatch({ caller: 'skraft:backlog-discoverer', requested: 'skraft:backlog-discoverer' })
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /dispatches itself/)
  assert.equal(audit.find((entry) => entry.event === 'DispatchProvenanceEvaluated')?.code, 'SELF_DISPATCH')
})

test('an agent dispatched by someone other than its declared dispatcher is refused, naming the dispatcher', () => {
  const { output } = dispatch({ caller: 'plugin:skraft:skraft-orchestrator', requested: 'skraft:cold-reader-lens' })
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Skraft - Software Engineer Reviewer/)
})

test('the declared dispatch tree is allowed', () => {
  for (const [caller, requested] of [
    ['skraft:software-engineer-reviewer', 'skraft:cold-reader-lens'],
    ['skraft:software-engineer', 'contract-testing-worker'],
    ['skraft:backlog-discoverer', 'backlog-discoverer-reviewer'],
  ]) {
    assert.equal(dispatch({ caller, requested }).output, undefined, `${caller} → ${requested}`)
  }
})

test('an unknown caller or an agent with no declared dispatcher is not judged', () => {
  for (const [caller, requested] of [
    [undefined, 'skraft:cold-reader-lens'],
    ['general-purpose', 'skraft:cold-reader-lens'],
    ['skraft:skraft-orchestrator', 'Explore'],
    ['skraft:solution-architect', 'skraft:backlog-planner'],
  ]) {
    assert.equal(dispatch({ caller, requested }).output, undefined, `${caller} → ${requested}`)
  }
})
