import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Audits the REAL committed plugins/hooks/hooks.json (not a fixture): guards against
// a hook wiring regression that unit tests on hook-router.mjs cannot catch, since those
// exercise the router in isolation from the manifest that actually drives it in prod.
const here = dirname(fileURLToPath(import.meta.url))
const hooksJsonPath = join(here, '../../plugins/hooks/hooks.json')
const hooksManifest = JSON.parse(readFileSync(hooksJsonPath, 'utf8'))

// Every route the framework relies on (see hook.mjs / service-factory.mjs wiring).
// event + matcher (undefined when the event has no matcher) → each must route to hook.mjs
// with the event name (and matcher, when present) forwarded as CLI args so hook.mjs
// dispatches to the correct service.
const EXPECTED_ROUTES = [
  { event: 'PreToolUse', matcher: 'Agent' },
  { event: 'PreToolUse', matcher: 'Bash' },
  { event: 'SubagentStart', matcher: undefined },
  { event: 'SubagentStop', matcher: undefined },
  { event: 'PostToolUse', matcher: 'Agent' },
  { event: 'PostToolUse', matcher: 'Read' }
]

const findEntry = (manifest, event, matcher) => {
  const entries = manifest.hooks?.[event] ?? []
  return entries.find((entry) => entry.matcher === matcher)
}

for (const { event, matcher } of EXPECTED_ROUTES) {
  test(`real-hook-audit: ${event}${matcher ? ` (matcher ${matcher})` : ''} is routed to hook.mjs`, () => {
    const entry = findEntry(hooksManifest, event, matcher)
    assert.ok(entry, `hooks.json must declare an entry for ${event}${matcher ? `/${matcher}` : ''}`)

    const commands = (entry.hooks ?? []).map((h) => h.command)
    assert.ok(commands.length > 0, `${event}${matcher ? `/${matcher}` : ''} entry must declare at least one command`)

    const command = commands[0]
    assert.match(command, /hook\.mjs/, `${event}${matcher ? `/${matcher}` : ''} must invoke hook.mjs`)
    assert.match(
      command,
      new RegExp(`hook\\.mjs["']?\\s+${event}(\\s|$)`),
      `${event}${matcher ? `/${matcher}` : ''} command must forward the event name so hook-router can dispatch it`
    )
    if (matcher) {
      assert.match(
        command,
        new RegExp(`${event}\\s+${matcher}(\\s|$|")`),
        `${event}/${matcher} command must forward the matcher so hook-router can distinguish tools`
      )
    }
  })
}

test('real-hook-audit: SessionStart runs the housekeeping CLI (US12)', () => {
  const entries = hooksManifest.hooks?.SessionStart ?? []
  assert.ok(entries.length > 0, 'hooks.json must declare a SessionStart entry')
  const commands = (entries[0].hooks ?? []).map((h) => h.command)
  assert.ok(commands.length > 0, 'SessionStart entry must declare at least one command')
  assert.match(commands[0], /housekeeping\.mjs/, 'SessionStart must invoke housekeeping.mjs')
})

test('real-hook-audit: hooks.json declares no unexpected top-level events', () => {
  const declaredEvents = Object.keys(hooksManifest.hooks ?? {})
  const expectedEvents = [...new Set(EXPECTED_ROUTES.map((r) => r.event)), 'SessionStart']
  for (const event of declaredEvents) {
    assert.ok(expectedEvents.includes(event), `unexpected event ${event} declared in hooks.json but not audited here`)
  }
})
