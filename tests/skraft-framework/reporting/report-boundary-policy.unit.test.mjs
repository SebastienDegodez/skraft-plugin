import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REPORT_KINDS, PUBLICATION_PATH, PENDING_PATH, latestReportData, latestHandoffNotes,
  boundReportData, reportRefs, reportingAddendum,
} from '../../../plugins/skraft-framework/src/domain/report-boundary-policy.mjs'

// Domain unit tests: report locations and the specialist reporting addendum.

test('report kinds and fixed publication paths', () => {
  assert.deepEqual([...REPORT_KINDS], ['forecast', 'outcome'])
  assert.equal(Object.isFrozen(REPORT_KINDS), true)
  assert.equal(PUBLICATION_PATH, 'reporting/publication.json')
  assert.equal(PENDING_PATH, 'reporting/pending.json')
})

test('latest dated file is the newest date regardless of listing order', () => {
  const files = [
    'reporting/2026-09-17/forecast-data.json',
    'reporting/2026-09-20/forecast-data.json',
    'reporting/2026-09-15/forecast-data.json',
    'reporting/2026-09-30/outcome-data.json',
    'reporting/2026-09-30/forecast-dataXjson',
  ]
  assert.equal(latestReportData('forecast', files), 'reporting/2026-09-20/forecast-data.json')
  assert.equal(latestReportData('outcome', files), 'reporting/2026-09-30/outcome-data.json')
  assert.equal(latestHandoffNotes(['reporting/2026-09-18/distill-handoff.md', 'reporting/2026-09-12/distill-handoff.md']),
    'reporting/2026-09-18/distill-handoff.md')
  assert.equal(latestHandoffNotes([]), null)
})

test('boundReportData tolerates missing data and defaults the media count to zero', () => {
  assert.deepEqual(boundReportData(undefined, {}), { maxMedia: 0 })
  assert.deepEqual(boundReportData({ maxMedia: 3 }, {}), { maxMedia: 3 })
  assert.deepEqual(boundReportData({ maxMedia: 3 }, { maxMedia: 1, reviewRef: 'r.md' }), { maxMedia: 1, reviewRef: 'r.md' })
})

test('reportRefs lists the repository references in order, criteria evidence included', () => {
  const data = {
    testPlanRef: 'plan/test-plan.md',
    qualityEvidenceRef: 'plan/evidence/q.json',
    reviewRef: undefined,
    changeLogRef: '/abs/change-log.md',
    criteria: [{ evidence: 'plan/evidence/g1.out' }, null, { evidence: '../escape' }, {}],
  }
  assert.deepEqual(reportRefs(data), ['plan/test-plan.md', 'plan/evidence/q.json', 'plan/evidence/g1.out'])
  assert.deepEqual(reportRefs({ testPlanRef: 'a.md', criteria: 'none' }), ['a.md'])
  assert.deepEqual(reportRefs({}), [])
})

test('DISTILL addendum body names the skill, data path, media policy and answer contract', () => {
  const addendum = reportingAddendum({
    phase: 'DISTILL', trackingPrefix: 'track/', date: '2026-09-17', story: 'checkout', maxMedia: 2,
  })
  assert.deepEqual(addendum, {
    title: 'Reporting (qa-reporting)',
    body: [
      '- Load the `qa-reporting` skill for the forecast handoff (Step 8).',
      '- Write the forecast data exactly at `track/reporting/2026-09-17/forecast-data.json`, with `"story": "checkout"`; leave `reviewRef` out.',
      '- Media policy: at most 2 embedded media.',
      '- End your answer with the repository-root-relative paths of the outer acceptance test(s) and of their RED evidence: the engineer receives your answer verbatim.',
    ].join('\n'),
  })
})

test('DELIVER addendum body says none when no forecast data or handoff notes exist', () => {
  const addendum = reportingAddendum({
    phase: 'DELIVER', trackingPrefix: 'track/', date: '2026-09-17', story: 'checkout', maxMedia: 0,
  })
  assert.deepEqual(addendum, {
    title: 'Reporting (qa-reporting)',
    body: [
      '- Load the `qa-reporting` skill for the outcome handoff.',
      '- Write the outcome data exactly at `track/reporting/2026-09-17/outcome-data.json`, with `"story": "checkout"`; leave `reviewRef` out.',
      '- Approved forecast data: none.',
      '- Acceptance tests and RED evidence, as the acceptance designer returned them: none.',
      '- Media policy: at most 0 embedded media.',
    ].join('\n'),
  })
})

test('DELIVER addendum body points at the forecast data and handoff notes when present', () => {
  const { body } = reportingAddendum({
    phase: 'DELIVER', trackingPrefix: 't/', date: '2026-09-17', story: 's', maxMedia: 1,
    forecastData: 'reporting/2026-09-16/forecast-data.json', handoffNotes: 'reporting/2026-09-16/distill-handoff.md',
  })
  assert.deepEqual(body.split('\n').slice(2), [
    '- Approved forecast data: `t/reporting/2026-09-16/forecast-data.json`.',
    '- Acceptance tests and RED evidence, as the acceptance designer returned them: `t/reporting/2026-09-16/distill-handoff.md`.',
    '- Media policy: at most 1 embedded media.',
  ])
})
