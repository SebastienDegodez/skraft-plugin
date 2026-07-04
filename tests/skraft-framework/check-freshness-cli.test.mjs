import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../../plugins/src/cli/check-freshness.mjs'

// Fixture repo carrying every surface the freshness gate reads.
const makeRepo = ({
  pluginVersion = '1.0.0',
  packageVersion = '1.0.0',
  apmVersion = '1.0.0',
  generatorVersion = '1.0.0',
  hookTypes = ['PreToolUse', 'SubagentStart', 'SubagentStop', 'PostToolUse', 'SessionStart'],
  workflowText = [
    'run: node plugins/src/cli/build-config-bin.mjs --check',
    'run: node plugins/src/cli/resolve-model-bin.mjs --check',
    'run: node plugins/src/cli/check-freshness-bin.mjs --check',
    'run: node --test tests/skraft-framework/*.test.mjs'
  ].join('\n')
} = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-freshness-'))
  mkdirSync(join(root, 'plugins/.claude-plugin'), { recursive: true })
  mkdirSync(join(root, 'plugins/src'), { recursive: true })
  mkdirSync(join(root, 'plugins/hooks'), { recursive: true })
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  writeFileSync(join(root, 'plugins/.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'skraft', version: pluginVersion }))
  writeFileSync(join(root, 'plugins/src/package.json'),
    JSON.stringify({ name: 'skraft-framework', version: packageVersion }))
  writeFileSync(join(root, 'apm.yml'), `name: skraft-plugin\nversion: ${apmVersion}\n`)
  writeFileSync(join(root, 'plugins/skraft-framework.config.json'),
    JSON.stringify({ _meta: { generatorVersion }, phaseOrder: [] }))
  const hooks = Object.fromEntries(hookTypes.map((t) => [t, []]))
  writeFileSync(join(root, 'plugins/hooks/hooks.json'), JSON.stringify({ hooks }))
  writeFileSync(join(root, '.github/workflows/skraft-framework-ci.yml'), workflowText)
  return root
}

const capture = () => {
  const out = []
  const errs = []
  return { io: { log: (...a) => out.push(a.join(' ')), error: (...a) => errs.push(a.join(' ')) }, out, errs }
}

test('check-freshness: exit 0 and "fresh" message when every surface is coherent', () => {
  const root = makeRepo()
  const { io, out } = capture()
  const code = main(['--check', '--root', root], io)
  assert.equal(code, 0)
  assert.ok(out.some((l) => /fresh/i.test(l)))
})

test('check-freshness: exit 1 with VERSION_DESYNC when package.json diverges from plugin.json', () => {
  const root = makeRepo({ packageVersion: '0.9.0' })
  const { io, errs } = capture()
  const code = main(['--check', '--root', root], io)
  assert.equal(code, 1)
  assert.ok(errs.some((l) => l.includes('VERSION_DESYNC') && l.includes('package.json')))
})

test('check-freshness: exit 1 with VERSION_DESYNC when the generated config carries a stale generatorVersion', () => {
  const root = makeRepo({ generatorVersion: '0.5.0' })
  const { io, errs } = capture()
  const code = main(['--check', '--root', root], io)
  assert.equal(code, 1)
  assert.ok(errs.some((l) => l.includes('VERSION_DESYNC') && l.includes('skraft-framework.config.json')))
})

test('check-freshness: exit 1 with UNROUTED_HOOK when hooks.json declares an unroutable type', () => {
  const root = makeRepo({ hookTypes: ['PreToolUse', 'SubagentStart', 'SubagentStop', 'PostToolUse', 'SessionStart', 'SessionEnd'] })
  const { io, errs } = capture()
  const code = main(['--check', '--root', root], io)
  assert.equal(code, 1)
  assert.ok(errs.some((l) => l.includes('UNROUTED_HOOK') && l.includes('SessionEnd')))
})

test('check-freshness: exit 1 with CI_GATE_MISSING when a local gate has no CI step', () => {
  const root = makeRepo({
    workflowText: [
      'run: node plugins/src/cli/build-config-bin.mjs --check',
      'run: node --test tests/skraft-framework/*.test.mjs'
    ].join('\n')
  })
  const { io, errs } = capture()
  const code = main(['--check', '--root', root], io)
  assert.equal(code, 1)
  assert.ok(errs.some((l) => l.includes('CI_GATE_MISSING')))
})

test('check-freshness: medium findings alone do not fail the gate', () => {
  // SessionStart routable but not declared in the manifest = medium only.
  const root = makeRepo({ hookTypes: ['PreToolUse', 'SubagentStart', 'SubagentStop', 'PostToolUse'] })
  const { io, errs } = capture()
  const code = main(['--check', '--root', root], io)
  assert.equal(code, 0)
  assert.ok(errs.some((l) => l.includes('UNDECLARED_HOOK') && l.includes('SessionStart')))
})

test('check-freshness: --json emits a machine-readable summary', () => {
  const root = makeRepo({ packageVersion: '0.9.0' })
  const { io, out } = capture()
  const code = main(['--check', '--json', '--root', root], io)
  assert.equal(code, 1)
  const summary = JSON.parse(out.join('\n'))
  assert.equal(summary.ok, false)
  assert.ok(summary.findings.some((f) => f.code === 'VERSION_DESYNC'))
})

test('check-freshness: the REAL repo is fresh (boundary-to-boundary, like config-in-sync)', () => {
  const { io, errs } = capture()
  const code = main(['--check'], io)
  assert.equal(code, 0, `freshness drift in the real repo:\n${errs.join('\n')}`)
})
