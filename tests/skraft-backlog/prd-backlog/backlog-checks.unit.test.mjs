// The checks that decide, without a model, whether a story map and a story file can move on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { inventoryOf } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { PLANNED_DEPENDENCIES, renderStoriesFile } from '../../../plugins/skraft-backlog/prd-backlog/render.mjs'
import { buildOrder, checkStoryMap, normalizeStoryMap } from '../../../plugins/skraft-backlog/prd-backlog/story-map.mjs'
import { checkStory, normalizeStory } from '../../../plugins/skraft-backlog/prd-backlog/story.mjs'
import { FIXTURE_PRD } from './simulated-ctx.mjs'
import { storyFile, storyMap } from './fixtures/backlog-data.mjs'

const inventory = inventoryOf(readFileSync(FIXTURE_PRD, 'utf8'))
const known = new Set(inventory.requirements.map((r) => r.id))
const planned = (id) => storyMap().epics.flatMap((e) => e.stories.map((s) => ({ ...s, epic: e.id }))).find((s) => s.id === id)

test('the inventory reads every id once, the epic of each FR, and the language of the PRD', () => {
  assert.equal(inventory.language, 'fr')
  assert.deepEqual(inventory.epics.map((e) => e.id), ['EP-001', 'EP-002'])
  const epicOf = Object.fromEntries(inventory.requirements.map((r) => [r.id, r.epic]))
  assert.deepEqual([epicOf['FR-001'], epicOf['FR-003'], epicOf['FR-004'], epicOf['NFR-001'], epicOf['AC-001']], ['EP-001', 'EP-001', 'EP-002', null, null])
  assert.deepEqual(inventory.requirements.map((r) => r.kind).filter((k, i, all) => all.indexOf(k) === i), ['FR', 'NFR', 'AC'])
})

test('a heading at the level of the epic closes it: its requirements belong to no epic', () => {
  const closed = inventoryOf('### EP-001 : Un\n* `FR-001` : a\n### Démonstration\n* `FR-002` : b\n#### EP-002 - Deux\n* `FR-003` : c\n')
  assert.deepEqual(closed.requirements.map((r) => r.epic), ['EP-001', null, 'EP-002'])
  assert.equal(inventoryOf('The portal must show the decision and the reason for the driver.').language, 'en')
})

