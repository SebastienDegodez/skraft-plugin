import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { proposedAdrs, interpretRatification } from '../../../plugins/skraft-framework/src/domain/pipeline/adr-ratification-policy.mjs'
import { readReviewOutcome } from '../../../plugins/skraft-framework/src/domain/pipeline/review-outcome.mjs'
import { reviewOutputPath } from '../../../plugins/skraft-framework/src/domain/pipeline/dispatch-brief.mjs'
import STATE_SCHEMA_DOCUMENT from '../../../plugins/skraft-framework/src/domain/state-schema-document.mjs'
import { ADR_INDEX_HEADER, review, PLUGIN_ROOT } from './fake-host.mjs'

test('adr-ratification: only Proposed rows are pending', () => {
  const index = `${ADR_INDEX_HEADER}| 001 | Bus | Accepted | x | y | alice | d |\n| 007 | Conformist | Proposed | x | y | — | d |\n`
  assert.deepEqual(proposedAdrs(index), [{ adr: '007', title: 'Conformist' }])
  assert.deepEqual(proposedAdrs(null), [])
  assert.deepEqual(proposedAdrs('no table here'), [])
})

test('adr-ratification: answers are read as all, per-ADR, amend or pause', () => {
  const pending = [{ adr: '007', title: 'A' }, { adr: '008', title: 'B' }]
  assert.deepEqual(interpretRatification('accept all', pending).verdicts, [{ adr: '007', verdict: 'Accepted' }, { adr: '008', verdict: 'Accepted' }])
  assert.deepEqual(interpretRatification('Reject All', pending).verdicts.map((v) => v.verdict), ['Rejected', 'Rejected'])
  const mixed = interpretRatification('7 accept\nADR-008 amend "split the context"', pending)
  assert.deepEqual(mixed.verdicts, [{ adr: '007', verdict: 'Accepted' }])
  assert.deepEqual(mixed.amendments, [{ adr: '008', note: 'split the context' }])
  assert.equal(interpretRatification('pause', pending).kind, 'pause')
  assert.equal(interpretRatification('', pending).kind, 'pause')
  assert.equal(interpretRatification('maybe later', pending).kind, 'pause')
})

test('review-outcome: verdict and escalation come from the file, nested lens statuses are ignored', () => {
  assert.deepEqual(
    { ...readReviewOutcome(review('NEEDS_REWORK', { escalation: 'environment' })), findings: undefined },
    { verdict: 'NEEDS_REWORK', escalation: 'environment', findings: undefined },
  )
  assert.equal(readReviewOutcome('lenses:\n  - status: "APPROVED"\n').verdict, null)
  assert.equal(readReviewOutcome(null).verdict, null)
})


test('dispatch-brief: {N} is the next review number of the phase', () => {
  assert.equal(reviewOutputPath({ phase: 'DESIGN', date: '2026-10-05', recordedReviews: 0 }), 'reviews/2026-10-05/design-review-1.md')
  assert.equal(reviewOutputPath({ phase: 'DELIVER', date: '2026-10-05', recordedReviews: 2 }), 'reviews/2026-10-05/deliver-review-3.md')
})

test('state-schema-document: the ES-module copy matches state.schema.json', () => {
  const json = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'src/domain/state.schema.json'), 'utf8'))
  assert.deepEqual(STATE_SCHEMA_DOCUMENT, json)
})

// The Claude Code mod runtime has no Node API: everything the use case imports must
// load without one, or the mod fails to load.
test('run-pipeline: its whole import graph uses no Node built-in', () => {
  const entry = join(PLUGIN_ROOT, 'src/application/pipeline/run-pipeline.mjs')
  const seen = new Set()
  const offenders = []
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const [, spec] of source.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (spec.startsWith('.')) visit(resolve(dirname(file), spec))
      else offenders.push(`${file.replace(PLUGIN_ROOT, '')} → ${spec}`)
    }
    if (/\brequire\(|import\(|process\.|createRequire/.test(source.replace(/\/\/.*$/gm, ''))) offenders.push(`${file.replace(PLUGIN_ROOT, '')} uses require/import()/process`)
  }
  visit(entry)
  assert.deepEqual(offenders, [])
  assert.ok(seen.size > 10)
})

