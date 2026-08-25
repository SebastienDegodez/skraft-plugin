import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Guards the Claude Code <-> Copilot hook manifest parity. The two harnesses use
// different schemas (PascalCase + matcher vs camelCase + bash/powershell pair), but they
// must drive the SAME routes into the same CLI: a guardrail silently present on one
// harness and absent on the other is exactly the drift this repo ports hooks to avoid.
const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '../../plugins/skraft-framework')

const claude = JSON.parse(readFileSync(join(pluginRoot, 'com.anthropic.claude-code/hooks/hooks.json'), 'utf8'))
const copilot = JSON.parse(readFileSync(join(pluginRoot, 'com.github.copilot/hooks/hooks.json'), 'utf8'))

// Claude declares PascalCase events, Copilot the same events lower-camel-cased.
const toCopilotEvent = (event) => event.charAt(0).toLowerCase() + event.slice(1)

// A route is what actually reaches the CLI: the script plus its forwarded args, with the
// harness-specific plugin-root variable stripped so the two schemas become comparable.
const routeOf = (command) => command
  .replace(/\$\{CLAUDE_PLUGIN_ROOT\}|\$\{PLUGIN_ROOT\}/g, '<pluginRoot>')
  .replace(/"/g, '')
  .trim()

const claudeRoutes = (event) => (claude.hooks[event] ?? [])
  .flatMap((entry) => entry.hooks ?? [])
  .map((hook) => routeOf(hook.command))
  .sort()

const copilotRoutes = (event) => (copilot.hooks[toCopilotEvent(event)] ?? [])
  .map((entry) => routeOf(entry.bash))
  .sort()

test('hook-manifest-parity: both harnesses declare the same events', () => {
  const claudeEvents = Object.keys(claude.hooks).map(toCopilotEvent).sort()
  const copilotEvents = Object.keys(copilot.hooks).sort()

  assert.deepEqual(copilotEvents, claudeEvents)
})

test('hook-manifest-parity: every event drives the same CLI routes on both harnesses', () => {
  for (const event of Object.keys(claude.hooks)) {
    assert.deepEqual(
      copilotRoutes(event),
      claudeRoutes(event),
      `event ${event} routes differ between the Claude Code and Copilot manifests`,
    )
  }
})

test('hook-manifest-parity: copilot commands resolve from the plugin root, not the project', () => {
  const entries = Object.values(copilot.hooks).flat()
  assert.ok(entries.length > 0, 'copilot manifest declares no hook entry')

  for (const entry of entries) {
    for (const shell of ['bash', 'powershell']) {
      assert.match(
        entry[shell],
        /\$\{PLUGIN_ROOT\}/,
        `${shell} command must resolve through \${PLUGIN_ROOT} so it works once installed, not only on a repo checkout`,
      )
    }
    // Both shells must invoke the same route: a divergence would make the guardrail
    // behave differently on Windows than on macOS/Linux.
    assert.equal(routeOf(entry.bash), routeOf(entry.powershell))
  }
})
