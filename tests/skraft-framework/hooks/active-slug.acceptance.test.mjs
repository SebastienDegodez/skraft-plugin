// Acceptance — the guards act on the pipeline the state CLI opened, with nothing but the
// payload a harness really sends. No harness sends a project slug: the state CLI records
// the active one beside the tracked projects, and the hook reads it back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const STATE_CLI = join(PLUGIN, 'src/cli/state.mjs')
const HOOK_CLI = join(PLUGIN, 'src/cli/hook.mjs')

const withTrackingRoot = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-active-'))
  const env = { ...process.env, SKRAFT_TRACKING_ROOT: root, SKRAFT_AUDIT_LOG: join(root, 'audit.jsonl') }
  delete env.SKRAFT_PROJECT_SLUG
  try { fn({ root, env }) } finally { rmSync(root, { recursive: true, force: true }) }
}

const state = (env, ...args) => {
  try {
    return { code: 0, out: execFileSync('node', [STATE_CLI, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (err) {
    return { code: err.status, out: err.stdout, err: err.stderr }
  }
}

const hook = (env, args, payload) => {
  const stdout = execFileSync('node', [HOOK_CLI, ...args], { input: JSON.stringify(payload), encoding: 'utf8', env })
  return stdout.trim() ? JSON.parse(stdout) : undefined
}

// A Claude Code PreToolUse payload for a subagent dispatch, as sent on stdin.
const agentDispatch = (subagentType) => ({
  session_id: 's-1',
  transcript_path: '/tmp/t.jsonl',
  cwd: '/tmp',
  hook_event_name: 'PreToolUse',
  permission_mode: 'default',
  tool_name: 'Agent',
  tool_input: { subagent_type: subagentType, description: 'phase work', prompt: '…' },
})

test('init records the active pipeline and G1 then governs a real dispatch payload', () => {
  withTrackingRoot(({ root, env }) => {
    assert.equal(state(env, 'init', '--slug', 'checkout-pricing').code, 0)
    assert.equal(readFileSync(join(root, '.active-slug'), 'utf8').trim(), 'checkout-pricing')

    const denied = hook(env, ['PreToolUse', 'Agent'], agentDispatch('skraft:software-engineer'))
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /RESEARCH/)

    assert.equal(hook(env, ['PreToolUse', 'Agent'], agentDispatch('skraft:solution-researcher')), undefined)
  })
})

test('select switches the active pipeline; an unknown or malformed slug is refused', () => {
  withTrackingRoot(({ root, env }) => {
    state(env, 'init', '--slug', 'first')
    state(env, 'init', '--slug', 'second')
    assert.equal(readFileSync(join(root, '.active-slug'), 'utf8').trim(), 'second')

    assert.equal(state(env, 'select', '--slug', 'first').code, 0)
    assert.equal(readFileSync(join(root, '.active-slug'), 'utf8').trim(), 'first')

    const unknown = state(env, 'select', '--slug', 'third')
    assert.equal(unknown.code, 1)
    assert.match(unknown.err, /NO_STATE/)

    const traversal = state(env, 'get', '--slug', '../first')
    assert.equal(traversal.code, 1)
    assert.match(traversal.err, /INVALID_ARGUMENT/)
  })
})

test('a subcommand without --slug acts on the active pipeline', () => {
  withTrackingRoot(({ env }) => {
    state(env, 'init', '--slug', 'checkout-pricing')
    assert.equal(state(env, 'get', '--field', 'currentPhase').out.trim(), 'RESEARCH')
  })
})

test('SKRAFT_PROJECT_SLUG overrides the recorded pointer; a malformed pointer is ignored', () => {
  withTrackingRoot(({ root, env }) => {
    state(env, 'init', '--slug', 'other')
    state(env, 'init', '--slug', 'checkout-pricing')
    const pinned = { ...env, SKRAFT_PROJECT_SLUG: 'other' }
    state(pinned, 'close-phase', '--phase', 'RESEARCH', '--verdict', 'APPROVED')
    assert.equal(state(env, 'get', '--slug', 'other', '--field', 'currentPhase').out.trim(), 'DESIGN')
    assert.equal(hook(pinned, ['PreToolUse', 'Agent'], agentDispatch('solution-architect')), undefined)

    writeFileSync(join(root, '.active-slug'), '../../etc\n')
    assert.equal(hook(env, ['PreToolUse', 'Agent'], agentDispatch('software-engineer')), undefined, 'no valid slug: G1 stays out')
  })
})

// ─── The hook runs where the harness says the session is ───────────────────────

const inProject = (fn) => {
  const project = mkdtempSync(join(tmpdir(), 'skraft-project-'))
  const env = { ...process.env, SKRAFT_AUDIT_LOG: join(project, 'audit.jsonl'), SKRAFT_TRACKING_ROOT: '' }
  delete env.SKRAFT_TRACKING_ROOT
  delete env.SKRAFT_PROJECT_SLUG
  try { fn({ project, env }) } finally { rmSync(project, { recursive: true, force: true }) }
}

test('the hook resolves the tracking root from the payload cwd, not its own working directory', () => {
  inProject(({ project, env }) => {
    execFileSync('node', [STATE_CLI, 'init', '--slug', 'checkout-pricing'], { cwd: project, env, stdio: 'ignore' })
    const payload = { ...agentDispatch('software-engineer'), cwd: project }
    const denied = hook(env, ['PreToolUse', 'Agent'], payload)
    assert.equal(denied?.hookSpecificOutput?.permissionDecision, 'deny')
  })
})

test('a corrupted state blocks a phase dispatch without leaving a snapshot per hook call', () => {
  inProject(({ project, env }) => {
    execFileSync('node', [STATE_CLI, 'init', '--slug', 'checkout-pricing'], { cwd: project, env, stdio: 'ignore' })
    const dir = join(project, '.copilot-tracking', 'skraft-plans', 'checkout-pricing')
    writeFileSync(join(dir, 'state.json'), '{ truncated')
    const payload = { ...agentDispatch('solution-researcher'), cwd: project }
    hook(env, ['PreToolUse', 'Agent'], payload)
    const blocked = hook(env, ['PreToolUse', 'Agent'], payload)
    assert.equal(blocked.hookSpecificOutput.permissionDecision, 'deny')
    const snapshots = readdirSync(dir).filter((f) => f.includes('.corrupted.'))
    assert.deepEqual(snapshots, [])
  })
})

test('malformed stdin never crashes the hook', () => {
  const out = execFileSync('node', [HOOK_CLI, 'PreToolUse', 'Bash'], { input: '{ not json', encoding: 'utf8', env: { ...process.env, SKRAFT_AUDIT_LOG: join(tmpdir(), 'skraft-malformed-audit.jsonl') } })
  assert.equal(out, '')
})

test('a Bash tool call outside any pipeline writes no audit line', () => {
  inProject(({ project, env }) => {
    hook(env, ['PreToolUse', 'Bash'], { tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: project })
    assert.equal(existsSync(join(project, 'audit.jsonl')), false)
  })
})
