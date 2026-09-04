import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toHarnessOutput } from '../../plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs'
import { allow, deny, block, additionalContext } from '../../plugins/skraft-framework/src/adapters/api/hooks/decision.mjs'

// The framework's decision vocabulary is NOT a harness wire format: Claude Code types the
// root `decision` as enum("approve","block"), so emitting `{"decision":"allow"}` invalidates
// the whole output and the guard is silently dropped. These tests pin the translation.

test('harness-output: an allow says nothing at all', () => {
  for (const event of ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop']) {
    assert.equal(toHarnessOutput(allow(), event), undefined, `${event} allow must stay silent`)
  }
})

test('harness-output: a PreToolUse deny refuses the tool on both harnesses', () => {
  const output = toHarnessOutput(deny('state.json is off limits'), 'PreToolUse')

  // Copilot CLI reads the refusal at the root...
  assert.equal(output.permissionDecision, 'deny')
  assert.equal(output.permissionDecisionReason, 'state.json is off limits')
  // ...Claude Code reads it inside hookSpecificOutput, keyed by the event it is running.
  assert.deepEqual(output.hookSpecificOutput, {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: 'state.json is off limits',
  })
})

test('harness-output: a PreToolUse block refuses the tool without stopping the session', () => {
  const output = toHarnessOutput(block('recorded pipeline state could not be read'), 'PreToolUse')

  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny')
  // A hook bug must never freeze the pipeline (README fail-mode rule).
  assert.ok(!('continue' in output), 'a fail-closed guard must not abort the whole turn')
  assert.ok(!('stopReason' in output))
})

test('harness-output: a deny outside PreToolUse blocks the event itself', () => {
  const output = toHarnessOutput(deny('mandatory skill not loaded'), 'SubagentStop')

  // "block" is the only root decision value both harnesses accept.
  assert.deepEqual(output, { decision: 'block', reason: 'mandatory skill not loaded' })
})

test('harness-output: additionalContext is injected under the running event', () => {
  const output = toHarnessOutput(additionalContext('SKRAFT G6 — next: dispatch reviewer'), 'PostToolUse')

  assert.equal(output.additionalContext, 'SKRAFT G6 — next: dispatch reviewer')
  assert.deepEqual(output.hookSpecificOutput, {
    hookEventName: 'PostToolUse',
    additionalContext: 'SKRAFT G6 — next: dispatch reviewer',
  })
})

test('harness-output: an empty context is not worth an output', () => {
  assert.equal(toHarnessOutput(additionalContext(''), 'SubagentStart'), undefined)
})

test('harness-output: nothing is emitted without a decision or without an event', () => {
  assert.equal(toHarnessOutput(undefined, 'PreToolUse'), undefined)
  assert.equal(toHarnessOutput(deny('nope'), undefined), undefined)
})

test('harness-output: "allow" and "deny" never reach the root decision key', () => {
  const decisions = [allow(), deny('r'), block('r'), additionalContext('c')]
  const events = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop']

  for (const d of decisions) {
    for (const event of events) {
      const output = toHarnessOutput(d, event)
      if (output?.decision !== undefined) {
        assert.ok(
          ['approve', 'block'].includes(output.decision),
          `root decision "${output.decision}" is outside the harness enum for ${event}`,
        )
      }
    }
  }
})
