import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The guard that was missing: every route in the manifest must write stdout the HARNESSES
// accept. cli/hook.mjs used to print the framework's own vocabulary — `{"decision":"allow"}`,
// `{"decision":"deny",...}` — which is outside the root `decision` enum both harnesses type as
// "approve" | "block". Claude Code rejected the whole payload ("Hook JSON output validation
// failed — (root): Invalid input") and fell back to plain text, so a G7 deny never blocked
// anything. Unit tests on the services could not see it: they assert the decision, not the wire.
const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '../../plugins/skraft-framework')
const HOOK_CLI = join(pluginRoot, 'src/cli/hook.mjs')
const REAL_CONFIG = join(pluginRoot, 'skraft-framework.config.json')
const manifest = JSON.parse(readFileSync(join(pluginRoot, 'hooks/hooks.json'), 'utf8'))

// Root `decision` is enum("approve","block") on Claude Code, and Copilot only ever reads
// "block" there. Anything else invalidates the payload.
const ROOT_DECISIONS = ['approve', 'block']
// Claude Code refuses a tool through hookSpecificOutput; Copilot through the root twin.
const PERMISSION_DECISIONS = ['allow', 'deny', 'ask']

const runHook = (args, payload) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-wire-'))
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
    return stdout
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Asserts the contract shared by Claude Code and Copilot CLI. Empty stdout is always valid:
// nothing is parsed, so nothing can be rejected.
const assertHarnessValid = (stdout, hookEventName, label) => {
  if (stdout.trim() === '') return undefined

  let output
  assert.doesNotThrow(() => { output = JSON.parse(stdout) }, `${label}: stdout must be JSON or empty`)

  if (output.decision !== undefined) {
    assert.ok(
      ROOT_DECISIONS.includes(output.decision),
      `${label}: root decision "${output.decision}" is outside the harness enum ${ROOT_DECISIONS.join(' | ')}`,
    )
  }

  if (output.hookSpecificOutput !== undefined) {
    assert.equal(
      output.hookSpecificOutput.hookEventName,
      hookEventName,
      `${label}: hookEventName must match the running event or Claude Code drops the block`,
    )
    const permission = output.hookSpecificOutput.permissionDecision
    if (permission !== undefined) {
      assert.ok(PERMISSION_DECISIONS.includes(permission), `${label}: unknown permissionDecision "${permission}"`)
      assert.equal(hookEventName, 'PreToolUse', `${label}: only PreToolUse gates a tool`)
    }
  }

  return output
}

// Every route the manifest actually drives, with a payload that exercises it.
const ROUTES = [
  { args: ['PreToolUse', 'Bash'], payload: { toolInput: { command: 'ls -la' } } },
  {
    args: ['PreToolUse', 'Bash'],
    payload: { toolInput: { command: 'echo "{}" > .copilot-tracking/skraft/p/state.json' } },
    label: 'denied write',
  },
  { args: ['PreToolUse', 'Agent'], payload: { toolInput: { subagentType: 'backlog-planner' } } },
  { args: ['SubagentStart'], payload: { agentName: 'Skraft - Software Engineer' } },
  { args: ['SubagentStop'], payload: { agentName: 'Skraft - Software Engineer' } },
  { args: ['PostToolUse', 'Agent'], payload: { agentName: 'Skraft - Solution Researcher' } },
  { args: ['PostToolUse', 'Read'], payload: { toolInput: { path: '/x/skills/outside-in-tdd/SKILL.md' } } },
]

for (const { args, payload, label } of ROUTES) {
  const name = `${args.join('/')}${label ? ` (${label})` : ''}`
  test(`hook wire format: ${name} writes harness-valid stdout`, () => {
    assertHarnessValid(runHook(args, payload), args[0], name)
  })
}

test('hook wire format: every manifest route is covered here', () => {
  const declared = Object.entries(manifest.hooks)
    .filter(([event]) => event !== 'SessionStart') // housekeeping CLI, not hook.mjs
    .flatMap(([event, entries]) => entries.map((entry) => [event, entry.matcher].filter(Boolean).join('/')))
    .sort()
  const covered = [...new Set(ROUTES.map(({ args }) => args.join('/')))].sort()

  assert.deepEqual(covered, declared, 'a manifest route with no wire-format test can regress unnoticed')
})

test('hook wire format: a PreToolUse refusal reaches BOTH harnesses', () => {
  const stdout = runHook(['PreToolUse', 'Bash'], {
    toolInput: { command: 'echo "{}" > .copilot-tracking/skraft/p/state.json' },
  })
  const output = assertHarnessValid(stdout, 'PreToolUse', 'G7 deny')

  // Claude Code reads the refusal here...
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny')
  assert.ok(output.hookSpecificOutput.permissionDecisionReason)
  // ...Copilot CLI reads the very same refusal at the root.
  assert.equal(output.permissionDecision, 'deny')
  assert.equal(output.permissionDecisionReason, output.hookSpecificOutput.permissionDecisionReason)
})
