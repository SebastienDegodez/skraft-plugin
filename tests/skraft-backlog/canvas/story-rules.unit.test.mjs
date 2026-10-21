// The rule behind every check of a story file: the canvas reads a refusal through STORY_RULES, so
// each check must name a rule of the table, with the values it found, and keep the message the
// story writer has always read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { inventoryOf } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { MAX_CRITERIA, MIN_CRITERIA, MIN_EXAMPLES, STORY_RULES, checkStory } from '../../../plugins/skraft-backlog/prd-backlog/story.mjs'
import { EFFORTS } from '../../../plugins/skraft-backlog/prd-backlog/story-map.mjs'
import { FIXTURE_PRD } from '../prd-backlog/simulated-ctx.mjs'
import { storyFile, storyMap } from '../prd-backlog/fixtures/backlog-data.mjs'

const known = new Set(inventoryOf(readFileSync(FIXTURE_PRD, 'utf8')).requirements.map((r) => r.id))
const planned = (id) => storyMap().epics.flatMap((e) => e.stories.map((s) => ({ ...s, epic: e.id }))).find((s) => s.id === id)
const S02 = planned('EP-001-S02')
const detailOf = (findings, rule) => findings.details.filter((d) => d.rule === rule)

/** A file broken in every way a file can be at once. */
const brokenFile = () => ({
  id: 'EP-009-S09', epic: 'EP-009', title: '', description: ' ', persona: 'un utilisateur',
  story: { asA: 'un utilisateur', iWant: 'implement the eligibility service' },
  examples: [null, { id: 'EX-1', text: 'un cas sans valeur' }],
  acceptanceCriteria: [
    null,
    { id: 'AC-01', title: 'Cas', given: 'the EligibilityService is up', when: 'GET /eligibility', then: [], example: 'EX-9', covers: ['FR-404'] },
  ],
  tasks: [null, { text: '', acceptanceCriteria: ['AC-99'] }],
  devNotes: { context: [''], references: [], testing: [] },
  technicalNotes: [' '],
  dependencies: [null, { story: 'EP-001-S01', reason: '' }],
  effort: { points: 13, rationale: '' },
})

test('every check a story file can fail names a rule of STORY_RULES, and every rule of the table is reachable', () => {
  const giant = storyFile(S02)
  giant.acceptanceCriteria = Array.from({ length: MAX_CRITERIA + 1 }, (_, i) => ({ ...giant.acceptanceCriteria[0], id: `AC-${i}` }))
  giant.dependencies = 'EP-001-S01'
  giant.effort.points = 5
  giant.title = 'Recevoir sa décision sur GitHub et sur Slack'
  const small = storyFile(S02)
  small.effort.points = 1
  const runs = [checkStory(brokenFile(), S02, known), checkStory(giant, S02, known), checkStory(small, S02, known), checkStory({ story: null }, S02, known)]
  const emitted = new Set(runs.flatMap((r) => r.details.map((d) => d.rule)))
  for (const rule of emitted) assert.ok(Object.hasOwn(STORY_RULES, rule), `${rule} is in STORY_RULES`)
  assert.deepEqual([...emitted].sort(), Object.keys(STORY_RULES).sort())
})

test('each rule names the DoR item it proves, the INVEST letters it breaks and the part of the sheet it accuses', () => {
  const targets = new Set(['statement', 'examples', 'criteria', 'tasks', 'notes', 'dependencies', 'effort'])
  for (const [rule, meaning] of Object.entries(STORY_RULES)) {
    assert.ok(meaning.dor === null || (Number.isInteger(meaning.dor) && meaning.dor >= 1 && meaning.dor <= 8), rule)
    assert.ok(meaning.invest.every((letter) => 'INVEST'.includes(letter)), rule)
    assert.ok(targets.has(meaning.target), rule)
  }
  assert.ok(Object.isFrozen(STORY_RULES))
  assert.deepEqual(STORY_RULES['technical-ac'], { dor: 4, invest: ['N'], antipattern: 'Technical AC', target: 'criteria' })
  assert.deepEqual(STORY_RULES['vague-persona'], { dor: 2, invest: ['V'], antipattern: 'Vague Persona', target: 'statement' })
  assert.deepEqual(STORY_RULES['dependencies-mismatch'], { dor: 8, invest: ['I'], antipattern: 'Missing Dependencies', target: 'dependencies' })
})

