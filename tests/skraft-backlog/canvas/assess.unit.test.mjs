// The reviewer's reading of a backlog: each story's state, its human review, and for every INVEST
// letter and DoR item a status with the evidence behind it — from the checks, the map and the lenses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ANTIPATTERNS, DOR, INVEST, LINES, antipatternsIn, assessBacklog, placesOf, worst } from '../../../plugins/skraft-backlog/prd-backlog/canvas/assess.mjs'
import { inventoryOf } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { FIXTURE_PRD } from '../prd-backlog/simulated-ctx.mjs'
import { storyFile, storyMap } from '../prd-backlog/fixtures/backlog-data.mjs'

const inventory = inventoryOf(readFileSync(FIXTURE_PRD, 'utf8'))
const ALL = ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01']

/** A review file as review-verdict.mjs writes it, with these findings under one lens. */
const review = (verdict, findings, lens = 'planning-dor') => ({ verdict, lenses: { [lens]: { status: findings.length ? 'fail' : 'pass', findings } } })

/**
 * A raw backlog as the store reads it, every story written and valid unless told otherwise.
 * @param {{ map?: any, written?: string[], edit?: (files: Map<string, any>) => void, inventory?: any, reviews?: [string, any][],
 *   plan?: any, published?: Record<string, any>, reviewed?: Record<string, any> }} [options]
 */
const rawOf = ({ map = storyMap(), written = ALL, edit = () => {}, inventory: inv = inventory, reviews = [], plan = null, published = {}, reviewed = {} } = {}) => {
  const files = new Map(map.epics.flatMap((epic) => epic.stories.filter((s) => written.includes(s.id)).map((s) => [s.id, storyFile({ ...s, epic: epic.id })])))
  edit(files)
  return {
    slug: 'eligibilite', inventory: inv, map, files,
    fingerprints: new Map([...files.keys()].map((id) => [id, `sha-${id}`])),
    reviews: new Map(reviews.map(([epic, r], i) => [epic, { attempt: i + 1, review: r }])),
    plan, published, reviewed, repo: 'acme/permis', handoff: { exists: true, reviewed: false },
  }
}

/** A plan.json holding these stories as ready and those as held back. */
const planOf = (ready, notReady = {}) => ({ issues: ready.map((id) => ({ id, kind: 'story' })), links: [], milestones: [], labels: [], notReady })
const storyOf = (assessment, id) => assessment.stories.find((s) => s.id === id)
const linesOf = (story) => ({ ...story.invest, ...story.dor })
/** The facts a line answers with hold at least these values. */
const has = (actual, expected) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, key)
}

test('the checklist has six INVEST letters and eight DoR items', () => {
  assert.deepEqual(INVEST, ['I', 'N', 'V', 'E', 'S', 'T'])
  assert.deepEqual(DOR, ['1', '2', '3', '4', '5', '6', '7', '8'])
  assert.deepEqual(LINES, [...INVEST, ...DOR])
})

test('worst keeps the most severe status, pass when there is none', () => {
  assert.equal(worst([]), 'pass')
  assert.equal(worst(['pass', 'pending']), 'pending')
  assert.equal(worst(['pending', 'warn', 'pass']), 'warn')
  assert.equal(worst(['warn', 'fail', 'pending']), 'fail')
})

test('antipatternsIn finds every antipattern a text names, whatever its case', () => {
  assert.deepEqual(antipatternsIn('a GIANT story with generic data'), ['Giant Story', 'Generic Data'])
  assert.deepEqual(antipatternsIn('nothing to see'), [])
  assert.deepEqual(antipatternsIn(Object.keys(ANTIPATTERNS).join(' ')), Object.keys(ANTIPATTERNS))
})

