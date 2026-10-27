// The canvas vocabulary: one wording per check, its reason and its fix, in French and in English.
// The panel and the agent's explanation read the same words.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DOR, INVEST } from '../../../plugins/skraft-backlog/prd-backlog/canvas/assess.mjs'
import { DICTIONARIES, dictionary, explanation, format, lineLabel, response, ui } from '../../../plugins/skraft-backlog/prd-backlog/canvas/ui/i18n.mjs'
import { STORY_RULES } from '../../../plugins/skraft-backlog/prd-backlog/story.mjs'

const MAP_RULES = ['held-blocker', 'effort-at-limit', 'open-questions']

/** Every path to a leaf of a dictionary, e.g. `rules.vague-persona.0`. */
const leaves = (value, prefix = '') => (value && typeof value === 'object'
  ? Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key))
  : [prefix])
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

test('format puts each parameter in its place; a list reads "a, b", an empty list or a missing value a dash', () => {
  assert.equal(format('{count} of {min}', { count: 2, min: 3 }), '2 of 3')
  assert.equal(format('waits on [{found}]', { found: ['EP-001-S01', 'EP-001-S03'] }), 'waits on [EP-001-S01, EP-001-S03]')
  assert.equal(format('[{found}] / {missing}', { found: [] }), '[—] / —')
  assert.equal(format('{value}', { value: null }), '—')
  assert.equal(format('no parameter'), 'no parameter')
})

test('both dictionaries hold the same keys, every leaf a non-empty string', () => {
  const fr = leaves(DICTIONARIES.fr).sort()
  const en = leaves(DICTIONARIES.en).sort()
  assert.deepEqual(fr, en)
  for (const language of ['fr', 'en']) {
    for (const path of fr) {
      const text = path.split('.').reduce((node, key) => node[key], DICTIONARIES[language])
      assert.ok(typeof text === 'string' && text.trim() !== '', `${language}: ${path}`)
    }
  }
  assert.ok(Object.isFrozen(DICTIONARIES))
})

test('every rule of the checks and of the map has a reason and a fix in French and in English, with the same parameters', () => {
  for (const rule of [...Object.keys(STORY_RULES), ...MAP_RULES]) {
    for (const language of ['fr', 'en']) {
      const entry = DICTIONARIES[language].rules[rule]
      assert.ok(Array.isArray(entry) && entry.length === 2, `${language}: ${rule}`)
    }
    assert.deepEqual(placeholders(DICTIONARIES.fr.rules[rule].join(' ')), placeholders(DICTIONARIES.en.rules[rule].join(' ')), rule)
  }
  assert.deepEqual(Object.keys(DICTIONARIES.en.rules).sort(), [...Object.keys(STORY_RULES), ...MAP_RULES].sort(), 'no rule is worded that nothing emits')
})

test('every state, review, missing reason, source and severity is worded', () => {
  for (const language of ['fr', 'en']) {
    const words = dictionary(language)
    assert.deepEqual(Object.keys(words.states).sort(), ['held', 'published', 'ready', 'refused', 'unwritten', 'written'])
    assert.deepEqual(Object.keys(words.reviews).sort(), ['none', 'reviewed', 'stale'])
    assert.deepEqual(Object.keys(words.missing).sort(), ['not-planned', 'not-ready', 'not-reviewed', 'review-stale', 'unknown'])
    assert.deepEqual(Object.keys(words.sources).sort(), ['check', 'lens', 'map'])
    assert.deepEqual(Object.keys(words.severities).sort(), ['blocker', 'high', 'low', 'medium'])
    assert.deepEqual(Object.keys(words.invest), INVEST)
    assert.deepEqual(Object.keys(words.dor), DOR)
  }
})

test('the dictionary of an unknown language is English', () => {
  assert.equal(dictionary('fr'), DICTIONARIES.fr)
  assert.equal(dictionary('en'), DICTIONARIES.en)
  assert.equal(dictionary('de'), DICTIONARIES.en)
  assert.equal(dictionary(undefined), DICTIONARIES.en)
})

const noPlaceholder = (text) => assert.doesNotMatch(text, /\{\w+\}/, text)

test('ui words every key of the panel with its parameters, and falls back to the key', () => {
  for (const language of ['fr', 'en']) {
    for (const [key, template] of Object.entries(DICTIONARIES[language].ui)) {
      const params = Object.fromEntries(placeholders(template).map((name) => [name, `<${name}>`]))
      const text = ui(language, key, params)
      noPlaceholder(text)
      for (const name of Object.keys(params)) assert.ok(text.includes(`<${name}>`), `${language}.${key} shows ${name}`)
    }
  }
  assert.match(ui('fr', 'coverage', { covered: 3, fr: 4, deferred: 1 }), /3\/4 .*1/)
  assert.notEqual(ui('fr', 'coverage', { covered: 3, fr: 4, deferred: 1 }), ui('en', 'coverage', { covered: 3, fr: 4, deferred: 1 }))
  assert.equal(ui('en', 'no-such-key'), 'no-such-key')
  assert.equal(ui('fr', 'no {such} key', { such: 'such' }), 'no such key')
})

test('lineLabel names each INVEST letter and DoR item and its challenge, in the language asked', () => {
  for (const language of ['fr', 'en']) {
    for (const line of INVEST) assert.deepEqual(Object.values(lineLabel(language, line)), DICTIONARIES[language].invest[line])
    for (const line of DOR) assert.deepEqual(Object.values(lineLabel(language, line)), DICTIONARIES[language].dor[line])
  }
  assert.deepEqual(Object.keys(lineLabel('fr', '7')), ['name', 'challenge'])
  assert.equal(lineLabel('en', 'T').name, 'Testable')
  assert.notEqual(lineLabel('fr', 'I').name, lineLabel('en', 'I').name)
})

