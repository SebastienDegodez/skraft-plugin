import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CAPACITY_DAYS, DOR_ITEMS, checkProposal, main } from '../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/check-proposal.mjs'
import { proposal } from './proposal-fixture.mjs'

const problemsOf = (mutate) => {
  const input = proposal()
  mutate(input)
  return checkProposal(input).problems
}
const assertProblem = (mutate, pattern) => {
  const problems = problemsOf(mutate)
  assert.ok(problems.some((problem) => pattern.test(problem)), `expected ${pattern} in ${JSON.stringify(problems)}`)
}

test('a complete proposal passes and gets the derived figures the agent must not compute', () => {
  const { problems, proposal: checked } = checkProposal(proposal())
  assert.deepEqual(problems, [])
  assert.deepEqual(checked.derived, { readiness: 'NEEDS_REFINEMENT', dorPassed: 4, capacityDays: 1.5, mustSplit: false })
  assert.deepEqual(checked.dor.map((item) => item.id), DOR_ITEMS)
})

test('READY needs all 8 DoR items, a size of 8 or less, no CRITICAL antipattern, and a review that did not reject', () => {
  const ready = proposal()
  ready.dor = ready.dor.map((item) => ({ item: item.item, pass: true }))
  assert.equal(checkProposal(ready).proposal.derived.readiness, 'READY')

  assert.equal(checkProposal({ ...ready, review: { verdict: 'REJECTED', attempts: 2 } }).proposal.derived.readiness, 'NEEDS_REFINEMENT')

  ready.antipatterns = [{ name: 'Implement-X', severity: 'CRITICAL' }]
  assert.equal(checkProposal(ready).proposal.derived.readiness, 'NEEDS_REFINEMENT')
})

test('capacity days follow the triage scale and stop at 8', () => {
  assert.deepEqual(CAPACITY_DAYS, { 1: 0.25, 2: 0.5, 3: 0.75, 5: 1.5, 8: 3 })
  const big = proposal()
  big.size = { points: 13, justification: 'Deux parcours.', split: [{ title: 'Éligibilité', points: 5 }, { title: 'Surprime', points: 5 }] }
  big.dor = big.dor.map((item) => (item.item === 6 ? { item: 6, pass: false, note: 'Trop gros.' } : item))
  const { derived } = checkProposal(big).proposal
  assert.equal(derived.capacityDays, null)
  assert.equal(derived.mustSplit, true)
})

test('a size above 8 needs a split of stories of 8 or less, and cannot pass DoR item 6', () => {
  assertProblem((p) => { p.size.points = 13 }, /needs a split/)
  assertProblem((p) => { p.size.points = 13 }, /item 6 .* cannot pass/)
  assertProblem((p) => { p.size.points = 13; p.size.split = [{ title: 'a', points: 13 }, { title: 'b', points: 3 }] }, /split\[0\]\.points/)
  assertProblem((p) => { p.size.points = 4 }, /Fibonacci|one of 1, 2, 3, 5, 8, 13, 21/)
  assertProblem((p) => { p.size.justification = ' ' }, /justification is empty/)
})

test('the DoR lists the 8 items once, and a failing item says what is missing', () => {
  assertProblem((p) => { p.dor.pop() }, /8 Definition of Ready items/)
  assertProblem((p) => { p.dor[7].item = 1 }, /lists an item twice/)
  assertProblem((p) => { p.dor[1].note = '' }, /dor\[1\] fails without a note/)
  assertProblem((p) => { p.dor[0].item = 9 }, /dor\[0\]\.item must be 1 to 8/)
  assertProblem((p) => { p.dor[0].pass = 'yes' }, /dor\[0\]\.pass/)
})

test('the story names a role, not a generic user, in any language', () => {
  for (const persona of ['user', 'a user', 'utilisateur', 'L\'utilisateur', 'le client', 'someone', 'Developer']) {
    assertProblem((p) => { p.story.persona = persona }, /is generic/)
  }
  assert.deepEqual(problemsOf((p) => { p.story.persona = 'souscripteur auto' }), [])
  assertProblem((p) => { p.story.statement = '' }, /statement is empty/)
  assertProblem((p) => { p.story.personaInferred = 'maybe' }, /personaInferred/)
})