test('a G1 finding lands on the INVEST letters its words name, and on those its antipatterns break', () => {
  assert.deepEqual(placesOf({ gate: 'G1', description: 'Not Testable and not independent of EP-002' }), { invest: ['I', 'T'], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G1', description: 'Pas négociable, pas estimable, trop peu de valeur' }), { invest: ['N', 'V', 'E'], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G1', location: 'Giant Story', description: 'not small' }), { invest: ['S'], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G1', description: 'The upload limit is unstated' }), { invest: [], dor: [] })
})

test('a G7 finding lands on the DoR items it numbers, else on those its words name', () => {
  assert.deepEqual(placesOf({ gate: 'G7', description: 'DoR item 7: technical notes are thin' }), { invest: [], dor: ['7'] })
  assert.deepEqual(placesOf({ gate: 'G7', location: 'DoR #2', description: 'and DoR 5 too, DoR 2 again' }), { invest: [], dor: ['2', '5'] })
  assert.deepEqual(placesOf({ gate: 'G7', description: 'the persona is vague and the technical notes name no registry' }), { invest: [], dor: ['2', '7'] })
  assert.deepEqual(placesOf({ gate: 'G7', description: 'exemples du domaine absents, dépendance oubliée, mal dimensionnée' }), { invest: [], dor: ['3', '8'] })
  assert.deepEqual(placesOf({ gate: 'G7', description: 'problem statement, UAT scenarios, derived, right-sized' }), { invest: [], dor: ['1', '4', '5', '6'] })
})

test('a G8 finding lands where the antipatterns it names land; the other gates have fixed places', () => {
  assert.deepEqual(placesOf({ gate: 'G8', description: 'Implement-X and Missing Dependencies' }), { invest: ['N', 'V', 'I'], dor: ['1', '8'] })
  assert.deepEqual(placesOf({ gate: 'G8', description: 'Tests After Code' }), { invest: ['T'], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G8', description: 'no antipattern named' }), { invest: [], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G2', description: 'Giant Story' }), { invest: ['I'], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G3' }), { invest: ['T'], dor: ['4'] })
  assert.deepEqual(placesOf({ gate: 'G4' }), { invest: ['T'], dor: ['4'] })
  assert.deepEqual(placesOf({ gate: 'G5' }), { invest: ['S'], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G6' }), { invest: ['I'], dor: [] })
  assert.deepEqual(placesOf({ gate: 'G9', description: 'Not Testable, DoR 4' }), { invest: [], dor: [] })
})

test('a story stands unwritten, written, refused, held, ready or published', () => {
  const unwritten = assessBacklog(rawOf({ written: [] }))
  assert.deepEqual(unwritten.stories.map((s) => s.state), ['unwritten', 'unwritten', 'unwritten', 'unwritten'])
  const written = assessBacklog(rawOf({ edit: (files) => { files.get('EP-001-S02').persona = 'utilisateur' } }))
  assert.deepEqual(written.stories.map((s) => [s.id, s.state]), [['EP-001-S01', 'written'], ['EP-001-S02', 'refused'], ['EP-001-S03', 'written'], ['EP-002-S01', 'written']])
  const planned = assessBacklog(rawOf({
    edit: (files) => { files.get('EP-001-S02').persona = 'utilisateur' },
    plan: planOf(['EP-001-S01'], { 'EP-001-S02': ['refused'], 'EP-002-S01': ['DoR 7'] }),
    published: { 'EP-001-S03': { number: 103, url: 'https://github.com/acme/permis/issues/103' } },
  }))
  assert.deepEqual(planned.stories.map((s) => [s.id, s.state]), [['EP-001-S01', 'ready'], ['EP-001-S02', 'refused'], ['EP-001-S03', 'published'], ['EP-002-S01', 'held']])
  assert.deepEqual(storyOf(planned, 'EP-001-S03').published, { number: 103, url: 'https://github.com/acme/permis/issues/103' })
  assert.deepEqual(storyOf(planned, 'EP-002-S01').reasons, ['DoR 7'])
  assert.deepEqual(storyOf(planned, 'EP-001-S02').reasons, ['DoR 2: persona "utilisateur" names no role (Vague Persona)'])
  assert.deepEqual(storyOf(planned, 'EP-001-S01').reasons, [])
  assert.deepEqual(planned.counts, { stories: 4, written: 4, refused: 1, held: 1, ready: 1, reviewed: 0, published: 1 })
})

test('before its file is written a story is pending on every line but I and S, which the map judges', () => {
  const story = storyOf(assessBacklog(rawOf({ written: [] })), 'EP-001-S02')
  const statuses = Object.fromEntries(Object.entries(linesOf(story)).map(([line, value]) => [line, value.status]))
  assert.deepEqual(statuses, { I: 'pass', N: 'pending', V: 'pending', E: 'pending', S: 'pass', T: 'pending', 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending', 6: 'pending', 7: 'pending', 8: 'pending' })
  assert.equal(story.verdict, 'pending')
  assert.equal(story.file, null)
  assert.equal(story.fingerprint, null)
  assert.equal(story.title, 'Être refusé avant 18 ans')
  has(story.invest.I.facts, { after: ['EP-001-S01'], held: [] })
  has(story.invest.E.facts, { points: 2, tasks: null })
  has(story.invest.T.facts, { criteria: null, linked: null })
  has(story.dor['2'].facts, { persona: 'conducteur de moins de 18 ans' })
  has(story.dor['8'].facts, { dependencies: ['EP-001-S01'] })
})

test('a written story answers each line with the values of its file', () => {
  const story = storyOf(assessBacklog(rawOf()), 'EP-001-S02')
  assert.equal(story.verdict, 'pass')
  assert.ok(Object.values(linesOf(story)).every((line) => line.status === 'pass' && line.evidence.length === 0))
  has(story.invest.N.facts, { iWant: 'être refusé avant 18 ans' })
  has(story.invest.V.facts, { soThat: 'je sache où en est ma demande' })
  has(story.invest.E.facts, { points: 2, tasks: 1 })
  has(story.invest.S.facts, { points: 2, criteria: 3 })
  has(story.invest.T.facts, { criteria: 3, linked: 3 })
  has(story.dor['3'].facts, { examples: 3 })
  has(story.dor['5'].facts, { linked: 3, criteria: 3 })
  has(story.dor['7'].facts, { notes: 1 })
  has(story.dor['8'].facts, { dependencies: ['EP-001-S01'] })
  assert.equal(story.description, 'Le conducteur mineur voit le motif du refus. Elle fait avancer EP-001.')
  assert.deepEqual([story.milestone, story.moscow, story.effort, story.tracer], ['M1', 'must', 2, false])
})

test('a refusal of the checks fails the INVEST letters and the DoR item of its rule, with the rule and its values', () => {
  const assessment = assessBacklog(rawOf({ edit: (files) => {
    const file = files.get('EP-001-S02')
    file.acceptanceCriteria[1].then = ['le service renvoie HTTP 403 au portail']
    file.examples[1].text = 'un mineur est refusé'
  } }))
  const story = storyOf(assessment, 'EP-001-S02')
  const [technical] = story.invest.N.evidence
  assert.deepEqual(technical, { source: 'check', status: 'fail', rule: 'technical-ac', params: { criterion: 'AC-02', found: 'HTTP 403' }, message: 'AC-02 names system internals or HTTP details (Technical AC)', target: 'criteria' })
  assert.deepEqual(story.dor['4'].evidence, [technical])
  assert.equal(story.invest.N.status, 'fail')
  assert.deepEqual(story.invest.T.evidence.map((e) => [e.rule, e.status]), [['generic-data', 'warn']])
  assert.equal(story.dor['3'].status, 'warn')
  assert.deepEqual(story.antipatterns, ['Generic Data', 'Technical AC'])
  assert.equal(story.verdict, 'fail')
  assert.equal(story.state, 'refused')
})

test('a rule that proves no DoR item lands on its INVEST letters only', () => {
  const story = storyOf(assessBacklog(rawOf({ edit: (files) => { files.get('EP-001-S02').tasks = [] } })), 'EP-001-S02')
  assert.deepEqual(story.invest.E.evidence.map((e) => e.rule), ['tasks-missing', 'criterion-unserved', 'criterion-unserved', 'criterion-unserved'])
  assert.ok(DOR.every((item) => story.dor[item].evidence.every((e) => e.rule !== 'tasks-missing')))
})

test('a lens finding lands on its places: a low one warns, a higher one fails, a finding with no place stays aside', () => {
  const assessment = assessBacklog(rawOf({ reviews: [['EP-002', review('REJECTED', [
    { gate: 'G7', severity: 'blocker', story: 'EP-002-S01', description: 'DoR item 7: technical notes do not name the registry', suggestion: 'Name it.' },
    { gate: 'G1', severity: 'MEDIUM', story: 'EP-002-S01', description: 'Not Testable: no observable outcome' },
    { gate: 'G8', story: 'EP-002-S01', location: 'EX-2', description: 'Generic Data: an age, no date' },
    { gate: 'G1', severity: 'low', story: 'EP-002-S01', description: 'The upload limit is unstated' },
    { gate: 'G12', severity: 'high', story: 'EP-002-S01', description: 'an unknown gate' },
  ])]] }))
  const story = storyOf(assessment, 'EP-002-S01')
  assert.deepEqual(story.dor['7'].evidence, [{ source: 'lens', status: 'fail', message: 'DoR item 7: technical notes do not name the registry', gate: 'G7', severity: 'blocker', lens: 'planning-dor', suggestion: 'Name it.', target: 'notes' }])
  assert.deepEqual(story.invest.T.evidence.map((e) => [e.gate, e.severity, e.status, e.target]), [['G1', 'medium', 'fail', 'criteria'], ['G8', 'low', 'warn', 'examples']])
  assert.equal(story.dor['3'].status, 'warn')
  assert.deepEqual(story.unplaced.map((f) => f.gate), ['G1', 'G12'])
  assert.equal(story.findings.length, 5)
  assert.deepEqual(story.antipatterns, ['Generic Data'])
  assert.equal(story.verdict, 'fail')
  assert.deepEqual(assessment.epics.find((e) => e.id === 'EP-002'), {
    id: 'EP-002', title: 'Justificatifs', outcome: 'Le conducteur éligible dépose un permis vérifié.', covers: ['FR-004'],
    doneWhen: ['Un permis valide est accepté en production.'], verdict: 'REJECTED', attempt: 1, findings: [], stories: ['EP-002-S01'],
  })
})

test('a lens finding points at the part of the sheet it accuses', () => {
  const at = (finding) => storyOf(assessBacklog(rawOf({ reviews: [['EP-001', review('NEEDS_REWORK', [{ severity: 'high', story: 'EP-001-S01', ...finding }])]] })), 'EP-001-S01')
  const targetOf = (story) => [...Object.values(story.invest), ...Object.values(story.dor)].flatMap((line) => line.evidence)[0].target
  assert.equal(targetOf(at({ gate: 'G7', description: 'DoR 5' })), 'criteria')
  assert.equal(targetOf(at({ gate: 'G2', description: 'waits on a held story' })), 'dependencies')
  assert.equal(targetOf(at({ gate: 'G7', description: 'DoR 8' })), 'dependencies')
  assert.equal(targetOf(at({ gate: 'G7', description: 'DoR 7' })), 'notes')
  assert.equal(targetOf(at({ gate: 'G5', description: 'too big' })), 'effort')
  assert.equal(targetOf(at({ gate: 'G7', description: 'DoR 6' })), 'effort')
  assert.equal(targetOf(at({ gate: 'G1', description: 'not estimable' })), 'effort')
  assert.equal(targetOf(at({ gate: 'G7', description: 'DoR 2' })), 'statement')
  assert.equal(targetOf(at({ gate: 'G1', description: 'not negotiable' })), 'statement')
})

test('a story waiting on a held-back story warns on I, with the story it waits on', () => {
  const story = storyOf(assessBacklog(rawOf({ plan: planOf(['EP-002-S01'], { 'EP-001-S01': ['DoR 7'] }) })), 'EP-002-S01')
  assert.equal(story.invest.I.status, 'warn')
  has(story.invest.I.facts, { after: ['EP-001-S01'], held: ['EP-001-S01'] })
  assert.deepEqual(story.invest.I.evidence, [{ source: 'map', status: 'warn', rule: 'held-blocker', params: { story: 'EP-001-S01' }, message: 'waits on EP-001-S01, which is held back', target: 'dependencies' }])
  assert.equal(story.verdict, 'warn')
})

test('an effort of 8 warns on S, open questions warn on E', () => {
  const map = storyMap()
  map.epics[0].stories[0].effort = 8
  const assessment = assessBacklog(rawOf({ map, written: ['EP-001-S02'], edit: (files) => { files.get('EP-001-S02').openQuestions = ['Quel âge exact ?', ' ', 42, 'Quel motif ?'] } }))
  const unwritten = storyOf(assessment, 'EP-001-S01')
  assert.deepEqual(unwritten.invest.S.evidence, [{ source: 'map', status: 'warn', rule: 'effort-at-limit', params: { points: 8 }, message: 'effort 8 is the top of the scale', target: 'effort' }])
  assert.equal(unwritten.invest.S.status, 'warn')
  assert.equal(unwritten.verdict, 'warn')
  const asked = storyOf(assessment, 'EP-001-S02')
  assert.deepEqual(asked.invest.E.evidence, [{ source: 'map', status: 'warn', rule: 'open-questions', params: { count: 2 }, message: '2 open question(s)', target: 'questions' }])
  assert.equal(storyOf(assessment, 'EP-001-S03').invest.E.status, 'pending')
})

test('the human review holds while the file is the one reviewed, and goes stale when it changes', () => {
  const assessment = assessBacklog(rawOf({
    plan: planOf(['EP-001-S01', 'EP-001-S03']),
    reviewed: { 'EP-001-S01': { at: '2026-10-20T10:00:00Z', fingerprint: 'sha-EP-001-S01' }, 'EP-001-S03': { at: '2026-10-20T10:05:00Z', fingerprint: 'an older file' } },
  }))
  assert.deepEqual(assessment.stories.map((s) => [s.id, s.review, s.reviewedAt]), [
    ['EP-001-S01', 'reviewed', '2026-10-20T10:00:00Z'], ['EP-001-S02', 'none', null], ['EP-001-S03', 'stale', '2026-10-20T10:05:00Z'], ['EP-002-S01', 'none', null],
  ])
  assert.equal(assessment.counts.reviewed, 1)
  assert.equal(storyOf(assessment, 'EP-001-S01').fingerprint, 'sha-EP-001-S01')
})

test('coverage counts the functional requirements the map covers and those it defers, beside the problems of the map', () => {
  const map = storyMap()
  map.epics[1].stories[0].covers = []
  map.deferred = [{ id: 'FR-004', reason: 'later' }]
  const assessment = assessBacklog(rawOf({ map }))
  assert.deepEqual(assessment.coverage, { fr: 4, covered: 3, deferred: 1 })
  assert.deepEqual(assessment.mapCheck.problems, ['EP-002.stories[0].covers must name at least one requirement'], 'the map check travels with the assessment')
  const full = assessBacklog(rawOf())
  assert.deepEqual(full.coverage, { fr: 4, covered: 4, deferred: 0 })
})

test('a finding on no story of the map is a finding on the epic', () => {
  const assessment = assessBacklog(rawOf({ reviews: [['EP-001', {
    verdict: 'NEEDS_REWORK',
    lenses: {
      'planning-coherence': { findings: [{ gate: 'G2', severity: 'high', description: 'the epic outcome is untestable' }, { gate: 'G6', story: 'EP-404-S01', description: 'ghost' }, { gate: 'G6', story: null, description: 'no story' }] },
      'planning-invest': { status: 'pass' },
      'planning-dor': null,
    },
  }]] }))
  const epic = assessment.epics.find((e) => e.id === 'EP-001')
  assert.deepEqual(epic.findings.map((f) => [f.description, f.lens, f.epic, f.severity, f.story]), [
    ['the epic outcome is untestable', 'planning-coherence', 'EP-001', 'high', undefined],
    ['ghost', 'planning-coherence', 'EP-001', 'low', 'EP-404-S01'],
    ['no story', 'planning-coherence', 'EP-001', 'low', null],
  ])
  assert.deepEqual([epic.verdict, epic.attempt], ['NEEDS_REWORK', 1])
  assert.ok(assessment.stories.every((s) => s.findings.length === 0))
  assert.deepEqual(assessment.epics.find((e) => e.id === 'EP-002').findings, [])
  assert.equal(assessment.epics.find((e) => e.id === 'EP-002').verdict, null)
})

test('the language is the PRD’s, English when the inventory is missing; without inventory the map covers are the known ids', () => {
  const fr = assessBacklog(rawOf())
  assert.equal(fr.language, 'fr')
  const none = assessBacklog(rawOf({ inventory: null }))
  assert.equal(none.language, 'en')
  assert.deepEqual(none.mapCheck, { problems: [], warnings: [] })
  assert.deepEqual(none.coverage, { fr: 0, covered: 0, deferred: 0 })
  assert.ok(none.stories.every((s) => s.dor['4'].status === 'pass'))
  assert.equal(assessBacklog(rawOf({ inventory: { ...inventory, language: 'en' } })).language, 'en')
})

test('the assessment carries the backlog’s identity, its milestones and whether a plan exists', () => {
  const map = storyMap()
  delete map.milestones[1].dueOn
  const assessment = assessBacklog(rawOf({ map, plan: planOf([]) }))
  assert.equal(assessment.slug, 'eligibilite')
  assert.equal(assessment.repo, 'acme/permis')
  assert.deepEqual(assessment.handoff, { exists: true, reviewed: false })
  assert.equal(assessment.hasPlan, true)
  assert.deepEqual(assessment.milestones, [{ id: 'M1', title: 'v0.1-eligibilite', dueOn: '2026-11-13' }, { id: 'M2', title: 'v0.2-justificatifs', dueOn: null }])
  assert.deepEqual(assessment.stories.map((s) => s.id), ALL, 'stories come in build order')
  assert.equal(assessBacklog(rawOf()).hasPlan, false)
})
