import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkVersionSync,
  checkHooksParity,
  checkCiParity
} from '../../plugins/src/domain/freshness-policy.mjs'

// checkVersionSync ————————————————————————————————————————————————————

test('checkVersionSync: no findings when all versions match the master', () => {
  const findings = checkVersionSync({
    master: { source: 'plugins/.claude-plugin/plugin.json', version: '1.2.0' },
    others: [
      { source: 'plugins/src/package.json', version: '1.2.0' },
      { source: 'apm.yml', version: '1.2.0' }
    ]
  })
  assert.deepEqual(findings, [])
})

test('checkVersionSync: VERSION_DESYNC blocker for each source that diverges', () => {
  const findings = checkVersionSync({
    master: { source: 'plugins/.claude-plugin/plugin.json', version: '1.2.0' },
    others: [
      { source: 'plugins/src/package.json', version: '1.0.0' },
      { source: 'apm.yml', version: '1.2.0' }
    ]
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].code, 'VERSION_DESYNC')
  assert.equal(findings[0].severity, 'blocker')
  assert.equal(findings[0].source, 'plugins/src/package.json')
  assert.equal(findings[0].expected, '1.2.0')
  assert.equal(findings[0].actual, '1.0.0')
})

test('checkVersionSync: VERSION_MISSING blocker when a source has no version', () => {
  const findings = checkVersionSync({
    master: { source: 'plugins/.claude-plugin/plugin.json', version: '1.2.0' },
    others: [{ source: 'apm.yml', version: undefined }]
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].code, 'VERSION_MISSING')
  assert.equal(findings[0].severity, 'blocker')
  assert.equal(findings[0].source, 'apm.yml')
})

test('checkVersionSync: VERSION_MISSING when the master itself has no version', () => {
  const findings = checkVersionSync({
    master: { source: 'plugins/.claude-plugin/plugin.json', version: undefined },
    others: [{ source: 'apm.yml', version: '1.0.0' }]
  })
  assert.ok(findings.some((f) => f.code === 'VERSION_MISSING' && f.source === 'plugins/.claude-plugin/plugin.json'))
})

// checkHooksParity ————————————————————————————————————————————————————

test('checkHooksParity: no findings when declared and supported match', () => {
  const findings = checkHooksParity({
    declared: ['PreToolUse', 'SubagentStop'],
    supported: ['PreToolUse', 'SubagentStop']
  })
  assert.deepEqual(findings, [])
})

test('checkHooksParity: UNROUTED_HOOK blocker when the manifest declares a type the router cannot route', () => {
  const findings = checkHooksParity({
    declared: ['PreToolUse', 'SessionEnd'],
    supported: ['PreToolUse']
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].code, 'UNROUTED_HOOK')
  assert.equal(findings[0].severity, 'blocker')
  assert.equal(findings[0].actual, 'SessionEnd')
})

test('checkHooksParity: UNDECLARED_HOOK medium when the router supports a type the manifest never declares', () => {
  const findings = checkHooksParity({
    declared: ['PreToolUse'],
    supported: ['PreToolUse', 'SessionStart']
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].code, 'UNDECLARED_HOOK')
  assert.equal(findings[0].severity, 'medium')
  assert.equal(findings[0].actual, 'SessionStart')
})

// checkCiParity ———————————————————————————————————————————————————————

const WORKFLOW = `
      - name: Check config
        run: node plugins/src/cli/build-config-bin.mjs --check
      - name: Run tests with coverage
        run: |
          node --test --experimental-test-coverage \\
            tests/skraft-framework/*.test.mjs
`

test('checkCiParity: no findings when every gate marker appears in the workflow text', () => {
  const findings = checkCiParity({
    markers: [
      { gate: 'Guardrail config in sync', marker: 'build-config-bin.mjs --check' },
      { gate: 'Framework tests', marker: 'tests/skraft-framework/*.test.mjs' }
    ],
    workflowText: WORKFLOW
  })
  assert.deepEqual(findings, [])
})

test('checkCiParity: CI_GATE_MISSING high for each local gate absent from the workflow', () => {
  const findings = checkCiParity({
    markers: [
      { gate: 'Agent model policy', marker: 'resolve-model-bin.mjs --check' },
      { gate: 'Guardrail config in sync', marker: 'build-config-bin.mjs --check' }
    ],
    workflowText: WORKFLOW
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].code, 'CI_GATE_MISSING')
  assert.equal(findings[0].severity, 'high')
  assert.equal(findings[0].source, 'Agent model policy')
})
