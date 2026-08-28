import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The plugin ships a single hook manifest, the Claude one, because it is the only manifest
// both Claude Code and VS Code load and interpolate. There is no second harness to stay in
// parity with any more, so what has to be guarded here is the manifest's own integrity:
// the route inventory, and the one field the adapter rewrites.
const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '../../plugins/skraft-framework')

const claude = JSON.parse(readFileSync(join(pluginRoot, 'com.anthropic.claude-code/hooks/hooks.json'), 'utf8'))

// A route is what actually reaches the CLI: the script plus its forwarded args, with the
// plugin-root variable stripped so it reads as a stable identity.
const routeOf = (command) => command
  .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, '<pluginRoot>')
  .replace(/"/g, '')
  .trim()

const routes = (event) => (claude.hooks[event] ?? [])
  .flatMap((entry) => entry.hooks ?? [])
  .map((hook) => routeOf(hook.command))
  .sort()

// A guardrail dropped from the manifest disables itself silently: nothing fails, the hook
// simply never fires. This inventory is the only thing that makes such a removal loud.
test('hook-manifest: the declared routes cover every guardrail event', () => {
  assert.deepEqual(Object.keys(claude.hooks).sort(), [
    'PostToolUse',
    'PreToolUse',
    'SessionStart',
    'SubagentStart',
    'SubagentStop',
  ])

  assert.deepEqual(routes('SessionStart'), ['node <pluginRoot>/src/cli/housekeeping.mjs'])
  assert.deepEqual(routes('PreToolUse'), [
    'node <pluginRoot>/src/cli/hook.mjs PreToolUse Agent',
    'node <pluginRoot>/src/cli/hook.mjs PreToolUse Bash',
  ])
  assert.deepEqual(routes('PostToolUse'), [
    'node <pluginRoot>/src/cli/hook.mjs PostToolUse Agent',
    'node <pluginRoot>/src/cli/hook.mjs PostToolUse Read',
  ])
  assert.deepEqual(routes('SubagentStart'), ['node <pluginRoot>/src/cli/hook.mjs SubagentStart'])
  assert.deepEqual(routes('SubagentStop'), ['node <pluginRoot>/src/cli/hook.mjs SubagentStop'])
})

// The Claude manifest is the one VS Code and Claude Code both load, and it is the only one
// whose commands VS Code rewrites: the Claude adapter substitutes ${CLAUDE_PLUGIN_ROOT} in
// `command` / `linux` / `osx` / `windows` and in no other field. A `bash`-only entry keeps
// the token literal, the shell expands it to nothing, and node is handed /src/cli/hook.mjs.
test('hook-manifest: claude commands carry the field the adapter interpolates', () => {
  const hooks = Object.values(claude.hooks).flat().flatMap((entry) => entry.hooks ?? [])
  assert.ok(hooks.length > 0, 'claude manifest declares no hook entry')

  for (const hook of hooks) {
    assert.equal(typeof hook.command, 'string')
    assert.match(hook.command, /\$\{CLAUDE_PLUGIN_ROOT\}/)
  }
})
