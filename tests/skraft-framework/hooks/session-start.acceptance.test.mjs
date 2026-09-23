// Acceptance — SessionStart hands every later tool call the plugin's own location and
// the pipeline it works on: an agent's Bash reads $SKRAFT_PLUGIN_ROOT (Claude Code
// CLAUDE_ENV_FILE), and both harnesses receive the absolute path as session context.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const SESSION_START = join(PLUGIN, 'src/cli/housekeeping.mjs')
const STATE_CLI = join(PLUGIN, 'src/cli/state.mjs')

const inProject = (fn) => {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-session-')))
  const env = { ...process.env }
  for (const key of ['SKRAFT_TRACKING_ROOT', 'SKRAFT_AUDIT_LOG', 'SKRAFT_PROJECT_SLUG', 'CLAUDE_ENV_FILE', 'SKRAFT_CONFIG_ROOT']) delete env[key]
  try { fn({ project, env }) } finally { rmSync(project, { recursive: true, force: true }) }
}

const sessionStart = (env, cwd, extraEnv = {}) => {
  const stdout = execFileSync('node', [SESSION_START], {
    cwd,
    env: { ...env, ...extraEnv },
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd, session_id: 's' }),
    encoding: 'utf8',
  })
  return stdout.trim() ? JSON.parse(stdout) : undefined
}

test('SessionStart exports SKRAFT_PLUGIN_ROOT through CLAUDE_ENV_FILE', () => {
  inProject(({ project, env }) => {
    const envFile = join(project, 'claude-env.sh')
    writeFileSync(envFile, 'export EXISTING=1\n')
    sessionStart(env, project, { CLAUDE_ENV_FILE: envFile })

    const exported = readFileSync(envFile, 'utf8')
    assert.match(exported, /^export EXISTING=1\n/, 'appends, never overwrites')
    const script = `. '${envFile}' && printf %s "$SKRAFT_PLUGIN_ROOT"`
    const root = execFileSync('sh', ['-c', script], { encoding: 'utf8' })
    assert.ok(existsSync(join(root, 'src', 'cli', 'state.mjs')), `SKRAFT_PLUGIN_ROOT must hold the plugin: ${root}`)
  })
})

test('SessionStart gives the session the absolute plugin root and the active pipeline', () => {
  inProject(({ project, env }) => {
    const quiet = sessionStart(env, project)
    assert.equal(quiet.hookSpecificOutput.hookEventName, 'SessionStart')
    const context = quiet.hookSpecificOutput.additionalContext
    assert.equal(quiet.additionalContext, context)
    assert.ok(context.includes(`node "${PLUGIN.replace(/\/$/, '')}/src/cli/state.mjs"`), context)
    assert.doesNotMatch(context, /Active pipeline/)

    execFileSync('node', [STATE_CLI, 'init', '--slug', 'checkout-pricing'], { cwd: project, env, stdio: 'ignore' })
    const active = sessionStart(env, project).hookSpecificOutput.additionalContext
    assert.match(active, /Active pipeline: checkout-pricing, phase RESEARCH/)
  })
})

test('SessionStart writes its housekeeping summary to the audit log, not to the session', () => {
  inProject(({ project, env }) => {
    execFileSync('git', ['init', '-q'], { cwd: project })
    const out = sessionStart(env, project)
    assert.equal(out.skraftHousekeeping, undefined)

    const auditLog = join(project, '.git', 'skraft', 'skill-audit.jsonl')
    const entries = readFileSync(auditLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    const summary = entries.find((entry) => entry.eventType === 'HousekeepingRan')
    assert.equal(summary.auditPurged, 0)
    assert.equal(summary.signalsPurged, 0)
  })
})
