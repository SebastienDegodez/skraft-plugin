// Acceptance — a real harness dispatch is refused when its prompt drops an input an
// earlier phase recorded, and allowed once the prompt carries the handoff block. The
// dispatch journal records every subagent start for the timeline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG, producePhase, stateCli } from '../state/phase-closure-fixture.mjs'

const HOOK_CLI = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/hook.mjs', import.meta.url))

const withPipelineInDeliver = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-g9-'))
  const auditLog = join(root, 'audit.jsonl')
  const env = { ...process.env, SKRAFT_TRACKING_ROOT: root, SKRAFT_AUDIT_LOG: auditLog }
  delete env.SKRAFT_PROJECT_SLUG
  try {
    const cli = stateCli({ root, env: { SKRAFT_AUDIT_LOG: auditLog } })
    cli('init', '--slug', 'demo')
    for (const phase of CONFIG.phaseOrder.slice(0, CONFIG.phaseOrder.indexOf('DELIVER'))) {
      cli('mark-phase-started', '--slug', 'demo', '--phase', phase)
      const review = producePhase({ root, slug: 'demo', phase, cli })
      const next = CONFIG.phaseOrder[CONFIG.phaseOrder.indexOf(phase) + 1]
      if (review) cli('transition', '--slug', 'demo', '--to', next)
      else cli('close-phase', '--slug', 'demo', '--phase', phase, '--verdict', 'APPROVED')
    }
    cli('mark-phase-started', '--slug', 'demo', '--phase', 'DELIVER')
    fn({ env, cli, auditLog })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const hook = (env, args, payload) => {
  const stdout = execFileSync('node', [HOOK_CLI, ...args], { input: JSON.stringify(payload), encoding: 'utf8', env })
  return stdout.trim() ? JSON.parse(stdout) : undefined
}

const dispatch = (prompt) => ({
  session_id: 's-1',
  cwd: '/tmp',
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  tool_input: { subagent_type: 'skraft:software-engineer', description: 'deliver', prompt },
})

test('a DELIVER dispatch that omits the test-plan is refused and told what is missing', () => {
  withPipelineInDeliver(({ env }) => {
    const denied = hook(env, ['PreToolUse', 'Agent'], dispatch('Implement the story.'))

    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /HANDOFF_INCOMPLETE|test-plan/)
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /state\.mjs handoff/)
  })
})

test('a DELIVER dispatch that pastes the handoff block is allowed', () => {
  withPipelineInDeliver(({ env, cli }) => {
    const block = cli('handoff', '--slug', 'demo', '--agent', 'software-engineer')

    assert.equal(hook(env, ['PreToolUse', 'Agent'], dispatch(`Implement the story.\n\n${block}`)), undefined)
  })
})

test('a subagent start is journalled with its phase and role', () => {
  withPipelineInDeliver(({ env, auditLog }) => {
    hook(env, ['SubagentStart'], { hook_event_name: 'SubagentStart', agent_type: 'software-engineer', agent_id: 'a-1' })

    const started = readFileSync(auditLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
      .filter((record) => record.eventType === 'SubagentStarted')
    assert.equal(started.length, 1)
    assert.equal(started[0].phase, 'DELIVER')
    assert.equal(started[0].role, 'specialist')
    assert.equal(started[0].projectSlug, 'demo')
  })
})
