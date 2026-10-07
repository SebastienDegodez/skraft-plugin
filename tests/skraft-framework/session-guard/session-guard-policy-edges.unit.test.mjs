import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  commandMutatesProtectedArtifact,
  commandWritesWorkspace,
  guardProtectedArtifact,
  guardWorkspaceWrite,
} from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'

const STATE = '.copilot-tracking/skraft-plans/us11/state.json'

test('commandMutatesProtectedArtifact: a rewriting binary under a directory whose name holds "=" is still the verb', () => {
  assert.equal(commandMutatesProtectedArtifact(`/opt/tools=v2/rm ${STATE}`), true)
  assert.equal(commandMutatesProtectedArtifact(`/opt/tools=v2/cat ${STATE}`), false)
})

test('commandWritesWorkspace: a mutating verb far from the workspace path on the same line', () => {
  assert.equal(commandWritesWorkspace('git rm --cached --ignore-unmatch -r -q -- build/output.txt docs/readme.md src/a.js'), true)
})

test('commandWritesWorkspace: a mutating verb on another line does not reach the workspace path', () => {
  assert.equal(commandWritesWorkspace('rm build/x\ncat src/a.js'), false)
})

test('guardProtectedArtifact: a harmless call passes with its reason', () => {
  assert.deepEqual(guardProtectedArtifact({ command: `cat ${STATE}` }), {
    ok: true,
    value: { reason: 'no direct write to a protected artifact' },
  })
  assert.deepEqual(guardProtectedArtifact(), { ok: true, value: { reason: 'no direct write to a protected artifact' } })
})

test('guardWorkspaceWrite: with no monitored agents declared, every DELIVER workspace write is refused', () => {
  const result = guardWorkspaceWrite({ phase: 'DELIVER', filePath: 'src/a.js', agentName: 'Stryker was here' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'UNMONITORED_WRITE')
  assert.equal(result.error.reason, 'src/ or tests/ write during DELIVER must run inside the monitored DELIVER sub-agent, not Stryker was here')
})
