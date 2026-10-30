// The canvas page's own words: the same keys in French and in English, and every word the page
// asks for is there in both. The page falls back to the key it asked for when a word is missing,
// which a browser test would only notice in the one language it opens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dictionary, format, ui } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/canvas-ui/i18n.js'
import { PLUGIN_ROOT } from '../support/workspace.mjs'

const UI = join(PLUGIN_ROOT, 'engine', 'drivers', 'copilot-workflow', 'canvas-ui')

/** Every path to a leaf of a dictionary, e.g. `ui.skip`. */
const leaves = (value, prefix = '') => (value && typeof value === 'object'
  ? Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key))
  : [prefix])
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
const at = (language, path) => path.split('.').reduce((node, key) => node[key], dictionary(language))

/** The words the page asks for by a literal key: `ui(lang, 'key'`. */
const askedFor = () => ['view.js', 'app.js'].flatMap((file) => [...readFileSync(join(UI, file), 'utf8').matchAll(/\bui\(\s*lang\s*,\s*'([^']+)'/g)].map((match) => match[1]))

/** The words the page builds a key for, or asks for the model's sake: they are named here. */
const BUILT = [
  'skip', 'reopen', 'announceStatus', 'announceQuestion', 'answerHow',
  'phase_closed', 'phase_open', 'phase_pending', 'step_done', 'step_open', 'step_pending',
  'reason_no-directory', 'reason_pipeline-unreadable', 'reason_configuration-unreadable', 'reason_unsaved',
  'chain_verified', 'chain_tampered', 'chain_unverifiable', 'chain_none', 'chain_unreadable', 'journal_step', 'journal_decision',
]
const STATUSES = ['idle', 'running', 'waiting', 'done', 'blocked', 'tampered', 'not-initialised', 'no-directory', 'unreadable']

test('French and English have the same keys, each a non-empty string with the same {placeholders}', () => {
  const fr = leaves(dictionary('fr')).sort()
  assert.deepEqual(fr, leaves(dictionary('en')).sort())
  for (const path of fr) {
    const [french, english] = [at('fr', path), at('en', path)]
    assert.ok(typeof french === 'string' && french.trim() !== '', `fr: ${path}`)
    assert.ok(typeof english === 'string' && english.trim() !== '', `en: ${path}`)
    assert.deepEqual(placeholders(french), placeholders(english), path)
  }
})

test('every word the page asks for is in both languages', () => {
  for (const language of ['fr', 'en']) {
    const { ui: words, status } = dictionary(language)
    for (const key of new Set([...askedFor(), ...BUILT])) assert.ok(key in words, `${language}: ui.${key}`)
    for (const key of STATUSES) assert.ok(key in status, `${language}: status.${key}`)
  }
})

test('ui puts each parameter in place and falls back to the key', () => {
  assert.equal(format('{count} of {min}', { count: 2, min: 3 }), '2 of 3')
  assert.equal(format('{value}', { value: null }), '')
  assert.equal(format('no parameter'), 'no parameter')
  assert.equal(ui('en', 'no-such-key'), 'no-such-key')
  assert.equal(ui('fr', 'agentsCount', { count: 3 }), '3 agents')
})