test('the fixture story map passes and builds in milestone and dependency order', () => {
  assert.deepEqual(checkStoryMap(storyMap(), inventory), { problems: [], warnings: [] })
  assert.deepEqual(buildOrder(storyMap()).map((s) => s.id), ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01'])
})

test('a map is refused for an uncovered FR, an unknown id, a misplaced cover, a duplicate and a missing deferral reason', () => {
  const map = storyMap()
  map.epics[1].stories[0].covers = ['FR-404']
  map.epics[1].covers = ['FR-404']
  map.epics[0].stories[2].id = 'EP-001-S02'
  map.deferred = [{ id: 'FR-003', reason: '' }]
  const { problems } = checkStoryMap(map, inventory)
  assert.ok(problems.includes('EP-002-S01 covers FR-404, which the PRD does not define'))
  assert.ok(problems.includes('FR-004 is covered by no story and not deferred'))
  assert.ok(problems.includes('EP-001-S02 is used more than once'))
  assert.ok(problems.includes('deferred FR-003 has no reason'))
  assert.ok(problems.includes('FR-003 is both deferred and covered by a story'))
})

test('a map is refused for a cycle, a dependency on a later milestone, a missing tracer and an effort above 8', () => {
  const map = storyMap()
  map.epics[0].stories[1].after = ['EP-001-S03']
  map.epics[0].stories[2].after = ['EP-001-S02']
  map.epics[0].stories[0].after = ['EP-002-S01']
  map.epics[1].stories[0].tracer = false
  map.epics[1].stories[0].after = []
  const { problems } = checkStoryMap(map, inventory)
  assert.ok(problems.includes('EP-001-S01 (M1) waits on EP-002-S01, planned in the later milestone M2'), problems.join('\n'))
  assert.ok(problems.includes('EP-002 must open with exactly one tracer story (tracer: true on its first story)'))
  assert.ok(problems.includes('dependency cycle: EP-001-S02 -> EP-001-S03 -> EP-001-S02'))
  map.epics[0].stories[2].effort = 13
  assert.deepEqual(checkStoryMap(map, inventory).problems, ['EP-001.stories[2].effort must be one of 1, 2, 3, 5, 8 (above 8: split the story)'])
})

test('an uncovered NFR is a warning, an epic of more than 12 stories too', () => {
  const map = storyMap()
  map.epics[0].stories[0].covers = ['FR-001']
  map.epics[0].stories.push(...Array.from({ length: 10 }, (_, i) => ({ ...map.epics[0].stories[1], id: `EP-001-S1${i}`, tracer: false })))
  const { problems, warnings } = checkStoryMap(map, inventory)
  assert.deepEqual(problems, [])
  assert.deepEqual(warnings, ['no story carries 1 NFR(s): NFR-001', 'EP-001 has 13 stories: offer a split of the epic'])
})

test('the fixture story file passes the Definition of Ready checks', () => {
  assert.deepEqual(checkStory(storyFile(planned('EP-001-S02')), planned('EP-001-S02'), known), { problems: [], warnings: [], details: [] })
})

test('a story file is refused for a vague persona, an implementation goal and a technical criterion', () => {
  const file = storyFile(planned('EP-001-S02'))
  file.persona = 'développeur'
  file.story.iWant = 'implémenter le service d’éligibilité'
  file.acceptanceCriteria[1].then = ['the EligibilityService returns HTTP 200']
  const { problems } = checkStory(file, planned('EP-001-S02'), known)
  assert.ok(problems.includes('DoR 2: persona "développeur" names no role (Vague Persona)'))
  assert.ok(problems.some((p) => /describes an implementation \(Implement-X\)/.test(p)))
  assert.ok(problems.includes('AC-02 names system internals or HTTP details (Technical AC)'))
})

test('a story file is refused when a criterion derives from no example, a task serves nothing, or a cover is dropped', () => {
  const file = storyFile(planned('EP-001-S01'))
  file.acceptanceCriteria[2].example = 'EX-9'
  file.acceptanceCriteria[0].covers = ['FR-001']
  file.tasks = [{ text: 'faire', acceptanceCriteria: ['AC-01', 'AC-07'] }]
  const { problems } = checkStory(file, planned('EP-001-S01'), known)
  assert.ok(problems.includes('DoR 5: AC-03 derives from no domain example of the story'))
  assert.ok(problems.includes('a task serves AC-07, which is no criterion of the story'))
  assert.ok(problems.includes('no task serves AC-02'))
  assert.ok(problems.includes('no acceptance criterion covers NFR-001, which the map gives this story'))
})

test('a story file is refused when its dependencies drift from the map, its effort is above 8 or its notes are empty', () => {
  const file = storyFile(planned('EP-001-S02'))
  file.dependencies = [{ story: 'EP-001-S01', reason: 'x' }, { story: 'EP-001-S03', reason: 'y' }]
  file.effort = { points: 13, rationale: '' }
  file.technicalNotes = []
  file.devNotes.references = []
  file.examples = file.examples.slice(0, 2)
  const { problems } = checkStory(file, planned('EP-001-S02'), known)
  assert.ok(problems.includes('DoR 8: dependencies are [EP-001-S01, EP-001-S03], the map plans [EP-001-S01]'))
  assert.ok(problems.some((p) => /DoR 6: effort must be one of/.test(p)))
  assert.ok(problems.includes('DoR 6: effort.rationale is missing'))
  assert.ok(problems.some((p) => /DoR 7: technicalNotes is empty/.test(p)))
  assert.ok(problems.includes('devNotes.references must cite the PRD passages the builder needs'))
  assert.ok(problems.includes('DoR 3: 2 domain example(s), at least 3 needed'))
})

// ── Normalization: what a script can fix is never sent back to an agent ─────────────────────────

const skwad = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/skwad/${name}`, import.meta.url)), 'utf8'))
const skwadInventory = skwad('inventory.json')
const skwadKnown = new Set(skwadInventory.requirements.map((r) => r.id))

test('the skwad story map (milestones as bare strings, no tracer flag, ids -S1) passes once normalized', () => {
  const written = skwad('story-map.orig.json')
  const before = checkStoryMap(written, skwadInventory).problems
  assert.equal(before.length, 109)
  const { map, changes } = normalizeStoryMap(written)
  assert.deepEqual(checkStoryMap(map, skwadInventory).problems, [])
  assert.equal(written.milestones[0], 'MVP', 'the input is not changed')
  assert.deepEqual(map.milestones, [{ id: 'MVP', title: 'MVP' }])
  assert.equal(changes.length, 15)
  assert.ok(map.epics.every((epic) => epic.stories[0].tracer === true && epic.stories.slice(1).every((s) => !('tracer' in s))))
  assert.equal(map.epics[0].stories[1].id, 'EP-001-S2', 'ids keep their own numbering')
  const { warnings } = checkStoryMap(map, skwadInventory)
  assert.ok(warnings.includes('EP-012-S5 is sized 5 (more than one day assisted by AI): split it before approving'), warnings.join('\n'))
  assert.ok(warnings.includes('EP-003-S4 is sized 8 (more than one day assisted by AI): split it before approving'))
  assert.ok(warnings.includes('EP-001-S1 carries 4 FRs: check it against the split patterns before approving') === false)
})

test('normalization moves the tracer to the first story, declares a used milestone and writes MoSCoW and effort on their scale', () => {
  const map = storyMap()
  map.epics[0].stories[0].tracer = false
  map.epics[0].stories[2].tracer = true
  map.epics[1].stories[0].milestone = 'M3'
  map.epics[0].stories[1].moscow = 'MUST'
  map.epics[0].stories[1].effort = '2'
  delete map.epics[0].stories[0].after
  const { map: fixed, changes } = normalizeStoryMap(map)
  assert.deepEqual(fixed.epics[0].stories.map((s) => s.tracer), [true, undefined, undefined])
  assert.deepEqual(fixed.milestones.map((m) => m.id), ['M1', 'M2', 'M3'])
  assert.deepEqual([fixed.epics[0].stories[1].moscow, fixed.epics[0].stories[1].effort, fixed.epics[0].stories[0].after], ['must', 2, []])
  assert.deepEqual(checkStoryMap(fixed, inventory).problems, [])
  assert.ok(changes.includes('EP-001-S03 does not open EP-001: tracer flag removed'))
  assert.ok(changes.includes('milestone M3 is used by EP-002-S01 but was not declared: declared after the others'))
  assert.deepEqual(normalizeStoryMap(storyMap()).changes, [], 'a clean map is left as it is')
})

test('the skwad story EP-001-S2 lists its dependency as { id }: it names its story and is written back as { story }', () => {
  const map = normalizeStoryMap(skwad('story-map.orig.json')).map
  const planned = { ...map.epics[0].stories[1], epic: 'EP-001' }
  const file = skwad('EP-001-S2.json')
  assert.deepEqual(file.dependencies.map((d) => Object.keys(d).sort()), [['id', 'reason']])
  const sizeOnly = ['DoR 6: 7 acceptance criteria: split the story (Giant Story)', 'DoR 6: effort 5 is more than one day assisted by AI (Giant Story): split the story']
  assert.deepEqual(checkStory(file, planned, skwadKnown).problems, sizeOnly, 'the { id } dependency is read; only its size is refused')
  const { file: fixed, changes } = normalizeStory(file, planned)
  assert.deepEqual(changes, ['dependencies'])
  assert.deepEqual(fixed.dependencies, [{ story: 'EP-001-S1', reason: file.dependencies[0].reason }])
  assert.deepEqual(checkStory(fixed, planned, skwadKnown).problems, sizeOnly)
})

test('normalization writes the map fields into a story file, and moves a dependency the map does not plan to the open questions', () => {
  const file = storyFile(planned('EP-001-S02'))
  delete file.epic
  file.id = 'EP-1-S2'
  file.dependencies = [{ id: 'EP-001-S03', reason: 'la décision doit être conservée' }]
  const { file: fixed, changes } = normalizeStory(file, planned('EP-001-S02'))
  assert.deepEqual(changes, ['id', 'epic', 'milestone', 'moscow', 'covers', 'after', 'dependencies', 'openQuestions'])
  assert.deepEqual([fixed.id, fixed.epic, fixed.milestone, fixed.moscow, fixed.covers, fixed.after], ['EP-001-S02', 'EP-001', 'M1', 'must', ['FR-002'], ['EP-001-S01']])
  assert.deepEqual(fixed.dependencies, [{ story: 'EP-001-S01' }])
  assert.deepEqual(fixed.openQuestions, [{ id: 'Q1', question: 'Dependency on EP-001-S03 not planned by the story map: add it to the map?', why: 'la décision doit être conservée' }])
  assert.deepEqual(checkStory(fixed, planned('EP-001-S02'), known).problems, ['DoR 8: EP-001-S01 is listed without a reason'])
})

test('a dependency entry naming no story says which field to write', () => {
  const file = storyFile(planned('EP-001-S02'))
  file.dependencies = [{ reason: 'la décision doit exister' }]
  const { problems } = checkStory(file, planned('EP-001-S02'), known)
  assert.ok(problems.includes('DoR 8: dependencies[0] names no story: write { "story": "<story id>", "reason": "…" }'), problems.join('\n'))
})

test('the stories file a lens reads gives each story its criteria and marks its dependencies as planned in the map', () => {
  const map = storyMap()
  const files = new Map(map.epics[1].stories.map((s) => [s.id, storyFile({ ...s, epic: 'EP-002' })]))
  const text = renderStoriesFile(map.epics[1], map, files)
  assert.ok(text.includes(PLANNED_DEPENDENCIES))
  assert.match(text, /- dependencies: planned in the approved story map, built first — EP-001-S01 \(EP-001, M1\)/)
  assert.match(text, /- acceptance criteria: 3\n {2}- AC-01: Cas 1\n {2}- AC-02: Cas 2\n {2}- AC-03: Cas 3/)
})

test('notes written as texts instead of lists, and references as "FR-234 : …", are put in the schema shape', () => {
  const file = storyFile(planned('EP-001-S02'))
  file.devNotes = {
    context: 'La décision est calculée à la soumission.',
    testing: 'Un test d’acceptation par critère.',
    references: ['FR-002 : règle de refus et motif', 'AC-002 — motif affiché', 'Décision DD-012 sur le calcul de l’âge'],
  }
  file.technicalNotes = 'None identified'
  const { problems } = checkStory(file, planned('EP-001-S02'), known)
  assert.ok(problems.some((p) => /devNotes\.context/.test(p)) && problems.some((p) => /devNotes\.testing/.test(p)))
  const { file: fixed, changes } = normalizeStory(file, planned('EP-001-S02'))
  assert.deepEqual(changes.filter((c) => /Notes/.test(c)), ['technicalNotes', 'devNotes.context', 'devNotes.testing', 'devNotes.references'])
  assert.deepEqual(fixed.devNotes.context, ['La décision est calculée à la soumission.'])
  assert.deepEqual(fixed.devNotes.references, [
    { id: 'FR-002', note: 'règle de refus et motif' },
    { id: 'AC-002', note: 'motif affiché' },
    { id: 'DD-012', note: 'Décision DD-012 sur le calcul de l’âge' },
  ])
  assert.deepEqual(checkStory(fixed, planned('EP-001-S02'), known).problems, [])
  assert.deepEqual(normalizeStory(storyFile(planned('EP-001-S02')), planned('EP-001-S02')).changes.filter((c) => /Notes/.test(c)), [], 'a file in the schema shape is left as it is')
})
