// Assisted corrections, on the stories the skwad run blocked on Small: what the catalogue offers,
// sized against one day of AI-assisted work and never below half a day per story; the decisions a
// human takes; what an accepted correction does to the story map.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  CATALOGUE, SLICE_FLOOR_HOURS, applyDependency, applyMerge, applySplit, decide, emptyCorrections, nextIds, proposeCorrections, splitProblems, withDecisions,
} from '../../../plugins/skraft-backlog/prd-backlog/corrections.mjs'
import { renderStoryIssue } from '../../../plugins/skraft-backlog/prd-backlog/render.mjs'
import { CORRECTION_RULES, checkStory, normalizeStory } from '../../../plugins/skraft-backlog/prd-backlog/story.mjs'
import { EFFORT_SCALE, checkStoryMap } from '../../../plugins/skraft-backlog/prd-backlog/story-map.mjs'
import { storyFile, storyMap } from './fixtures/backlog-data.mjs'

const json = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/skwad/ep-001/${name}`, import.meta.url)), 'utf8'))
const inventory = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/skwad/inventory.json', import.meta.url)), 'utf8'))
const known = new Set(inventory.requirements.map((r) => r.id))
const map = json('story-map.json')
const files = new Map(['EP-001-S1', 'EP-001-S2', 'EP-001-S3'].map((id) => [id, json(`${id}.json`)]))
const reviews = new Map([['EP-001', { review: json('discuss-review.json') }]])
const planned = (id) => ({ ...map.epics[0].stories.find((s) => s.id === id), epic: 'EP-001' })
const proposals = proposeCorrections({ map, files, language: 'fr', known, reviews })
const story = (id) => /** @type {any} */ (proposals.find((s) => s.id === id))
const size = (id) => story(id).findings.find((f) => f.id === 'size')

test('Small is judged in AI-assisted time and in scope: 5 and 8 points warn, more than 5 criteria holds the story for a correction', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(EFFORT_SCALE).map(([p, v]) => [p, [v.hours, v.split]])), { 1: [2, false], 2: [4, false], 3: [8, false], 5: [16, true], 8: [32, true] })
  const s2 = checkStory(files.get('EP-001-S2'), planned('EP-001-S2'), known)
  const s3 = checkStory(files.get('EP-001-S3'), planned('EP-001-S3'), known)
  assert.deepEqual(s2.details.filter((d) => d.kind === 'problem').map((d) => d.rule), ['criteria-too-many'])
  assert.deepEqual(s3.details.filter((d) => d.kind === 'problem').map((d) => d.rule), ['criteria-too-many'])
  assert.deepEqual(s3.details.find((d) => d.rule === 'effort-split'), {
    rule: 'effort-split', kind: 'warning', message: 'effort 8 is more than one day assisted by AI: a split is recommended', params: { points: 8, max: 3 },
  })
  assert.deepEqual([...CORRECTION_RULES], ['criteria-too-many'])
  const eight = { ...files.get('EP-001-S3'), acceptanceCriteria: files.get('EP-001-S3').acceptanceCriteria.slice(0, 5) }
  eight.tasks = [{ text: 'Livrer', acceptanceCriteria: eight.acceptanceCriteria.map((c) => c.id) }]
  assert.deepEqual(checkStory(eight, planned('EP-001-S3'), known).problems.filter((p) => !/covers/.test(p)), [], '8 points alone never refuses')
  assert.equal(size('EP-001-S3').options[0].kind, 'split-workflow', 'a split is still offered')
  const s1 = checkStory(files.get('EP-001-S1'), planned('EP-001-S1'), known)
  assert.deepEqual(s1.problems, [], '3 points and 4 criteria pass the hard checks')
  assert.deepEqual(s1.details.find((d) => d.rule === 'integrations-many')?.params, { count: 3, integrations: ['GitHub', 'Slack', 'web form'] })
})

test('S1 (three intake channels): one size finding, split by interface into 3 stories of half a day, then fewer stories by step', () => {
  const finding = size('EP-001-S1')
  assert.equal(finding.sources.length, 2, 'the check and the invest lens: one decision')
  const [byInterface, byStep] = finding.options
  assert.equal(byInterface.kind, 'split-interface')
  assert.deepEqual(byInterface.impact.parts.map((p) => [p.title.split(' — ').at(-1), p.points]), [['GitHub', 2], ['Slack', 2], ['web form', 2]])
  assert.deepEqual([byInterface.impact.creates, byInterface.impact.floor, byInterface.impact.ceiling], [2, true, true])
  assert.match(byInterface.source, /Pattern 4: By Interface/)
  assert.ok(byInterface.plus.length && byInterface.minus.length && /canal/.test(byInterface.title), 'consequences in the PRD language')
  assert.equal(byStep.kind, 'split-workflow')
  assert.deepEqual(byStep.impact.parts.map((p) => p.title.split(' — ').at(-1)), ['FR-001 + FR-002', 'FR-003 + FR-005'], 'not one story per authorization rule')
  assert.match(byStep.impact.note, /4 → 2 stories/)
  assert.ok(finding.options.length >= 2 && finding.options.length <= 4)
  assert.equal(finding.options.at(-1).kind, 'custom')
  assert.equal(finding.options.at(-1).source, 'hors skill')
})

test('S3 (8 points, five requirements): split by step into 5 stories of one day; a split leaving stories above one day is not offered', () => {
  const finding = size('EP-001-S3')
  assert.deepEqual(finding.options.map((o) => o.kind), ['split-workflow', 'custom'])
  assert.deepEqual(finding.options[0].impact.parts.map((p) => p.points), [3, 3, 3, 3, 3])
  assert.ok(finding.options.every((o) => o.impact.parts.every((p) => p.points * 0 + EFFORT_SCALE[p.points].hours >= SLICE_FLOOR_HOURS)))
  assert.equal(size('EP-001-S2').sources.length, 7, 'the two checks and five lens findings of S2 are one decision')
})

test('a 2-point story with too many criteria cannot be split without stories too small: regroup the criteria instead', () => {
  const small = storyMap()
  const file = storyFile({ ...small.epics[0].stories[2], epic: 'EP-001' })
  file.acceptanceCriteria = Array.from({ length: 6 }, (_, i) => ({ ...file.acceptanceCriteria[0], id: `AC-0${i + 1}` }))
  const [proposal] = proposeCorrections({ map: small, files: new Map([['EP-001-S03', file]]), language: 'en', known: new Set(['FR-001', 'FR-002', 'FR-003', 'FR-004', 'NFR-001']), reviews: new Map() })
  assert.deepEqual(proposal.findings[0].options.map((o) => o.kind), ['regroup-criteria', 'rewrite', 'custom'])
})

test('a story too small is offered a merge with the neighbour that keeps the merged story within one day', () => {
  const small = storyMap()
  const file = storyFile({ ...small.epics[0].stories[1], epic: 'EP-001' })
  file.effort.points = 1
  const [proposal] = proposeCorrections({ map: small, files: new Map([['EP-001-S02', file]]), language: 'fr', known: new Set(['FR-001', 'FR-002', 'FR-003', 'FR-004', 'NFR-001']), reviews: new Map() })
  const finding = proposal.findings.find((f) => f.id === 'check:too-small')
  const merge = finding.options.find((o) => o.kind === 'merge')
  assert.deepEqual([merge.target, merge.impact.removes, merge.impact.points, merge.impact.ceiling], ['EP-001-S03', ['EP-001-S02'], 3, true])
  assert.match(merge.source, /Cohn/)
  assert.ok(merge.plus.length && merge.minus.some((m) => /dépasser une journée/.test(m)))
  assert.deepEqual(finding.options.map((o) => o.kind), ['merge', 'reframe-value', 'custom'], 'the merge into EP-001-S01 (5 points) is not offered')
})

test('open questions written as texts or objects become { id, question }; the open ones are a finding to answer', () => {
  const s3 = normalizeStory(files.get('EP-001-S3'), planned('EP-001-S3')).file
  assert.deepEqual(s3.openQuestions.map((q) => [q.id, typeof q.question]), files.get('EP-001-S3').openQuestions.map((_, i) => [`Q${i + 1}`, 'string']))
  const s1 = normalizeStory(files.get('EP-001-S1'), planned('EP-001-S1'), { Q1: { text: 'Oui, en MVP.', at: '2026-10-21T12:00:00Z' } }).file
  assert.equal(s1.openQuestions[0].question, files.get('EP-001-S1').openQuestions[0].question)
  assert.deepEqual([s1.openQuestions[0].answer, s1.openQuestions[0].answeredAt], ['Oui, en MVP.', '2026-10-21T12:00:00Z'])
  assert.deepEqual(story('EP-001-S3').findings.find((f) => f.id === 'question:open').options.map((o) => o.kind)[0], 'answer-questions')
  const body = renderStoryIssue({ ...storyFile(planned('EP-001-S1')), openQuestions: [{ id: 'Q1', question: 'Le canal Teams est-il prévu ?', why: 'le PRD ne le cite pas', answer: 'Non.' }, 'Faut-il journaliser ?'] },
    { language: 'fr', prdUrl: 'https://x' })
  assert.match(body, /## Questions ouvertes\n\n- \[x\] \*\*Q1\*\* — Le canal Teams est-il prévu \?\n {2}Pourquoi : le PRD ne le cite pas\n {2}Réponse : Non\.\n- \[ \] \*\*Q2\*\* — Faut-il journaliser \?/)
  assert.doesNotMatch(body, /\[object Object\]/)
})

test('decisions: one accepted option per finding, one structural correction per story, a custom one needs a comment', () => {
  const finding = size('EP-001-S1')
  const [byInterface, byStep, happy, custom] = finding.options
  const at = '2026-10-21T12:00:00Z'
  let corrections = decide(emptyCorrections(), { story: 'EP-001-S1', finding, option: byInterface }, { status: 'accepted', at })
  corrections = decide(corrections, { story: 'EP-001-S1', finding, option: byStep }, { status: 'accepted', at, comment: 'deux stories suffisent' })
  assert.deepEqual(Object.keys(corrections.decisions), [byStep.id], 'accepting another option of the finding withdraws the first')
  const question = story('EP-001-S1').findings.find((f) => f.id === 'question:open')
  const spike = question.options.find((o) => o.kind === 'spike')
  assert.throws(() => decide(corrections, { story: 'EP-001-S1', finding: question, option: spike }, { status: 'accepted', at }), /already has an accepted structural correction/)
  assert.throws(() => decide(corrections, { story: 'EP-001-S1', finding, option: custom }, { status: 'accepted', at }), /needs a comment/)
  corrections = decide(corrections, { story: 'EP-001-S1', finding, option: happy }, { status: 'refused', at })
  const listed = withDecisions(proposals, corrections).find((s) => s.id === 'EP-001-S1').findings[0].options
  assert.deepEqual(listed.map((o) => o.status), ['proposed', 'accepted', 'refused', 'proposed'])
  assert.equal(listed[1].comment, 'deux stories suffisent')
  assert.deepEqual(Object.keys(decide(corrections, { story: 'EP-001-S1', finding, option: byStep }, { status: 'proposed', at }).decisions), [happy.id])
})

test('an accepted split replaces the story by its parts: new ids in the epic style, one lane, dependents wait on every part', () => {
  const s1 = planned('EP-001-S1')
  const parts = ['GitHub', 'Slack', 'formulaire web'].map((channel, i) => ({ title: `Soumettre une intention depuis ${channel}`, persona: "porteur d'intention",
    description: `L'intention ${channel} est enregistrée.`, covers: [['FR-001', 'FR-005'], ['FR-002'], ['FR-003']][i], effort: 2 }))
  assert.deepEqual(splitProblems(s1, { stories: parts }, 3), [])
  assert.deepEqual(splitProblems(s1, { stories: parts.slice(0, 2) }, 3), ['the accepted split makes 3 stories, the file holds 2', 'no part covers FR-003, which EP-001-S1 covers'])
  assert.deepEqual(splitProblems(s1, { stories: [{ ...parts[0], effort: 5, covers: ['FR-999'] }, parts[1], parts[2]] }, 3),
    ['stories[0] covers FR-999, which EP-001-S1 does not cover', 'stories[0].effort must be 1, 2 or 3 (one day at most)', 'no part covers FR-001, which EP-001-S1 covers', 'no part covers FR-005, which EP-001-S1 covers'])
  const { map: split, ids } = applySplit(map, 'EP-001-S1', parts)
  assert.deepEqual(ids, ['EP-001-S1', ...nextIds(map, 'EP-001', 'EP-001-S1', 2)])
  assert.equal(ids[1], `EP-001-S${map.epics[0].stories.length + 1}`)
  const epic = split.epics[0]
  assert.deepEqual(epic.stories.slice(0, 3).map((s) => [s.id, s.after, s.effort]), [[ids[0], [], 2], [ids[1], [ids[0]], 2], [ids[2], [ids[0]], 2]])
  const waiting = epic.stories.find((s) => s.id === 'EP-001-S2')
  assert.deepEqual(waiting.after, ['EP-001-S1', ids[1], ids[2]])
  assert.deepEqual(checkStoryMap(split, inventory).problems.filter((p) => !/is covered by no story/.test(p)), [], 'only the other epics are missing from this one-epic map')
})

test('an accepted merge keeps the target, covers both, and redirects the stories that waited on the merged one', () => {
  const merged = applyMerge(storyMap(), 'EP-001-S02', 'EP-001-S01')
  const [s01] = merged.epics[0].stories
  assert.deepEqual([s01.covers, s01.effort, merged.epics[0].stories.map((s) => s.id)], [['FR-001', 'NFR-001', 'FR-002'], 5, ['EP-001-S01', 'EP-001-S03']])
  assert.deepEqual(applyMerge(storyMap(), 'EP-001-S01', 'EP-001-S03').epics.flatMap((e) => e.stories).find((s) => s.id === 'EP-002-S01').after, ['EP-001-S03'])
  const declared = applyDependency(storyMap(), 'EP-001-S03', ['EP-001-S02'])
  assert.deepEqual(declared.epics[0].stories[2].after, ['EP-001-S01', 'EP-001-S02'])
  assert.ok(Object.keys(CATALOGUE).every((kind) => CATALOGUE[kind].source && CATALOGUE[kind].plus.length && CATALOGUE[kind].minus.length))
})