test('three examples and three Given/When/Then criteria, each tied to an existing example', () => {
  assertProblem((p) => { p.examples.pop() }, /at least 3 domain examples/)
  assertProblem((p) => { p.examples[0] = ' ' }, /examples\[0\] is empty/)
  assertProblem((p) => { p.acceptanceCriteria.pop() }, /at least 3 criteria/)
  assertProblem((p) => { p.acceptanceCriteria[1].then = '' }, /acceptanceCriteria\[1\]\.then is empty/)
  assertProblem((p) => { p.acceptanceCriteria[2].example = 4 }, /must point at one of the 3 examples/)
})

test('defects, INVEST, antipatterns, triage and related issues use their closed vocabularies', () => {
  assertProblem((p) => { p.acDefects[0].kind = 'meh' }, /acDefects\[0\]\.kind/)
  assertProblem((p) => { p.acDefects[0].detail = '' }, /acDefects\[0\]\.detail/)
  assertProblem((p) => { p.acDefects[0].ac = '' }, /acDefects\[0\]\.ac/)
  assertProblem((p) => { p.acDefects = 'none' }, /acDefects must be a list/)
  assertProblem((p) => { p.invest.pop() }, /invest must judge each/)
  assertProblem((p) => { p.invest[0] = { criterion: 'Independent', pass: false } }, /invest\[0\] fails without a note/)
  assertProblem((p) => { p.antipatterns[0].severity = 'LOW' }, /CRITICAL or HIGH/)
  assertProblem((p) => { p.antipatterns[0].name = '' }, /antipatterns\[0\]\.name/)
  assertProblem((p) => { p.triage.type = 'epic' }, /triage\.type/)
  assertProblem((p) => { p.triage.priority = 'P4' }, /triage\.priority/)
  assertProblem((p) => { p.triage = { type: 'bug', priority: 'P0' } }, /a P0 needs/)
  assertProblem((p) => { p.related[0].similarity = 'SAME' }, /related\[0\]\.similarity/)
  assertProblem((p) => { p.related[0].number = '51' }, /related\[0\]\.number/)
})

test('documents come from resolve-docs, and a gap is only argued from a used document', () => {
  assertProblem((p) => { delete p.docs }, /docs must carry/)
  assertProblem((p) => { p.docs.used = [] }, /never reviewed against/)
  assertProblem((p) => { p.docs.gaps = [''] }, /docs\.gaps\[0\] is empty/)
  assertProblem((p) => { p.docs = { candidates: [], gaps: ['a gap'] } }, /docs must carry/)
})

test('the issue, the language and the review verdict are checked too', () => {
  assertProblem((p) => { p.issue.repo = 'acme' }, /owner\/repo/)
  assertProblem((p) => { p.issue.number = 0 }, /positive integer/)
  assertProblem((p) => { p.issue.title = '' }, /issue\.title/)
  assertProblem((p) => { p.language = 'french' }, /two-letter/)
  assertProblem((p) => { p.review.verdict = 'OK' }, /review\.verdict/)
  assertProblem((p) => { p.review.attempts = 0 }, /review\.attempts/)
  assert.deepEqual(checkProposal([]).problems, ['the proposal must be a JSON object'])
})

test('main prints the problems with exit 2, writes the checked proposal with exit 0', () => {
  const logs = []
  const written = {}
  const io = { read: (path) => (path === 'bad.json' ? '{}' : path === 'broken.json' ? '{' : JSON.stringify(proposal())), write: (path, content) => { written[path] = content }, log: (line) => logs.push(line) }
  assert.equal(main(['--proposal', 'bad.json'], io), 2)
  assert.equal(JSON.parse(logs.pop()).error, 'invalid_proposal')
  assert.equal(main(['--proposal', 'broken.json'], io), 1)
  assert.equal(main([], io), 1)
  assert.equal(main(['--proposal', 'good.json', '--out', 'checked.json'], io), 0)
  assert.equal(JSON.parse(written['checked.json']).derived.readiness, 'NEEDS_REFINEMENT')
  assert.equal(main(['--proposal', 'good.json'], io), 0)
  assert.equal(JSON.parse(logs.pop()).derived.dorPassed, 4)
})
