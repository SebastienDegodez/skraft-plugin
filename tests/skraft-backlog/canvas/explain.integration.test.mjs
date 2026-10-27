// The explanation the agent reads for one story: every INVEST letter and DoR item that does not
// hold, with what was found, why and how to fix it — in the language of the PRD.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assessBacklog } from '../../../plugins/skraft-backlog/prd-backlog/canvas/assess.mjs'
import { explainStory } from '../../../plugins/skraft-backlog/prd-backlog/canvas/explain.mjs'
import { loadBacklog } from '../../../plugins/skraft-backlog/prd-backlog/canvas/store.mjs'
import { DICTIONARIES } from '../../../plugins/skraft-backlog/prd-backlog/canvas/ui/i18n.mjs'
import { SLUG, makeWorkspace } from './workspace.mjs'

const assessed = async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-explain-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await makeWorkspace(cwd)
  const { raw } = /** @type {any} */ (await loadBacklog(cwd, SLUG))
  const assessment = assessBacklog(raw)
  return (id) => /** @type {any} */ (assessment.stories.find((s) => s.id === id))
}

test('a story that holds everywhere has nothing to explain', async (t) => {
  const story = await assessed(t)
  const explained = explainStory(story('EP-001-S01'), 'en')
  assert.deepEqual(explained, {
    id: 'EP-001-S01', title: "Recevoir la décision d'éligibilité", state: DICTIONARIES.en.states.ready, review: DICTIONARIES.en.reviews.none, verdict: 'pass',
    invest: [], dor: [], antipatterns: [], otherFindings: [], reasons: [],
  })
})

test('a refused story explains each failing line with the checks behind it, in French', async (t) => {
  const story = await assessed(t)
  const explained = explainStory(story('EP-001-S02'), 'fr')
  assert.equal(explained.state, DICTIONARIES.fr.states.refused)
  assert.equal(explained.verdict, 'fail')
  const persona = explained.dor.find((line) => line.line === 'DoR 2')
  assert.equal(persona.name, DICTIONARIES.fr.dor[2][0])
  assert.equal(persona.challenge, DICTIONARIES.fr.dor[2][1])
  assert.equal(persona.status, 'fail')
  assert.ok(persona.found.includes('utilisateur'), persona.found)
  assert.deepEqual(persona.evidence.map((e) => e.source), [DICTIONARIES.fr.sources.check])
  assert.ok(persona.evidence[0].why.includes('utilisateur') && persona.evidence[0].fix.trim(), persona.evidence[0].why)
  assert.ok(!('gate' in persona.evidence[0]), 'a check names no lens gate')
  assert.deepEqual(explained.reasons, story('EP-001-S02').reasons)
})

test('a warning of a lens is explained with its gate, its lens and its severity', async (t) => {
  const story = await assessed(t)
  const explained = explainStory(story('EP-001-S03'), 'en')
  assert.equal(explained.verdict, 'warn')
  assert.deepEqual(explained.invest.map((l) => [l.line, l.status]), [['T', 'warn']])
  assert.deepEqual(explained.dor.map((l) => [l.line, l.status]), [['DoR 3', 'warn']])
  assert.deepEqual(explained.dor[0].evidence, [{
    source: 'lens', gate: 'G8', lens: 'planning-dor', severity: 'low',
    why: 'Generic Data: EX-2 gives an age but no date of birth', fix: 'Give the date of birth of Karim Benali.',
  }])
  assert.deepEqual(explained.antipatterns, ['Generic Data'])
})

test('a held-back story explains its lens findings, the finding on no line and the reason it is held', async (t) => {
  const story = await assessed(t)
  const explained = explainStory(story('EP-002-S01'), 'en')
  assert.equal(explained.state, DICTIONARIES.en.states.held)
  assert.deepEqual(explained.dor.map((l) => l.line), ['DoR 7'])
  assert.equal(explained.dor[0].evidence[0].severity, 'blocker')
  assert.deepEqual(explained.otherFindings, [{ gate: 'G1', lens: 'planning-invest', severity: 'low', why: 'The upload limit is unstated', fix: 'Quote the size limit of the PRD.' }])
  assert.deepEqual(explained.reasons, ['DoR item 7: technical notes do not name the licence registry the check calls'])
  const withoutSuggestion = { ...story('EP-002-S01'), unplaced: [{ gate: 'G9', lens: 'planning-coherence', severity: 'medium', description: 'odd' }] }
  assert.deepEqual(explainStory(withoutSuggestion, 'fr').otherFindings, [{ gate: 'G9', lens: 'planning-coherence', severity: 'medium', why: 'odd', fix: '' }])
})
