// The panel never goes blank: before the story map, and when it cannot draw it, it shows where the
// backlog stands — and while a run works, which agents are at it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isWorking, renderDiagnostics, renderRunNotice, renderWorker } from '../../../plugins/skraft-backlog/prd-backlog/canvas/ui/view.mjs'

const NOW = Date.parse('2026-10-20T10:12:00.000Z')
const diagnostics = (run) => ({
  slug: 'demo-prd', language: 'fr', run, steps: {}, inventory: { fr: 3, nfr: 1, epics: 1 }, framing: { questions: 2, open: 1 }, map: { state: 'missing', stories: 0 },
})
const running = { startedAt: '2026-10-20T10:00:00.000Z', phase: 'SLICE', status: 'running', mode: 'full', agents: { 'slice · attempt 1': { agent: 'backlog-slicer', since: '2026-10-20T10:10:00.000Z' } } }

test('while a run works, the worker names each agent at work and for how long', () => {
  assert.equal(isWorking(running), true)
  assert.equal(isWorking({ ...running, endedAt: '2026-10-20T10:13:00.000Z' }), false)
  const html = renderWorker(diagnostics(running), NOW)
  assert.match(html, /1 agent au travail — phase SLICE/)
  assert.match(html, /depuis 12 min/)
  assert.match(html, /<code>backlog-slicer<\/code><span>slice · attempt 1<\/span><span class="muted">depuis 2 min<\/span>/)
  assert.match(renderWorker(diagnostics({ ...running, agents: {} }), NOW), /Le workflow travaille — phase SLICE/)
  assert.equal(renderWorker(diagnostics({ ...running, status: 'blocked' }), NOW), '')
})

test('without a story map the diagnostics say where the run stands, in the language of the PRD', () => {
  const html = renderDiagnostics({ diagnostics: diagnostics(running), assessment: null, error: 'demo-prd: no story map yet' }, { now: NOW })
  assert.match(html, /Rien d’exploitable pour l’instant/)
  assert.match(html, /Inventaire : 3 FR, 1 NFR, 1 épic/)
  assert.match(html, /Cadrage : 2 questions, 1 sans réponse/)
  assert.match(html, /Carte des stories : pas encore écrite/)
  assert.doesNotMatch(html, /no story map yet/, 'the English message of the controller is not repeated')
})

test('a stopped run shows why, with its problems; a drawing that fails is said, never blank', () => {
  const stopped = { ...running, agents: undefined, status: 'blocked', endedAt: '2026-10-20T10:30:00.000Z', detail: 'SLICE: 1 problem(s) left after 3 attempts', problems: ['moscow must be one of must, should, could'] }
  const snapshot = { diagnostics: { ...diagnostics(stopped), map: { state: 'ready', stories: 4, epics: 2 } }, assessment: {} }
  const notice = renderRunNotice(snapshot, NOW)
  assert.match(notice, /Diagnostic — bloqué · SLICE: 1 problem\(s\) left after 3 attempts/)
  assert.match(notice, /<li>moscow must be one of must, should, could<\/li>/)
  assert.match(renderDiagnostics(snapshot, { error: 'boom', now: NOW }), /Le panneau n’a pas pu afficher ce backlog : boom/)
  assert.match(renderDiagnostics(null), /No backlog in this workspace/)
  assert.equal(renderRunNotice({ diagnostics: diagnostics({ ...stopped, status: 'paused' }) }, NOW), '', 'a pause waits for the human: nothing to diagnose')
})
