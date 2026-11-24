import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openUnknowns } from '../../../../plugins/skraft-framework/engine/domain/pipeline/product-questions.mjs'

// An extracted rule, covered by the DESIGN scenario of design-records.test.mjs: how tolerant the
// reading of the three markers is.
test('an open Unknown is read whatever its list marker, bold, case, colon spacing or the language of the headings; a Decision anywhere in its entry answers it', () => {
  const text = [
    '## Questions produit',
    '1. **Q1** **Unknown:** Le remboursement après 30 jours ? Recommandation : non.',
    '* q2 — UNKNOWN : who signs the refund?',
    'Decision: 2026-10-11 — po — the store manager.',
    '- Q3 Is cash in scope?',
    '  Unknown: the story names card only.',
    '- Q4 Open question: a mailed receipt? Mentions an unknown: nothing.',
    '- Q5 Assumption: euros only.',
    '- Unknown: a line without its number is no entry.',
    '## Handoff to DESIGN',
    'Unknown: after a heading, no entry is open.',
  ].join('\r\n')

  assert.deepEqual(openUnknowns(text), [
    { id: 'Q1', question: 'Le remboursement après 30 jours ? Recommandation : non.' },
    { id: 'Q3', question: 'Is cash in scope?' },
  ])
})

test('a question line longer than a refusal shows is cut, and a document without entries has no open Unknown', () => {
  const [open] = openUnknowns(`- Q7 Unknown: ${'x'.repeat(200)}`)

  assert.equal(open.question.length, 120)
  assert.ok(open.question.endsWith('…'))
  assert.deepEqual(openUnknowns('# Research\n\nNone.\n'), [])
})
