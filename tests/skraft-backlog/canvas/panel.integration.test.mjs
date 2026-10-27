// The panel markup the reviewer reads, drawn from the snapshot of a controller over a real
// workspace: the plan, the progress view, a story under review and the launch bar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createController } from '../../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs'
import { renderBar, renderHeader, renderMapProblems, renderPlan, renderStory, renderTrack } from '../../../plugins/skraft-backlog/prd-backlog/canvas/ui/view.mjs'
import { fakeGitHub } from '../prd-backlog/fake-github.mjs'
import { makeWorkspace } from './workspace.mjs'

const VIEW = Object.freeze({ filter: 'all', query: '', focus: null })

/** A controller over the handoff workspace; `run` calls one of its actions. */
const setUp = async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-panel-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await makeWorkspace(cwd)
  const controller = createController({ cwd, gh: fakeGitHub().run, now: () => new Date('2026-10-20T10:00:00.000Z') })
  t.after(() => controller.stop())
  await controller.reload()
  const run = (name, input = {}) => /** @type {any} */ (controller.actions.find((a) => a.name === name)).run(input)
  return { controller, run }
}

/** The text of the elements of a class, in order. @param {string} html @param {string} className */
const texts = (html, className) => [...html.matchAll(new RegExp(`class="${className}">([^<]*)<`, 'g'))].map((m) => m[1])

test('the plan lists the stories by milestone then epic, with their state, and a filter keeps only its stories', async (t) => {
  const { controller } = await setUp(t)
  const snapshot = controller.snapshot()
  const header = renderHeader(snapshot, { tab: 'review' })
  assert.match(header, /<p class="coverage">4\/4 FR couvertes · 0 reportées<\/p>/)
  assert.match(header, /aria-label="2 en échec"/)
  assert.match(header, /data-tab="review" aria-selected="true"/)

  const plan = renderPlan(snapshot, { ...VIEW, folded: new Set(['EP-002']) })
  assert.deepEqual(texts(plan, 'row-id'), ['EP-001-S01', 'EP-001-S02', 'EP-001-S03', 'EP-002-S01'])
  assert.deepEqual(texts(plan, 'marker m-[a-z]+'), ['prête', 'refusée', 'prête', 'retenue'])
  assert.match(plan, /<span>approuvée · tentative 2<\/span>/)
  assert.match(plan, /data-filter="refused" aria-pressed="false">Refusées<span class="count">1<\/span>/)
  assert.match(plan, /<ol class="rows" id="rows-M2-EP-002" hidden>/, 'a folded epic hides its rows')

  const refused = renderPlan(snapshot, { ...VIEW, filter: 'refused' })
  assert.deepEqual(texts(refused, 'row-id'), ['EP-001-S02'])
  assert.deepEqual(texts(renderPlan(snapshot, { ...VIEW, query: 'permis' }), 'row-id'), ['EP-002-S01'])
  assert.match(renderPlan(snapshot, { ...VIEW, filter: 'published' }), /<li class="none">—<\/li>/)
})

test('the progress view counts the stories by stage and frames each epic with its review and its findings', async (t) => {
  const { controller } = await setUp(t)
  const track = renderTrack(controller.snapshot(), { ...VIEW, findings: new Set(['EP-001']) })
  assert.match(track, /data-figure="written">\s*<dt>fiches écrites<\/dt><dd class="figure-value">4\/4<\/dd>/)
  assert.match(track, /<div class="figure f-fail" data-figure="refused">/)
  assert.match(track, /<rect class="seg seg-ready" x="0" y="0" width="2" height="1"><title>2 prêtes à relire<\/title><\/rect><rect class="seg seg-held" x="2" y="0" width="1"/)
  assert.match(track, /<p class="epic-outcome">Le conducteur connaît son éligibilité dès la soumission de son profil.<\/p>/)
  assert.match(track, /aria-expanded="true" aria-controls="findings-EP-001"/, 'the findings of an epic open on demand')
  assert.match(track, /<ul class="findings" id="findings-EP-001"><li class="finding sev-low">/)
  assert.match(track, /<span>FR-002<\/span><span>après EP-001-S01<\/span><span>M1<\/span>/)
  assert.match(track, /data-action="to-questions" data-story="EP-002-S01" aria-label="2 questions ouvertes sur EP-002-S01"/)
  assert.match(renderTrack(controller.snapshot(), { ...VIEW, filter: 'published' }), /<li class="none muted">—<\/li>/)
})

