import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The manifest spawns cli/hook.mjs for every tool call with the event name only (no
// matcher): the tool comes from the payload. These tests drive the real entry point the
// way each harness does, and the manifest's own command strings through the platform shell.
const pluginRoot = resolve(fileURLToPath(import.meta.url), '../../../../plugins/skraft-framework')
const HOOK_CLI = join(pluginRoot, 'src/cli/hook.mjs')
const REAL_CONFIG = join(pluginRoot, 'skraft-framework.config.json')
const manifest = JSON.parse(readFileSync(join(pluginRoot, 'hooks/hooks.json'), 'utf8'))

const STATE_WRITE = { tool_name: 'Bash', tool_input: { command: 'echo "{}" > .copilot-tracking/skraft-plans/p/state.json' } }

const withSandbox = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft entry '))
  const env = { ...process.env, SKRAFT_TRACKING_ROOT: dir, SKRAFT_AUDIT_LOG: join(dir, 'audit.jsonl'), SKRAFT_CONFIG: REAL_CONFIG }
  try { return fn({ dir, env, auditLog: env.SKRAFT_AUDIT_LOG }) } finally { rmSync(dir, { recursive: true, force: true }) }
}

const runEntry = (args, payload, env) =>
  execFileSync('node', [HOOK_CLI, ...args], { input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8', env })

test('hook entry: the manifest form reaches the guard from the payload tool name', () => withSandbox(({ env }) => {
  const output = JSON.parse(runEntry(['PreToolUse'], STATE_WRITE, env))
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny')
}))

test('hook entry: an irrelevant tool call returns before any guard runs', () => withSandbox(({ env, auditLog }) => {
  const stdout = runEntry(['PreToolUse'], { tool_name: 'read_file', tool_input: { filePath: 'src/Foo.cs' } }, env)
  assert.equal(stdout, '')
  assert.equal(existsSync(auditLog), false, 'an irrelevant call must not reach a guard or its audit')
}))

test('hook entry: a skill read still reaches the PostToolUse tracer', () => withSandbox(({ env, auditLog }) => {
  runEntry(['PostToolUse'], { tool_name: 'view', tool_input: { path: '/x/plugins/skraft-framework/skills/outside-in-tdd/SKILL.md' } }, env)
  const events = readFileSync(auditLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.ok(events.some((entry) => entry.eventType === 'SkillRead' && entry.skillName === 'outside-in-tdd'))
}))

test('hook entry: a malformed payload takes the runner failure path', () => withSandbox(({ env, auditLog }) => {
  const stdout = runEntry(['PreToolUse'], '{"tool_name":"Bash", .copilot-tracking/skraft-plans/p/state.json', env)
  assert.equal(JSON.parse(stdout).hookSpecificOutput.permissionDecision, 'deny')
  assert.match(readFileSync(auditLog, 'utf8'), /HookFailed/)
}))

// Claude Code and the Copilot CLI substitute ${CLAUDE_PLUGIN_ROOT} into the command and run
// it through a shell: cmd.exe on Windows, /bin/sh elsewhere. The plugin path goes through a
// link whose name holds a space, the shape of a Windows profile path such as C:\Users\Jean Dupont.
test('hook entry: every manifest command runs through the platform shell from a path with a space', () => withSandbox(({ dir, env }) => {
  const linked = join(dir, 'plugin root')
  symlinkSync(pluginRoot, linked, process.platform === 'win32' ? 'junction' : 'dir')
  const commands = Object.entries(manifest.hooks)
    .filter(([event]) => event !== 'SessionStart')
    .flatMap(([event, entries]) => entries.flatMap((entry) => entry.hooks.map((hook) => [event, hook.command])))

  for (const [event, command] of commands) {
    const expanded = command.replaceAll('${CLAUDE_PLUGIN_ROOT}', linked)
    const result = spawnSync(expanded, { shell: true, input: JSON.stringify(event === 'PreToolUse' ? STATE_WRITE : { tool_name: 'read_file' }), encoding: 'utf8', env })
    assert.equal(result.status, 0, `${event}: ${result.stderr}`)
    if (event === 'PreToolUse') {
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny', `${event}: guard not reached`)
    }
  }
}))