test('problems and warnings are the messages of the details, in the order they were found', () => {
  const findings = checkStory(brokenFile(), S02, known)
  assert.deepEqual(findings.problems, findings.details.filter((d) => d.kind === 'problem').map((d) => d.message))
  assert.deepEqual(findings.warnings, findings.details.filter((d) => d.kind === 'warning').map((d) => d.message))
  assert.deepEqual(findings.warnings, ['EX-1 carries no concrete value (Generic Data?)'])
  assert.ok(findings.problems.includes('id is EP-009-S09, the map plans EP-001-S02'))
  assert.ok(findings.problems.includes('epic is EP-009, the map plans EP-001'))
  assert.ok(findings.problems.includes('title must be a non-empty string'))
  assert.ok(findings.problems.includes('DoR 1: story.soThat is missing'))
  assert.ok(findings.problems.includes('DoR 3: every example needs an id and a text'))
  assert.ok(findings.problems.includes('DoR 4: AC-01.then must list at least one observable outcome'))
  assert.ok(findings.problems.includes('AC-01 covers FR-404, which the PRD does not define'))
  assert.ok(findings.problems.includes('every task needs a text'))
  assert.ok(findings.problems.includes('DoR 8: undefined is listed without a reason'))
  assert.ok(findings.problems.includes('devNotes.testing must say how the criteria are proven'))
})

test('a technical criterion carries the words that betray it', () => {
  const file = storyFile(S02)
  file.acceptanceCriteria[1].then = ['le service renvoie HTTP 403 au portail']
  file.acceptanceCriteria[2].when = 'le portail appelle POST /eligibilite'
  const [http, route] = detailOf(checkStory(file, S02, known), 'technical-ac')
  assert.deepEqual(http, { rule: 'technical-ac', kind: 'problem', message: 'AC-02 names system internals or HTTP details (Technical AC)', params: { criterion: 'AC-02', found: 'HTTP 403' } })
  assert.deepEqual(route.params, { criterion: 'AC-03', found: 'POST /' })
})

test('dependencies that drift from the map carry what the file lists and what the map plans', () => {
  const file = storyFile(S02)
  file.dependencies = [{ story: 'EP-001-S03', reason: 'la décision doit exister' }]
  const [mismatch] = detailOf(checkStory(file, S02, known), 'dependencies-mismatch')
  assert.equal(mismatch.message, 'DoR 8: dependencies are [EP-001-S03], the map plans [EP-001-S01]')
  assert.deepEqual(mismatch.params, { found: ['EP-001-S03'], planned: ['EP-001-S01'] })
  file.dependencies = { story: 'EP-001-S01' }
  assert.deepEqual(detailOf(checkStory(file, S02, known), 'dependencies-not-list').map((d) => d.message), ['DoR 8: dependencies must be a list ([] when none)'])
})

test('too few examples and too few or too many criteria carry their count and the bound', () => {
  const file = storyFile(S02)
  file.examples = file.examples.slice(0, 1)
  file.acceptanceCriteria = file.acceptanceCriteria.slice(0, 2)
  const findings = checkStory(file, S02, known)
  assert.deepEqual(detailOf(findings, 'examples-too-few')[0].params, { count: 1, min: MIN_EXAMPLES })
  assert.deepEqual(detailOf(findings, 'criteria-too-few')[0].params, { count: 2, min: MIN_CRITERIA })
  file.acceptanceCriteria = Array.from({ length: 9 }, (_, i) => ({ ...storyFile(S02).acceptanceCriteria[0], id: `AC-${i}` }))
  const [giant] = detailOf(checkStory(file, S02, known), 'criteria-too-many')
  assert.equal(giant.message, 'DoR 6: 9 acceptance criteria: split the story (Giant Story)')
  assert.deepEqual(giant.params, { count: 9, max: MAX_CRITERIA })
})

