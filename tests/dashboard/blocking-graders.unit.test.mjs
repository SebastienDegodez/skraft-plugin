import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blockingGraders, renderBlockingGraders } from '../../eng/lib/blocking-graders.mjs'

const trial = (details, status = 'success') => ({
  type: 'trial-result',
  status,
  gradeResult: { details: details.map(([name, passed]) => ({ name, passed })) },
})

test('blockingGraders: no gradeable trial is reported as null, not as nothing blocking', () => {
  assert.equal(blockingGraders([]), null)
  assert.equal(blockingGraders([trial([['a', true]], 'error')]), null)
})

test('blockingGraders: counts clean sweeps and near misses apart', () => {
  const s = blockingGraders([
    trial([['a', true], ['b', true]]),
    trial([['a', false], ['b', true]]),
    trial([['a', false], ['b', false]]),
  ])
  assert.equal(s.gradedTrials, 3)
  assert.equal(s.cleanSweeps, 1)
  assert.equal(s.nearMisses, 1, 'only the trial failing exactly one grader is a near miss')
})

// The whole point: a grader that alone stops otherwise-clean trials is the
// cheapest thing to fix, so it must outrank a grader that fails more often
// but only alongside others.
test('blockingGraders: a sole blocker outranks a more frequent co-failure', () => {
  const s = blockingGraders([
    trial([['sole', false], ['other', true]]),
    trial([['sole', true], ['other', false], ['third', false]]),
    trial([['sole', true], ['other', false], ['third', false]]),
  ])
  assert.equal(s.byGrader[0].name, 'sole')
  assert.equal(s.byGrader[0].soleBlockerIn, 1)
  assert.equal(s.byGrader[0].failedIn, 1)
  const other = s.byGrader.find((g) => g.name === 'other')
  assert.equal(other.failedIn, 2, 'fails more often')
  assert.equal(other.soleBlockerIn, 0, 'but never alone, so it ranks lower')
})

// The activation grader answers "was the skill mounted", not "did the work
// land". Counting it would name it the top blocker on every under-activating
// arm and bury the graders a reader can actually act on.
test('blockingGraders: the activation grader is excluded from the ranking', () => {
  const s = blockingGraders([
    trial([['The skill under test is loaded', false], ['real', false]]),
    trial([['The skill under test is loaded', false], ['real', true]]),
  ])
  assert.equal(s.byGrader.length, 1)
  assert.equal(s.byGrader[0].name, 'real')
  assert.equal(s.cleanSweeps, 1, 'a trial failing only the activation grader swept every scored grader')
})

test('renderBlockingGraders: nothing to say renders nothing', () => {
  assert.equal(renderBlockingGraders(null, 'skilled'), null)
  assert.equal(renderBlockingGraders(blockingGraders([trial([['a', true]])]), 'skilled'), null)
})

test('renderBlockingGraders: names the arm, the sweep count and the sole blockers', () => {
  const out = renderBlockingGraders(
    blockingGraders([trial([['a', true]]), trial([['a', false]])]),
    'skilled',
  )
  assert.match(out, /skilled: 1\/2 trial\(s\) passed every grader; 1 missed by exactly one\./)
  assert.match(out, /- a: failed in 1\/2, sole blocker in 1/)
})

// A cap that silently truncates reads as "that is all of them".
test('renderBlockingGraders: says how many graders it did not list', () => {
  const many = Array.from({ length: 7 }, (_, i) => [`g${i}`, false])
  const out = renderBlockingGraders(blockingGraders([trial(many)]), 'skilled')
  assert.match(out, /2 further grader\(s\) not listed/)
})

test('adapter: publishes the blocking breakdown and prints it', () => {
  const src = readFileSync(new URL('../../eng/vally-adapter/adapt.mjs', import.meta.url), 'utf8')
  assert.match(src, /blocking: \{/, 'the breakdown must reach results.json')
  assert.match(src, /renderBlockingGraders\(verdict\.blocking\.skilled, 'skilled'\)/)
})

// Reporting must never become scoring: the paired verdict ranks continuous
// grader scores and must not learn about thresholds or blocking counts.
test('verdict: the gate does not consult the blocking breakdown', () => {
  const src = readFileSync(new URL('../../eng/lib/verdict.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /blockingGraders|nearMiss|cleanSweep/)
})
