import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isProtectedArtifactPath,
  commandMutatesProtectedArtifact,
  isWorkspacePath,
  commandWritesWorkspace,
  guardProtectedArtifact,
  guardWorkspaceWrite,
  evaluateSessionGuard
} from '../../plugins/src/domain/session-guard-policy.mjs'
import { STATE_WRITE_FORBIDDEN, UNMONITORED_WRITE } from '../../plugins/src/domain/error-codes.mjs'

const DELIVER_AGENTS = ['software-engineer', 'software-engineer-reviewer']

// ───────────────────────────────────────────────────────────────────────────
// G7 — protected-artifact detection primitives
// ───────────────────────────────────────────────────────────────────────────

test('isProtectedArtifactPath matches state.json and execution-log paths', () => {
  assert.equal(isProtectedArtifactPath('.copilot-tracking/skraft-plans/us11/state.json'), true)
  assert.equal(isProtectedArtifactPath('state.json'), true)
  assert.equal(isProtectedArtifactPath('logs/execution-log.jsonl'), true)
  assert.equal(isProtectedArtifactPath('logs/execution-log.json'), true)
})

test('isProtectedArtifactPath ignores unrelated files and non-strings', () => {
  assert.equal(isProtectedArtifactPath('src/state.json.md'), false)
  assert.equal(isProtectedArtifactPath('src/app.mjs'), false)
  assert.equal(isProtectedArtifactPath(undefined), false)
  assert.equal(isProtectedArtifactPath(''), false)
})

test('commandMutatesProtectedArtifact flags redirections into state.json', () => {
  assert.equal(commandMutatesProtectedArtifact('echo "{}" > .copilot-tracking/skraft-plans/us11/state.json'), true)
  assert.equal(commandMutatesProtectedArtifact('cat foo.json >> state.json'), true)
  assert.equal(commandMutatesProtectedArtifact('printf "{}" | tee state.json'), true)
})

test('commandMutatesProtectedArtifact flags mutating verbs on protected artifacts', () => {
  assert.equal(commandMutatesProtectedArtifact("sed -i 's/a/b/' state.json"), true)
  assert.equal(commandMutatesProtectedArtifact('rm state.json'), true)
  assert.equal(commandMutatesProtectedArtifact('mv other.json state.json'), true)
  assert.equal(commandMutatesProtectedArtifact('truncate -s0 logs/execution-log.jsonl'), true)
})

test('commandMutatesProtectedArtifact allows reads of protected artifacts', () => {
  assert.equal(commandMutatesProtectedArtifact('cat state.json'), false)
  assert.equal(commandMutatesProtectedArtifact('jq . state.json'), false)
  assert.equal(commandMutatesProtectedArtifact('grep currentPhase state.json'), false)
  assert.equal(commandMutatesProtectedArtifact('cat state.json > /tmp/copy.json'), false)
  assert.equal(commandMutatesProtectedArtifact('node plugins/src/cli/state.mjs get us11'), false)
  assert.equal(commandMutatesProtectedArtifact(undefined), false)
})

// ───────────────────────────────────────────────────────────────────────────
// G8 — workspace detection primitives
// ───────────────────────────────────────────────────────────────────────────

test('isWorkspacePath matches src/ and tests/ paths only', () => {
  assert.equal(isWorkspacePath('src/app.mjs'), true)
  assert.equal(isWorkspacePath('/repo/tests/foo.test.mjs'), true)
  assert.equal(isWorkspacePath('docs/site/en/index.md'), false)
  assert.equal(isWorkspacePath(undefined), false)
})

test('commandWritesWorkspace flags shell writes into src/ or tests/', () => {
  assert.equal(commandWritesWorkspace('echo x > src/app.mjs'), true)
  assert.equal(commandWritesWorkspace('rm src/old.mjs'), true)
  assert.equal(commandWritesWorkspace('cat src/app.mjs'), false)
  assert.equal(commandWritesWorkspace('ls src'), false)
})

// ───────────────────────────────────────────────────────────────────────────
// G7 — guardProtectedArtifact
// ───────────────────────────────────────────────────────────────────────────

test('guardProtectedArtifact denies a Write to state.json', () => {
  const result = guardProtectedArtifact({ filePath: 'us11/state.json' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, STATE_WRITE_FORBIDDEN)
})

test('guardProtectedArtifact denies a shell mutation of state.json', () => {
  const result = guardProtectedArtifact({ command: 'echo "{}" > us11/state.json' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, STATE_WRITE_FORBIDDEN)
})

test('guardProtectedArtifact allows a read of state.json', () => {
  const result = guardProtectedArtifact({ command: 'cat us11/state.json' })
  assert.equal(result.ok, true)
})

// ───────────────────────────────────────────────────────────────────────────
// G8 — guardWorkspaceWrite
// ───────────────────────────────────────────────────────────────────────────

test('guardWorkspaceWrite blocks a src/ write outside a monitored DELIVER agent', () => {
  const result = guardWorkspaceWrite({ filePath: 'src/app.mjs', phase: 'DELIVER', agentName: null, deliverAgents: DELIVER_AGENTS })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, UNMONITORED_WRITE)
})

test('guardWorkspaceWrite allows a src/ write by the monitored DELIVER specialist', () => {
  const result = guardWorkspaceWrite({ filePath: 'src/app.mjs', phase: 'DELIVER', agentName: 'software-engineer', deliverAgents: DELIVER_AGENTS })
  assert.equal(result.ok, true)
})

test('guardWorkspaceWrite is inactive outside DELIVER', () => {
  const result = guardWorkspaceWrite({ filePath: 'src/app.mjs', phase: 'DESIGN', agentName: null, deliverAgents: DELIVER_AGENTS })
  assert.equal(result.ok, true)
})

test('guardWorkspaceWrite ignores non-workspace writes during DELIVER', () => {
  const result = guardWorkspaceWrite({ filePath: 'docs/notes.md', phase: 'DELIVER', agentName: null, deliverAgents: DELIVER_AGENTS })
  assert.equal(result.ok, true)
})

test('guardWorkspaceWrite blocks a shell write into tests/ outside a monitored agent', () => {
  const result = guardWorkspaceWrite({ command: 'echo x > tests/foo.test.mjs', phase: 'DELIVER', agentName: 'orchestrator', deliverAgents: DELIVER_AGENTS })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, UNMONITORED_WRITE)
})

// ───────────────────────────────────────────────────────────────────────────
// Combined evaluator — G7 precedence
// ───────────────────────────────────────────────────────────────────────────

test('evaluateSessionGuard enforces G7 before G8', () => {
  const result = evaluateSessionGuard({ filePath: 'us11/state.json', phase: 'DELIVER', agentName: null, deliverAgents: DELIVER_AGENTS })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, STATE_WRITE_FORBIDDEN)
})

test('evaluateSessionGuard returns Ok when neither guard trips', () => {
  const result = evaluateSessionGuard({ command: 'cat state.json', phase: 'DESIGN', agentName: 'solution-architect', deliverAgents: DELIVER_AGENTS })
  assert.equal(result.ok, true)
})
