// The checks that decide, without a model, whether a story map and a story file can move on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { inventoryOf } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { buildOrder, checkStoryMap } from '../../../plugins/skraft-backlog/prd-backlog/story-map.mjs'
import { checkStory } from '../../../plugins/skraft-backlog/prd-backlog/story.mjs'
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
  assert.deepEqual(checkStory(storyFile(planned('EP-001-S02')), planned('EP-001-S02'), known), { problems: [], warnings: [] })
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