test('a refused story shows each failing line with why and how to fix it, and points at the passage of the sheet', async (t) => {
  const { controller } = await setUp(t)
  const html = renderStory(controller.snapshot(), { focus: 'EP-001-S02', open: new Set(['4']), lit: { story: 'EP-001-S02', target: 'criteria', item: 'AC-02' } })
  assert.match(html, /<h1 id="story-title">Être refusé avant 18 ans<\/h1>/)
  assert.deepEqual(texts(html, 'evidence-why').slice(-3), [
    '« utilisateur » ne désigne aucun rôle précis (persona vague).',
    '2 exemples du domaine, il en faut au moins 3 (sans exemples).',
    'AC-02 parle de technique (« HTTP 403 ») au lieu du métier (critère technique).',
  ])
  assert.match(html, /<li class="line s-fail open" data-key="4">/)
  assert.match(html, /data-action="reveal" data-target="criteria" data-item="AC-02">Voir dans la fiche · AC-02<\/button>/)
  assert.match(html, /<li class="criterion sheet-item lit" data-item="AC-02">/, 'the passage the evidence points at is lit')
  assert.match(html, /data-action="open-line" data-line="2">Persona vague<\/button>/)
  assert.match(html, /<button type="button" class="ghost small" disabled title="pas prête, rien à relire">/, 'a refused story cannot be signed off')
  assert.match(html, /<dd>le service renvoie HTTP 403 au portail<\/dd>/)
})

test('a held story shows why it is held, its lens findings, and its open questions answerable in place', async (t) => {
  const { controller, run } = await setUp(t)
  await run('answer_question', { story: 'EP-002-S01', question: 'Q1', text: 'Le Système national des permis de conduire' })
  const html = renderStory(controller.snapshot(), { focus: 'EP-002-S01', open: new Set(), drafts: new Map([['EP-002-S01|Q2', '10 Mo']]) })
  assert.match(html, /<ul class="reasons"><li>DoR item 7: technical notes do not name the licence registry the check calls<\/li><\/ul>/)
  assert.match(html, /<li class="finding sev-low unplaced">/, 'a finding on no line is kept aside')
  assert.match(html, /data-question="Q1" data-option="0" aria-pressed="true">/, 'the picked option reads as the draft answer')
  assert.match(html, /data-action="withdraw-answer" data-story="EP-002-S01" data-question="Q1">/)
  assert.match(html, /data-question="Q2" rows="2" placeholder="Votre réponse">10 Mo<\/textarea>/, 'what the reviewer types survives a redraw')
  assert.match(html, /dock-ask q-open" data-action="to-questions" data-story="EP-002-S01" title="1 questions? ouvertes? sur EP-002-S01"/)
  assert.equal(renderMapProblems(controller.snapshot()), '')
})

test('a ready story is signed off from its dock, and the bar creates only after a dry run of the reviewed stories', async (t) => {
  const { controller, run } = await setUp(t)
  const idle = renderBar(controller.snapshot())
  assert.match(idle, /<button type="button" class="ghost" data-action="preview" disabled>/, 'nothing reviewed, nothing to preview')
  assert.match(idle, /<button type="button" class="primary" data-action="create" disabled>Créer les issues<\/button>/)
  assert.match(renderStory(controller.snapshot(), { focus: 'EP-001-S01', open: new Set() }), /class="primary small" data-action="review" data-story="EP-001-S01" data-reviewed="true">/)

  await run('mark_reviewed', { ids: ['EP-001-S01'] })
  assert.match(renderStory(controller.snapshot(), { focus: 'EP-001-S01', open: new Set() }), /data-action="review" data-story="EP-001-S01" data-reviewed="false">Retirer la relecture<\/button>/)
  await run('preview_creation')
  const bar = renderBar(controller.snapshot())
  assert.match(bar, /<strong>1\/2 prêtes relues<\/strong>/)
  assert.match(bar, /<code>EP-001-S01<\/code><span class="op-title">feat\(ep-001\): Recevoir la décision d&#39;éligibilité<\/span><span class="op-status op-dry-run">à créer<\/span>/)
  assert.match(bar, /<span>sous-issue de EP-001<\/span><span class="op-status op-dry-run">à lier<\/span>/)
  assert.match(bar, /<button type="button" class="primary" data-action="create">Créer 2 issues<\/button>/)
  assert.match(bar, /<span class="destination">vers <code>acme\/permis<\/code><\/span>/)
})
