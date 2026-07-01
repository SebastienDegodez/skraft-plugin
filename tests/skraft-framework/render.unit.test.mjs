import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from '../../scripts/lib/render.mjs'

// simple variable substitution ————————————————————————————————————————

test('render substitutes a simple variable', () => {
  assert.equal(render('Hello {{name}}', { name: 'SKRAFT' }), 'Hello SKRAFT')
})

test('render resolves a dotted path', () => {
  assert.equal(render('{{verdict.score}}', { verdict: { score: '0.92' } }), '0.92')
})

test('render emits empty string for a missing variable', () => {
  assert.equal(render('x={{missing}}', {}), 'x=')
})

test('render treats {{{raw}}} the same as {{var}} in markdown context', () => {
  assert.equal(render('{{{body}}}', { body: 'a*b' }), 'a*b')
})

// section as a loop —————————————————————————————————————————————————

test('render loops a section over an array of objects', () => {
  const tpl = '{{#findings}}- {{label}}\n{{/findings}}'
  const data = { findings: [{ label: 'one' }, { label: 'two' }] }
  assert.equal(render(tpl, data), '- one\n- two\n')
})

test('render loops a scalar list with the dot reference', () => {
  const tpl = '{{#tags}}#{{.}} {{/tags}}'
  assert.equal(render(tpl, { tags: ['p1', 'effort-l'] }), '#p1 #effort-l ')
})

test('render exposes outer scope inside a loop item', () => {
  const tpl = '{{#rows}}{{phase}}:{{name}} {{/rows}}'
  const data = { phase: 'DISCOVER', rows: [{ name: 'a' }, { name: 'b' }] }
  assert.equal(render(tpl, data), 'DISCOVER:a DISCOVER:b ')
})

// section as a conditional ——————————————————————————————————————————

test('render renders a truthy non-array section once', () => {
  assert.equal(render('{{#body}}{{body}}{{/body}}', { body: 'present' }), 'present')
})

test('render skips a falsy section', () => {
  assert.equal(render('a{{#body}}{{body}}{{/body}}b', { body: '' }), 'ab')
})

test('render skips a section whose array is empty', () => {
  assert.equal(render('a{{#findings}}x{{/findings}}b', { findings: [] }), 'ab')
})

// inverted section ——————————————————————————————————————————————————

test('render renders an inverted section when value is falsy', () => {
  assert.equal(render('{{^findings}}none{{/findings}}', { findings: [] }), 'none')
})

test('render skips an inverted section when value is truthy', () => {
  assert.equal(render('{{^body}}none{{/body}}', { body: 'x' }), '')
})

// nesting ————————————————————————————————————————————————————————————

test('render handles nested sections', () => {
  const tpl = '{{#lenses}}{{name}}:{{#findings}}[{{.}}]{{/findings}} {{/lenses}}'
  const data = {
    lenses: [
      { name: 'L1', findings: ['a', 'b'] },
      { name: 'L2', findings: [] },
    ],
  }
  assert.equal(render(tpl, data), 'L1:[a][b] L2: ')
})
