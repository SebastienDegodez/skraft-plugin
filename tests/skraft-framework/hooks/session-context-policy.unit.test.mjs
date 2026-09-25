import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { envFileLines, sessionContext } from '../../../plugins/skraft-framework/src/domain/session-context-policy.mjs'

test('envFileLines: one export line a POSIX shell reads back verbatim, whatever the path', () => {
  for (const pluginRoot of ['/opt/skraft', "/Users/o'brien/skraft", '/tmp/with space/$HOME/`x`']) {
    const lines = envFileLines({ pluginRoot })
    assert.match(lines, /^export SKRAFT_PLUGIN_ROOT='.*'\n$/s)
    const echoed = execFileSync('sh', ['-c', `${lines}printf %s "$SKRAFT_PLUGIN_ROOT"`], { encoding: 'utf8' })
    assert.equal(echoed, pluginRoot)
  }
})

test('sessionContext: the absolute CLI path, without a trailing separator', () => {
  const context = sessionContext({ pluginRoot: '/opt/skraft/' })
  assert.equal(context, [
    'SKRAFT plugin root: /opt/skraft ($SKRAFT_PLUGIN_ROOT in Bash when set).',
    'Run the SKRAFT CLIs by absolute path, e.g. node "/opt/skraft/src/cli/state.mjs" get.',
  ].join('\n'))
  assert.equal(sessionContext({ pluginRoot: 'C:\\skraft\\' }).split('\n')[0], 'SKRAFT plugin root: C:\\skraft ($SKRAFT_PLUGIN_ROOT in Bash when set).')
})

test('sessionContext: names the active pipeline and its phase when there is one', () => {
  const lines = sessionContext({ pluginRoot: '/opt/skraft', activeSlug: 'pricing', currentPhase: 'DESIGN' }).split('\n')
  assert.equal(lines.length, 3)
  assert.equal(lines[2], 'Active pipeline: pricing, phase DESIGN — the SKRAFT hooks guard this pipeline; state.mjs select switches it.')
  assert.match(sessionContext({ pluginRoot: '/opt/skraft', activeSlug: 'x' }), /Active pipeline: x, phase unknown/)
})
