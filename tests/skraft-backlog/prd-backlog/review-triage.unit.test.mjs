// The planning review read story by story: a dependency the approved map declares and orders is
// not a defect; one it lacks goes to the map's owner; a weak story no longer rejects its epic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parseLensResult } from '../../../plugins/skraft-backlog/skills/backlog-review-lenses/scripts/review-verdict.mjs'
import { judgedOnly, storyVerdicts, triageDefects } from '../../../plugins/skraft-backlog/prd-backlog/review.mjs'
import { normalizeStoryMap } from '../../../plugins/skraft-backlog/prd-backlog/story-map.mjs'
import { storyMap } from './fixtures/backlog-data.mjs'

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/skwad/${name}`, import.meta.url)), 'utf8')
const skwadMap = /** @type {any} */ (normalizeStoryMap(JSON.parse(fixture('story-map.orig.json'))).map)
const lens = (name, defects) => ({ lens: name, verdict: defects.length ? 'fail' : 'pass', defects })
const defect = (story, description, extra = {}) => ({ id: 'D1', gate: 'G1', severity: 'high', story, location: story, description, ...extra })

test('skwad EP-006: "not Independent" findings on dependencies the map declares are dismissed, the others kept', () => {
  const invest = parseLensResult(fixture('EP-006-planning-invest.yaml'))
  const { results, dismissed } = triageDefects([invest], skwadMap)
  const gone = dismissed.map((d) => `${d.story} ${d.id}`)
  assert.ok(gone.includes('EP-006-S1 D2'), 'EP-006-S1 waits on EP-005-S1, declared in its after')
  assert.ok(gone.includes('EP-006-S4 D8'), 'EP-006-S4 waits on S1, S2 and S3, all declared')
  assert.ok(gone.includes('EP-006-S5 D10'), 'EP-006-S5 waits on EP-006-S3, declared')
  assert.match(dismissed.find((d) => d.id === 'D2')?.reason ?? '', /EP-005-S1 declared and ordered in the approved story map/)
  const kept = results[0].defects.map((d) => d.id)
  assert.ok(kept.includes('D1'), 'a Testable finding stays')
  assert.ok(!kept.includes('D2') && !kept.includes('D10'))
  assert.ok(dismissed.every((d) => !/Small|Testable/.test(d.description ?? '')), 'a finding that also fails another letter is never dismissed')
})

test('skwad EP-006: a dependency the map does not order goes to SLICE as an after proposal, not to the writer', () => {
  const dor = parseLensResult(fixture('EP-006-planning-dor.yaml'))
  const { results, slice } = triageDefects([dor], skwadMap)
  assert.deepEqual(slice.map((p) => [p.story, p.add, p.after, p.proposed]), [
    ['EP-006-S5', ['EP-006-S4'], ['EP-006-S3'], ['EP-006-S3', 'EP-006-S4']],
    ['EP-006-S7', ['EP-006-S5'], ['EP-006-S3'], ['EP-006-S3', 'EP-006-S5']],
  ], 'EP-006-S2 is already ordered before EP-006-S7 through EP-006-S3')
  assert.deepEqual(results[0].defects, [])
  assert.equal(results[0].verdict, 'pass', 'a lens left with no defect passes')
})

test('each story gets its own verdict: a blocker on one story does not reject the others', () => {
  const ids = ['EP-001-S01', 'EP-001-S02', 'EP-001-S03']
  const results = [
    lens('planning-invest', [defect('EP-001-S03', 'Valuable: shows nothing to the driver', { severity: 'blocker' })]),
    lens('planning-ac-quality', []), lens('planning-coherence', []),
    lens('planning-dor', [defect('EP-001-S02', 'Generic Data in the examples', { gate: 'G8', severity: 'low' })]),
  ]
  const verdicts = storyVerdicts(results, ids)
  assert.deepEqual(ids.map((id) => verdicts.get(id)?.verdict), ['APPROVED', 'APPROVED', 'REJECTED'])
  assert.deepEqual(verdicts.get('EP-001-S03')?.findings.map((f) => f.description), ['Valuable: shows nothing to the driver'])
  const unnamed = storyVerdicts([...results.slice(0, 3), lens('planning-dor', [defect('', 'the sprint overruns its capacity', { gate: 'G5', severity: 'medium' })])], ids)
  assert.deepEqual(ids.map((id) => unnamed.get(id)?.verdict), ['NEEDS_REWORK', 'NEEDS_REWORK', 'REJECTED'], 'a finding naming no story applies to every story')
})

test('a dependency finding that names no story id is kept: nothing proves it declared', () => {
  const { results, dismissed, slice } = triageDefects([lens('planning-invest', [defect('EP-001-S02', 'Fails Independent: it needs the previous step')])], storyMap())
  assert.equal(results[0].defects.length, 1)
  assert.deepEqual([dismissed, slice], [[], []])
})

const round6 = (name) => parseLensResult(readFileSync(fileURLToPath(new URL(`./fixtures/skwad/ep-001/round6-${name}.yaml`, import.meta.url)), 'utf8'))
const EP001 = ['EP-001-S1', 'EP-001-S2', 'EP-001-S3']

test('skwad round 6: S2 and S3, held before the review, were judged blind; their defects are discarded and never land on S1', () => {
  const results = [round6('planning-invest'), round6('planning-coherence')]
  const { results: kept, discarded } = judgedOnly(results, ['EP-001-S1'], EP001)
  assert.deepEqual([...new Set(discarded.map((d) => d.story))].sort(), ['EP-001-S2', 'EP-001-S3'])
  assert.ok(kept.every((r) => r.defects.every((d) => d.story === 'EP-001-S1')))
  const s1 = storyVerdicts(kept, ['EP-001-S1'], EP001).get('EP-001-S1')
  assert.ok(s1.findings.length > 0 && s1.findings.every((f) => f.story === 'EP-001-S1'), 'S1 keeps its own findings only')
  const leaked = storyVerdicts(results, ['EP-001-S1'], EP001).get('EP-001-S1')
  assert.ok(leaked.findings.every((f) => f.story === 'EP-001-S1'), 'even unfiltered, a defect naming another story of the epic never lands on S1')
})