test('explanation words a check through its rule and its values, and lets a lens finding speak for itself', () => {
  const check = { source: 'check', rule: 'technical-ac', params: { criterion: 'AC-02', found: 'HTTP 403' }, message: 'AC-02 names system internals or HTTP details (Technical AC)' }
  const fr = explanation('fr', check)
  const en = explanation('en', check)
  for (const words of [fr, en]) {
    assert.ok(words.why.includes('AC-02') && words.why.includes('HTTP 403'), words.why)
    assert.ok(words.fix.trim())
    noPlaceholder(`${words.why} ${words.fix}`)
  }
  assert.notEqual(fr.why, en.why)
  assert.notEqual(fr.why, check.message, 'a known rule is worded by the dictionary, not by the raw message')
  const mismatch = explanation('en', { source: 'check', rule: 'dependencies-mismatch', params: { found: [], planned: ['EP-001-S01', 'EP-001-S03'] }, message: '…' })
  assert.ok(mismatch.why.includes('[—]') && mismatch.why.includes('EP-001-S01, EP-001-S03'), mismatch.why)
  const held = explanation('fr', { source: 'map', rule: 'held-blocker', params: { story: 'EP-002-S01' }, message: 'waits on EP-002-S01, which is held back' })
  assert.ok(held.why.includes('EP-002-S01') && held.fix.includes('EP-002-S01'))
  const lens = { source: 'lens', rule: 'technical-ac', message: 'DoR item 7: no registry', suggestion: 'Name the registry.' }
  assert.deepEqual(explanation('fr', lens), { why: 'DoR item 7: no registry', fix: 'Name the registry.' })
  assert.deepEqual(explanation('en', { source: 'lens', message: 'vague' }), { why: 'vague', fix: '' })
  assert.deepEqual(explanation('en', { source: 'check', rule: 'a-rule-of-tomorrow', message: 'raw message' }), { why: 'raw message', fix: '' })
  assert.deepEqual(explanation('fr', { source: 'map', message: 'no rule at all', suggestion: 'do this' }), { why: 'no rule at all', fix: 'do this' })
})

test('a pending line answers that the file is still to write, whatever its facts', () => {
  for (const language of ['fr', 'en']) {
    for (const line of [...INVEST, ...DOR]) assert.equal(response(language, line, { status: 'pending', facts: {} }), DICTIONARIES[language].responses.pending)
  }
  assert.notEqual(DICTIONARIES.fr.responses.pending, DICTIONARIES.en.responses.pending)
})

test('I answers with the held-back stories, else the stories it waits on, else no dependency', () => {
  for (const language of ['fr', 'en']) {
    const r = DICTIONARIES[language].responses
    const at = (facts) => response(language, 'I', { status: 'pass', facts })
    const held = at({ after: ['EP-001-S01', 'EP-001-S03'], held: ['EP-001-S01'] })
    const waits = at({ after: ['EP-001-S01', 'EP-001-S03'], held: [] })
    assert.ok(held.includes('EP-001-S01') && !held.includes('EP-001-S03'), held)
    assert.ok(waits.includes('EP-001-S01, EP-001-S03'), waits)
    assert.notEqual(held, waits)
    assert.equal(at({ after: [], held: [] }), r.noDependency)
    for (const text of [held, waits]) noPlaceholder(text)
  }
})

test('every other line answers with its facts, in French and in English', () => {
  for (const language of ['fr', 'en']) {
    const r = DICTIONARIES[language].responses
    const answers = (line, facts) => {
      const text = response(language, line, { status: 'warn', facts })
      noPlaceholder(text)
      return text
    }
    const shows = (text, ...values) => assert.ok(values.every((v) => text.includes(String(v))), `${language}: "${text}" shows ${values.join(', ')}`)
    shows(answers('N', { iWant: 'voir ma décision' }), 'voir ma décision')
    assert.notEqual(answers('N', { iWant: 'voir ma décision' }), 'voir ma décision', 'the goal is quoted')
    shows(answers('1', { iWant: 'see my decision' }), 'see my decision')
    assert.equal(answers('N', { iWant: null }), r.missing)
    assert.equal(answers('1', { iWant: '' }), r.missing)
    shows(answers('V', { persona: 'conducteur éligible', soThat: 'savoir' }), 'savoir')
    assert.ok(answers('V', { persona: 'conducteur éligible', soThat: null }).includes(r.missing))
    shows(answers('E', { points: 3, tasks: 2 }), 3, 2)
    assert.equal(answers('E', { points: 3, tasks: null }), format(r.points, { points: 3 }))
    shows(answers('S', { points: 5, criteria: 4 }), 5, 4)
    assert.equal(answers('S', { points: 5, criteria: null }), format(r.points, { points: 5 }))
    shows(answers('T', { linked: 5, criteria: 7, examples: 9 }), 7)
    shows(answers('2', { persona: 'conducteur de moins de 18 ans' }), 'conducteur de moins de 18 ans')
    shows(answers('3', { examples: 2 }), 2)
    shows(answers('4', { criteria: 3 }), 3)
    shows(answers('5', { linked: 1, criteria: 3 }), '1/3')
    shows(answers('6', { points: 8 }), 8)
    shows(answers('7', { notes: 1 }), 1)
    shows(answers('8', { dependencies: ['EP-001-S01', 'EP-001-S03'] }), 'EP-001-S01, EP-001-S03')
    assert.equal(answers('8', { dependencies: [] }), r.noDependency)
  }
})