test('the persona, the goal, the example and the effort a rule refuses are quoted in its params', () => {
  const file = storyFile(S02)
  file.persona = 'Le système'
  file.story.iWant = 'refactorer le dépôt des profils'
  file.examples[1].text = 'un conducteur mineur est refusé'
  file.effort = { points: 4, rationale: 'quatre' }
  const findings = checkStory(file, S02, known)
  assert.deepEqual(detailOf(findings, 'vague-persona')[0].params, { persona: 'Le système' })
  assert.deepEqual(detailOf(findings, 'implement-x')[0].params, { iWant: 'refactorer le dépôt des profils' })
  assert.deepEqual(detailOf(findings, 'generic-data')[0], { rule: 'generic-data', kind: 'warning', message: 'EX-2 carries no concrete value (Generic Data?)', params: { example: 'EX-2' } })
  assert.deepEqual(detailOf(findings, 'effort-off-scale')[0].params, { found: 4, scale: EFFORTS })
})

test('criteria, tasks and covers that do not line up name the criterion and the requirement', () => {
  const file = storyFile(planned('EP-001-S01'))
  file.acceptanceCriteria[0].covers = ['FR-001', 'FR-404']
  file.acceptanceCriteria[1].given = ''
  file.acceptanceCriteria[2].example = 'EX-7'
  file.tasks = [{ text: 'faire', acceptanceCriteria: ['AC-01', 'AC-02', 'AC-08'] }]
  const findings = checkStory(file, planned('EP-001-S01'), known)
  assert.deepEqual(detailOf(findings, 'criterion-unknown-requirement')[0].params, { criterion: 'AC-01', requirement: 'FR-404' })
  assert.deepEqual(detailOf(findings, 'requirement-uncarried')[0].params, { requirement: 'NFR-001' })
  assert.deepEqual(detailOf(findings, 'criterion-incomplete')[0].params, { criterion: 'AC-02', part: 'given' })
  assert.deepEqual(detailOf(findings, 'criterion-no-example')[0].params, { criterion: 'AC-03', example: 'EX-7' })
  assert.deepEqual(detailOf(findings, 'task-unknown-criterion')[0].params, { criterion: 'AC-08' })
  assert.deepEqual(detailOf(findings, 'criterion-unserved')[0].params, { criterion: 'AC-03' })
})

test('a file that is not an object is refused once, as a missing field', () => {
  for (const file of [null, undefined, 'EP-001-S02', 42]) {
    assert.deepEqual(checkStory(file, S02, known), {
      problems: ['the story file is not a JSON object'], warnings: [],
      details: [{ rule: 'field-missing', kind: 'problem', message: 'the story file is not a JSON object', params: { field: 'file' } }],
    })
  }
})

test('an empty object fails the structure of every DoR item without crashing', () => {
  const findings = checkStory({}, S02, known)
  const rules = new Set(findings.details.map((d) => d.rule))
  for (const rule of ['persona-missing', 'statement-missing', 'examples-too-few', 'criteria-too-few', 'tasks-missing', 'technical-notes-empty', 'context-missing', 'dependencies-not-list', 'effort-off-scale', 'effort-no-rationale']) {
    assert.ok(rules.has(rule), rule)
  }
  assert.deepEqual(detailOf(findings, 'effort-off-scale')[0].params, { found: null, scale: EFFORTS })
  assert.deepEqual(detailOf(findings, 'statement-missing').map((d) => d.params.part), ['asA', 'iWant', 'soThat'])
})
