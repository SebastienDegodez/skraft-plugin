// FRAME: the questions answered before the first slice, on the skwad PRD.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { framingLines, prdQuestions, slicerQuestions, unanswered } from '../../../plugins/skraft-backlog/prd-backlog/framing.mjs'

const inventory = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/skwad/inventory-frame.json', import.meta.url)), 'utf8'))

test('skwad: the PRD raises the channels of EP-001, the milestones, the dense epics and the 66 NFRs, each with a recommendation', () => {
  const questions = prdQuestions(inventory, '## Lot 1 — MVP\n\n## Phase 2 : industrialisation\n')
  assert.deepEqual(questions.map((q) => q.id), ['channels-EP-001', 'milestones', 'dense-EP-001', 'dense-EP-003', 'nfr'])
  const channels = questions[0]
  assert.equal(channels.question, 'EP-001 nomme GitHub, Slack, web form : comment découper ces canaux ?')
  assert.equal(channels.options[channels.recommended], 'Une story par canal, le premier sert de tracer')
  assert.match(questions[1].why, /Lot 1 — MVP · Phase 2 : industrialisation/)
  assert.equal(questions[1].options[0], 'Un jalon par lot ou phase du PRD')
  assert.match(questions[4].question, /66 exigences non fonctionnelles/)
  assert.deepEqual(prdQuestions(inventory, '# Rien\n')[1].options[0], 'Un seul jalon MVP, le reste plus tard', 'without lots, the MVP comes first')
})

test('the slicer questions are kept when well formed, at most 5, and the slicer is told each answer or the recommendation', () => {
  const asked = slicerQuestions({ questions: [
    { question: 'Le tracer de EP-001 passe-t-il par GitHub ?', why: 'canal le plus utilisé', options: ['GitHub', 'Slack'], recommended: 0 },
    { question: 'sans options', options: ['seule'] },
    { question: 'Recommandation hors bornes', options: ['a', 'b'], recommended: 9 },
    ...Array.from({ length: 6 }, (_, i) => ({ question: `Q${i}`, options: ['oui', 'non'] })),
  ] })
  assert.equal(asked.length, 5)
  assert.deepEqual(asked.slice(0, 2).map((q) => [q.id, q.source, q.recommended]), [['slicer-1', 'slicer', 0], ['slicer-2', 'slicer', 0]])
  const framing = { version: 1, questions: [...prdQuestions(inventory, '').slice(0, 2), asked[0]], answers: { milestones: { text: 'Un seul jalon MVP', at: 'x' } } }
  assert.deepEqual(unanswered(framing).map((q) => q.id), ['channels-EP-001', 'slicer-1'])
  assert.deepEqual(framingLines(framing), [
    'EP-001 nomme GitHub, Slack, web form : comment découper ces canaux ? → Une story par canal, le premier sert de tracer (recommended, not answered)',
    'Comment découper en jalons ? → Un seul jalon MVP',
    'Le tracer de EP-001 passe-t-il par GitHub ? → GitHub (recommended, not answered)',
  ])
  assert.deepEqual(slicerQuestions(null), [])
})

const prdFormat = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/prd-formats/${name}`, import.meta.url)), 'utf8')

test('an HVE PRD with no epic: the PO is told why the cut is by capability, and the MVP section recommends the milestones', async () => {
  const { inventoryOf } = await import('../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs')
  const text = prdFormat('hve-brd-builder-prd.md')
  const questions = prdQuestions(inventoryOf(text), text)
  assert.deepEqual(questions.map((q) => q.id), ['epics', 'milestones', 'nfr'])
  const [epics, milestones] = questions
  assert.equal(epics.options[epics.recommended], 'A single epic until a distinct outcome justifies a cut', '7 FRs: one epic')
  assert.match(epics.why, /deploys on its own.*\+ each epic.*− an epic may touch several bounded contexts/)
  assert.match(milestones.why, /^The section "MVP and Release Framing" puts FR-001, FR-002, FR-003, FR-004, FR-005, FR-006… in the first release\.$/)
  assert.equal(milestones.options[milestones.recommended], 'One MVP milestone with the first-release requirements, the rest in a later milestone')
})

test('an HVE PRD in draft: the human is warned of the risks; its fixed section titles are no release slice', async () => {
  const { inventoryOf } = await import('../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs')
  const text = prdFormat('hve-sssc-planner-prd.md')
  const questions = prdQuestions(inventoryOf(text), text)
  const status = questions.find((q) => q.id === 'prd-status')
  assert.match(status.question, /still "draft"/)
  assert.match(status.why, /renumbered/)
  assert.equal(status.options[status.recommended], 'Slice now, every story notes that the PRD is not approved')
  const milestones = questions.find((q) => q.id === 'milestones')
  assert.doesNotMatch(milestones.why, /Phase Architecture/)
  assert.equal(questions.find((q) => q.id === 'epics').options[1], 'One epic per capability delivered and deployed together, proposed by the slicer')
})

test('an FR the PRD names but never defines is put to the human, never fixed in the PRD', async () => {
  const { inventoryOf } = await import('../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs')
  const text = '- FR-001: The customer orders.\n\nSee FR-009.\n'
  const unread = prdQuestions(inventoryOf(text), text).find((q) => q.id === 'unread')
  assert.equal(unread.question, 'The PRD names FR-009 (line 3) but never defines it: what should be done?')
  assert.equal(unread.options[unread.recommended], 'Ignore it, it is a reference or a typo')
})
