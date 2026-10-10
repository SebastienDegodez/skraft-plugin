import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  commandMutatesProtectedArtifact,
  commandWritesWorkspace,
  guardProtectedArtifact,
  guardOrchestratorWrite,
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

test('guardOrchestratorWrite: with no orchestrator declared, a named workspace write passes', () => {
  assert.deepEqual(guardOrchestratorWrite({ filePath: 'src/a.js', agentName: 'Stryker was here' }), {
    ok: true,
    value: { reason: 'workspace write by Stryker was here' },
  })
})
