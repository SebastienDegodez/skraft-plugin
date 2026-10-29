// The backlog canvas in a real browser, over the fixture workspace and a fake `gh`. Each test starts
// its own server on a fresh workspace, so a review or a creation never leaks into the next test.
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const SERVE = fileURLToPath(new URL('./serve-fixture.mjs', import.meta.url))

/** @param {string[]} [args] @returns {Promise<{ url: string, cwd: string, stop: () => Promise<void> }>} */
const startFixture = (args = []) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [SERVE, ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
  const exited = new Promise((done) => child.once('exit', () => done(undefined)))
  let out = ''
  child.stdout.on('data', (chunk) => {
    out += chunk
    const [url, cwd] = out.split('\n')
    // The fixture removes its workspace on SIGTERM; stop waits for that before the next test.
    if (cwd) resolve({ url, cwd, stop: async () => { child.kill('SIGTERM'); await exited } })
  })
  child.on('exit', (code) => reject(new Error(`serve-fixture exited with ${code}`)))
})

let fixture
test.beforeEach(async ({ page }) => {
  fixture = await startFixture()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.errors = errors
  await page.goto(fixture.url)
  await expect(page.locator('.card').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Revue' }).click()
  await expect(page.locator('.story-head')).toBeVisible()
})
test.afterEach(async ({ page }) => {
  try {
    expect(page.errors, 'the panel logs no error').toEqual([])
  } finally {
    await fixture.stop()
  }
})

const backlogDir = () => join(fixture.cwd, '.copilot-tracking', 'skraft-plans', 'eligibilite-prd', 'backlog')
const row = (page, id) => page.locator(`.row[data-story="${id}"]`)
const epicHead = (page, id) => page.locator(`.epic-head[data-epic="${id}"]`)
const tab = (page, name) => page.getByRole('tab', { name })
const card = (page, id) => page.locator(`#track-${id}`)
const trackRow = (page, id) => page.locator(`.track-row[data-story="${id}"]`)
const figure = (page, key) => page.locator(`.figure[data-figure="${key}"]`)

test('the flight plan shows every story by milestone, and opens on the first failing one', async ({ page }) => {
  await expect(page.locator('.milestone h3')).toHaveText([/v0\.1-eligibilite/, /v0\.2-justificatifs/])
  await expect(page.locator('.row')).toHaveCount(4)
  await expect(row(page, 'EP-001-S02')).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S02')
  await expect(row(page, 'EP-001-S02').locator('.marker')).toHaveText('refusée')
  await expect(row(page, 'EP-002-S01').locator('.marker')).toHaveText('retenue')
  await expect(row(page, 'EP-001-S01').locator('.marker')).toHaveText('prête')
  await expect(row(page, 'EP-001-S02').locator('.tick')).toHaveCount(14)
  await expect(row(page, 'EP-001-S02').locator('.tick.s-fail')).toHaveCount(6)
  await expect(page.locator('.coverage')).toHaveText('4/4 FR couvertes · 0 reportées')
  await expect(page.locator('.repo code')).toHaveText('acme/permis')
})

test('the plan separates the stories by epic, each with its review verdict and the strip of its stories', async ({ page }) => {
  await expect(page.locator('.milestone').nth(0).locator('.epic-head .epic-id')).toHaveText(['EP-001'])
  await expect(page.locator('.milestone').nth(1).locator('.epic-head .epic-id')).toHaveText(['EP-002'])
  await expect(epicHead(page, 'EP-001').locator('.epic-title')).toHaveText("Contrôle d'éligibilité")
  await expect(epicHead(page, 'EP-001').locator('.epic-verdict')).toHaveText('approuvée · tentative 2')
  await expect(epicHead(page, 'EP-001').locator('.epic-verdict')).toHaveClass(/v-pass/)
  await expect(epicHead(page, 'EP-002').locator('.epic-verdict')).toHaveText('rejetée · tentative 1')
  await expect(epicHead(page, 'EP-002').locator('.epic-verdict')).toHaveClass(/v-fail/)
  await expect(epicHead(page, 'EP-001').locator('.cell')).toHaveCount(3)
  await expect(epicHead(page, 'EP-001').locator('.cell.v-fail')).toHaveCount(1)
  await expect(epicHead(page, 'EP-001').locator('.cell.v-warn')).toHaveCount(1)
  const labels = (locator) => locator.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
  expect(await labels(epicHead(page, 'EP-001').locator('.epic-tally .tally-item'))).toEqual(['1 conforme', '1 avec avertissement', '1 en échec'])
  await expect(page.locator('.board .tally-item')).toHaveText(['1', '1', '2'])
  expect(await labels(page.locator('.board .tally-item'))).toEqual(['1 conforme', '1 avec avertissement', '2 en échec'])
})

test('an epic folds in the plan, and focusing one of its stories unfolds it', async ({ page }) => {
  const head = epicHead(page, 'EP-001')
  await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'false')
  await expect(head).toBeFocused()
  await expect(row(page, 'EP-001-S01')).toBeHidden()
  await expect(row(page, 'EP-002-S01')).toBeVisible()
  await page.locator('.story').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('k')
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  await expect(row(page, 'EP-001-S01')).toHaveAttribute('aria-current', 'true')
})

test('the panel opens on the progress view: the key figures, then the stories by stage in one bar', async ({ page }) => {
  await page.goto(fixture.url)
  await expect(tab(page, 'Suivi')).toHaveAttribute('aria-selected', 'true')
  await expect(tab(page, 'Revue')).toHaveAttribute('aria-selected', 'false')
  await expect(page.locator('.story')).toBeHidden()
  await expect(page.locator('.plan')).toBeHidden()
  await expect(figure(page, 'epics').locator('.figure-value')).toHaveText('2')
  await expect(figure(page, 'stories').locator('.figure-value')).toHaveText('4')
  await expect(figure(page, 'written').locator('dt')).toHaveText('fiches écrites')
  await expect(figure(page, 'written').locator('.figure-value')).toHaveText('4/4')
  await expect(figure(page, 'refused')).toHaveClass(/f-fail/)
  await expect(figure(page, 'held')).toHaveClass(/f-warn/)
  await expect(figure(page, 'ready').locator('.figure-value')).toHaveText('2')
  await expect(figure(page, 'reviewed').locator('.figure-value')).toHaveText('0/2')
  await expect(figure(page, 'published')).not.toHaveClass(/later/)
  await expect(page.locator('.legend-item')).toHaveText(['2 prêtes à relire', '1 retenue', '1 refusée'])
  const segments = await page.locator('.progress-bar rect').evaluateAll((rects) => rects.map((r) => `${r.getAttribute('class')}:${r.getAttribute('width')}`))
  expect(segments).toEqual(['seg seg-ready:2', 'seg seg-held:1', 'seg seg-refused:1'])
  await expect(page.locator('.progress-bar')).toHaveAttribute('aria-label', 'Avancement des stories : 2 prêtes à relire, 1 retenue, 1 refusée')
})

test('each epic is framed in the progress view with its review, its findings and its stories', async ({ page }) => {
  await tab(page, 'Suivi').click()
  const first = card(page, 'EP-001')
  await expect(page.locator('.card .card-fold .epic-id')).toHaveText(['EP-001', 'EP-002'])
  await expect(first.locator('.card-name')).toHaveText("Contrôle d'éligibilité")
  await expect(first.locator('.card-review .epic-verdict')).toHaveText('approuvée · tentative 2')
  await expect(first.locator('.epic-outcome')).toHaveText('Le conducteur connaît son éligibilité dès la soumission de son profil.')
  await expect(first.locator('.epic-done dd')).toHaveText(['Un conducteur éligible et un conducteur refusé voient chacun leur décision en production.'])
  const toggle = first.locator('.findings-toggle')
  await expect(toggle).toHaveText('Constats sur l’épic1')
  await expect(toggle).toHaveClass(/v-warn/)
  await expect(first.locator('.finding')).toBeHidden()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(first.locator('.finding .evidence-source')).toHaveText('planning-coherence · G5 · faible')
  await expect(first.locator('.finding .evidence-why')).toHaveText('The done-when check names no date for the production release')
  await expect(first.locator('.track-row')).toHaveCount(3)
  await expect(trackRow(page, 'EP-001-S01').locator('.tracer')).toHaveText('tracer')
  await expect(trackRow(page, 'EP-001-S01').locator('.track-sub span')).toHaveText(['FR-001, NFR-001', 'M1'])
  await expect(trackRow(page, 'EP-001-S02').locator('.track-sub span')).toHaveText(['FR-002', 'après EP-001-S01', 'M1'])
  await expect(trackRow(page, 'EP-001-S03').locator('.track-facts')).toHaveText('2 ptsshould')
  await expect(card(page, 'EP-002').locator('.card-review .epic-verdict')).toHaveText('rejetée · tentative 1')
  await expect(card(page, 'EP-002').locator('.card-quiet')).toHaveText('Aucun constat sur l’épic elle-même.')
  await first.locator('.card-fold').click()
  await expect(first.locator('.card-fold')).toHaveAttribute('aria-expanded', 'false')
  await expect(first.locator('.card-body')).toBeHidden()
  await expect(first.locator('.card-fold')).toBeFocused()
})

test('a story of the progress view opens in the review, and the story leads back to the card of its epic', async ({ page }) => {
  await expect(page.locator('.epic-review')).toHaveCount(0)
  await tab(page, 'Suivi').click()
  await trackRow(page, 'EP-001-S03').click()
  await expect(tab(page, 'Revue')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S03')
  await expect(page.locator('.story')).toBeFocused()
  await expect(page.locator('.epic-review')).toHaveCount(0)
  await page.locator('.meta-epic').click()
  await expect(tab(page, 'Suivi')).toHaveAttribute('aria-selected', 'true')
  await expect(card(page, 'EP-001')).toBeFocused()
  await expect(card(page, 'EP-001')).toBeInViewport()
  await expect(trackRow(page, 'EP-001-S03')).toHaveAttribute('aria-current', 'true')
})

test('the epic link brings back a card the filters had hidden, unfolded', async ({ page }) => {
  await tab(page, 'Suivi').click()
  await card(page, 'EP-001').locator('.card-fold').click()
  await page.locator('.track-tools [data-filter="held"]').click()
  await expect(card(page, 'EP-001')).toHaveCount(0)
  await tab(page, 'Revue').click()
  await expect(page.locator('.plan-tools [data-filter="held"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S02')
  await page.locator('.meta-epic').click()
  await expect(page.locator('.track-tools [data-filter="all"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(card(page, 'EP-001').locator('.card-body')).toBeVisible()
  await expect(card(page, 'EP-001')).toBeFocused()
})

test('the tabs move with the arrow keys, and the progress view keeps its scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 420 })
  await tab(page, 'Revue').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(tab(page, 'Suivi')).toBeFocused()
  await expect(tab(page, 'Suivi')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.track')).toBeVisible()
  const track = page.locator('.track')
  await track.evaluate((node) => { node.scrollTop = 260 })
  await page.keyboard.press('End')
  await expect(tab(page, 'Revue')).toBeFocused()
  await expect(page.locator('.story')).toBeVisible()
  await page.keyboard.press('j')
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S03')
  await page.keyboard.press('Home')
  await expect(tab(page, 'Suivi')).toHaveAttribute('aria-selected', 'true')
  expect(await track.evaluate((node) => node.scrollTop)).toBe(260)
  await page.keyboard.press('j')
  await expect(trackRow(page, 'EP-001-S03')).toHaveAttribute('aria-current', 'true')
  await expect(tab(page, 'Suivi')).toHaveAttribute('aria-selected', 'true')
})

test('a story the agent focuses opens in the review, from the progress view', async ({ page }) => {
  await tab(page, 'Suivi').click()
  await page.evaluate(async () => {
    const token = document.querySelector('meta[name="canvas-token"]').getAttribute('content')
    await fetch('/api/focus_story', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Canvas-Token': token }, body: JSON.stringify({ id: 'EP-002-S01' }) })
  })
  await expect(tab(page, 'Revue')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.story-meta code')).toHaveText('EP-002-S01')
  await expect(row(page, 'EP-002-S01')).toHaveAttribute('aria-current', 'true')
})

test('a refused story says which INVEST letters and DoR items fail, why, and how to fix them', async ({ page }) => {
  await expect(page.locator('.antipatterns button')).toHaveText(['Persona vague', 'Sans exemples', 'Critère technique'])
  await expect(page.locator('[data-action="review"]')).toHaveCount(0)
  const persona = page.locator('.line-head[data-line="2"]')
  await expect(persona).toHaveAttribute('aria-expanded', 'false')
  await expect(persona.locator('.line-response')).toHaveText('utilisateur')
  await persona.click()
  await expect(persona).toHaveAttribute('aria-expanded', 'true')
  const evidence = page.locator('.line.open .evidence')
  await expect(evidence.locator('.evidence-why')).toHaveText('« utilisateur » ne désigne aucun rôle précis (persona vague).')
  await expect(evidence.locator('.evidence-fix')).toContainText('Remplacer par le rôle du PRD qui en profite.')
  await page.locator('.line-head[data-line="N"]').click()
  await expect(page.locator('.line.open .evidence-why').filter({ hasText: 'critère technique' })).toContainText('« HTTP 403 »')
  await page.locator('.line-head[data-line="3"]').click()
  await expect(page.locator('.line-head[data-line="3"] .line-response')).toHaveText('2 exemples')
  await expect(page.locator('.line.open .evidence-why').filter({ hasText: 'exemples du domaine' })).toHaveText('2 exemples du domaine, il en faut au moins 3 (sans exemples).')
})

test('"see in the sheet" scrolls to the passage a line accuses and lights it', async ({ page }) => {
  await page.locator('.line-head[data-line="3"]').click()
  await page.locator('.line.open [data-action="reveal"]').first().click()
  const examples = page.locator('[data-sheet="examples"]')
  await expect(examples).toHaveClass(/lit/)
  await expect(examples).toBeFocused()
  await expect(examples).toBeInViewport()
})

test('a story held back by the planning review shows the lens findings that hold it', async ({ page }) => {
  await row(page, 'EP-002-S01').click()
  await expect(page.locator('.state')).toContainText('retenue')
  await expect(page.locator('.reasons li')).toHaveText(['DoR item 7: technical notes do not name the licence registry the check calls'])
  await expect(page.locator('.line-head[data-line="7"] .line-response')).toHaveClass(/line-response/)
  await expect(page.locator('.line.s-fail .line-head[data-line="7"]')).toHaveCount(1)
  await expect(page.locator('.line.s-fail .line-head[data-line="T"]')).toHaveCount(1)
  await page.locator('.line-head[data-line="7"]').click()
  await expect(page.locator('.line.open .evidence-source')).toHaveText('grille planning-dor · G7 · bloquante')
  await expect(page.locator('.line.open .evidence-fix')).toContainText('Name the registry and its answer time.')
  await expect(page.locator('.lenses .finding')).toHaveCount(3)
  await expect(page.locator('.lenses .finding.unplaced .evidence-why')).toHaveText('The upload limit is unstated')
})

test('creation needs a review of every story it carries and a dry run, then creates the issues', async ({ page }) => {
  const create = page.locator('[data-action="create"]')
  await expect(create).toBeDisabled()
  await expect(page.locator('[data-action="preview"]')).toBeDisabled()
  await row(page, 'EP-001-S03').click()
  await page.locator('[data-action="review"][data-reviewed="true"]').click()
  await expect(row(page, 'EP-001-S03').locator('.m-reviewed')).toBeVisible()
  await expect(page.locator('.bar-count strong')).toHaveText('1/2 prêtes relues')
  await page.locator('[data-action="preview"]').click()
  await expect(page.locator('.missing li')).toHaveText('EP-001-S01 pas relue · requise par EP-001-S03')
  await expect(create).toBeDisabled()
  await page.locator('.missing [data-story="EP-001-S01"]').click()
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S01')
  await page.locator('[data-action="review"][data-reviewed="true"]').click()
  await expect(page.locator('.bar-count strong')).toHaveText('2/2 prêtes relues')
  await expect(page.locator('.preview')).toHaveCount(0)
  await page.locator('[data-action="preview"]').click()
  await expect(page.locator('.operations .op-status')).toHaveCount(6)
  await expect(page.locator('.op-story .op-line .op-status')).toHaveText(['à créer', 'à créer'])
  await expect(page.locator('.op-link')).toHaveText([/sous-issue de EP-001\s*à lier/, /sous-issue de EP-001\s*à lier/, /bloquée par EP-001-S01\s*à lier/])
  await expect(create).toBeEnabled()
  await expect(create).toHaveText('Créer 3 issues')
  await create.click()
  await expect(row(page, 'EP-001-S01').locator('.m-published')).toHaveText('#102')
  await expect(row(page, 'EP-001-S03').locator('.m-published')).toHaveText('#103')
  await expect(page.locator('.story-dock .issue-link')).toHaveAttribute('href', 'https://github.com/acme/permis/issues/102')
  await expect(page.locator('.signoff .issue-link')).toHaveText('#102')
  await expect(page.locator('.result .op-created')).toHaveCount(3)
  await expect(page.locator('.result .op-linked')).toHaveCount(3)
  const published = JSON.parse(await readFile(join(backlogDir(), 'published.json'), 'utf8'))
  expect(Object.keys(published.stories)).toEqual(['EP-001-S01', 'EP-001-S03'])
})

test('the launch bar names the stories the reviewed ones still wait on', async ({ page }) => {
  await expect(page.locator('.waiting')).toHaveCount(0)
  await row(page, 'EP-001-S03').click()
  await page.locator('[data-action="review"][data-reviewed="true"]').click()
  await expect(page.locator('.waiting')).toHaveText(/1 dépendance en attente\s*EP-001-S01/)
  await page.locator('.waiting [data-story="EP-001-S01"]').click()
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S01')
  await page.locator('[data-action="review"][data-reviewed="true"]').click()
  await expect(page.locator('.waiting')).toHaveCount(0)
})

test('the lit passage is the item the evidence names, and it stays lit until another line opens', async ({ page }) => {
  await page.locator('.line-head[data-line="N"]').click()
  await page.locator('.line.open [data-action="reveal"][data-item="AC-02"]').click()
  const criterion = page.locator('.criterion[data-item="AC-02"]')
  await expect(criterion).toHaveClass(/lit/)
  await expect(criterion).toBeInViewport()
  await expect(page.locator('.lit')).toHaveCount(1)
  await page.waitForTimeout(2000)
  await expect(criterion).toHaveClass(/lit/)
  await page.locator('.line-head[data-line="2"]').click()
  await expect(page.locator('.lit')).toHaveCount(0)
})

test('the tick index and the antipatterns open the line they stand for', async ({ page }) => {
  await page.locator('.antipatterns button', { hasText: 'Persona vague' }).click()
  await expect(page.locator('.line-head[data-line="2"]')).toHaveAttribute('aria-expanded', 'true')
  await row(page, 'EP-002-S01').click()
  await page.locator('.tick-index [data-line="7"]').click()
  await expect(page.locator('.line-head[data-line="7"]')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.tick-index .tick.s-fail')).toHaveCount(2)
})

test('the checklist closes on the human review, signed from the dock that stays in sight', async ({ page }) => {
  await expect(page.locator('.signoff .signoff-answer')).toHaveText('pas prête, rien à relire')
  await expect(page.locator('.story-dock button', { hasText: 'Marquer relue' })).toBeDisabled()
  await row(page, 'EP-001-S01').click()
  await expect(page.locator('.signoff .line')).toHaveClass(/s-pending/)
  await page.locator('#story').evaluate((story) => story.scrollTo({ top: story.scrollHeight }))
  await expect(page.locator('.sheet')).toBeInViewport()
  const sign = page.locator('.story-dock [data-action="review"]')
  await expect(sign).toBeInViewport()
  await sign.click()
  await expect(page.locator('.signoff .line')).toHaveClass(/s-pass/)
  await expect(page.locator('.signoff .signoff-answer')).toContainText('relue le 20')
  await expect(page.locator('.story-dock [data-action="review"]')).toHaveText('Retirer la relecture')
})

test('a progress row with open questions opens the review on them, ready to answer', async ({ page }) => {
  await tab(page, 'Suivi').click()
  await expect(page.locator('.track-item .row-ask')).toHaveCount(1)
  const ask = page.locator('.row-ask[data-story="EP-002-S01"]')
  await expect(ask).toHaveText('2')
  await expect(ask).toHaveAttribute('aria-label', '2 questions ouvertes sur EP-002-S01')
  await ask.click()
  await expect(tab(page, 'Revue')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.story-meta code')).toHaveText('EP-002-S01')
  const first = page.locator('.question[data-item="Q1"] textarea')
  await expect(first).toBeFocused()
  await expect(first).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight), 'the panel itself never scrolls').toBe(0)
  await expect(page.locator('.story-dock')).toBeInViewport()
})

test('the question button lands on the first question nobody answered, past those the file settles', async ({ page }) => {
  const path = join(backlogDir(), 'stories', 'EP-002-S01.json')
  const file = JSON.parse(await readFile(path, 'utf8'))
  file.openQuestions[0].answer = 'Le Système national des permis de conduire'
  await writeFile(path, JSON.stringify(file, null, 2))
  await tab(page, 'Suivi').click()
  const ask = page.locator('.row-ask[data-story="EP-002-S01"]')
  await expect(ask).toHaveText('1')
  await ask.click()
  await expect(page.locator('.question[data-item="Q1"]')).toHaveClass(/q-resolved/)
  await expect(page.locator('.question[data-item="Q1"] textarea')).toHaveCount(0)
  await expect(page.locator('.question[data-item="Q2"]')).toHaveClass(/lit/)
  await expect(page.locator('.question[data-item="Q2"] textarea')).toBeFocused()
})

test('an open question is answered in one click on a proposed answer, or in words, as a draft', async ({ page }) => {
  await row(page, 'EP-002-S01').click()
  await expect(page.locator('.dock-ask')).toContainText('Répondre')
  await expect(page.locator('.dock-ask .count')).toHaveText('2')
  const q1 = page.locator('.question[data-item="Q1"]')
  const q2 = page.locator('.question[data-item="Q2"]')
  await expect(q1.locator('.q-why')).toHaveText('La note technique doit nommer le registre et son délai de réponse.')
  await expect(q2.locator('.option')).toHaveCount(0)
  await q2.locator('[data-action="save-answer"]').click()
  await expect(page.locator('#toast')).toHaveText('Écrivez une réponse ou choisissez une réponse proposée.')
  const option = q1.locator('.option', { hasText: 'Système national' })
  await option.click()
  await expect(q1.locator('.q-status')).toHaveText('réponse en brouillon')
  await expect(option).toHaveAttribute('aria-pressed', 'true')
  await expect(q1.locator('textarea')).toHaveValue('Le Système national des permis de conduire')
  await q2.locator('textarea').fill('10 Mo')
  await q2.locator('textarea').press('Control+Enter')
  await expect(q2.locator('.q-status')).toHaveText('réponse en brouillon')
  const answers = JSON.parse(await readFile(join(backlogDir(), 'answers.json'), 'utf8'))
  expect(Object.fromEntries(Object.entries(answers.stories['EP-002-S01']).map(([q, a]) => [q, a.text])))
    .toEqual({ Q1: 'Le Système national des permis de conduire', Q2: '10 Mo' })
  await expect(page.locator('.dock-ask')).toContainText('Brouillons')
  await expect(page.locator('.bar .drafts')).toContainText('2 réponses en brouillon, à intégrer avec corrections: true')
  await q2.locator('[data-action="withdraw-answer"]').click()
  await expect(q2.locator('.q-status')).toHaveText('ouverte')
  await expect(q2.locator('textarea')).toHaveValue('')
  await expect(page.locator('#toast')).toHaveText('Réponse retirée')
})

test('the bar counts the open questions and filters the plan on the stories that ask them', async ({ page }) => {
  await expect(page.locator('.asking .q-open')).toHaveText('2 questions ouvertes')
  await page.locator('.asking .q-open').click()
  await expect(page.locator('.filter[data-filter="questions"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.row .row-id')).toHaveText(['EP-002-S01'])
})

test('a review goes stale when the story file changes after it, and blocks the creation', async ({ page }) => {
  await row(page, 'EP-001-S01').click()
  await page.locator('[data-action="review"][data-reviewed="true"]').click()
  await expect(page.locator('.review')).toContainText('relue')
  const path = join(backlogDir(), 'stories', 'EP-001-S01.json')
  const file = JSON.parse(await readFile(path, 'utf8'))
  file.description = `${file.description} Modifiée après relecture.`
  await writeFile(path, JSON.stringify(file, null, 2))
  await expect(page.locator('.review')).toContainText('fiche modifiée depuis la relecture')
  await expect(row(page, 'EP-001-S01').locator('.m-stale')).toBeVisible()
  await expect(page.locator('.bar-count strong')).toHaveText('0/2 prêtes relues')
})

test('a panel cut off from its server tries again less and less often, then says so and reloads from the server on retry', async ({ page }) => {
  await page.clock.install()
  // the panel's time moves only when the test says so
  await page.clock.pauseAt(Date.now() + 1000)
  // the waits the panel schedules and the connections it opens, seen as they happen, so that the
  // clock moves only once the panel has scheduled its next attempt
  await page.evaluate(() => {
    const schedule = window.setTimeout
    const Source = window.EventSource
    Object.assign(window, { waits: [], attempts: 0 })
    window.setTimeout = (callback, ms, ...args) => { window.waits.push(ms); return schedule(callback, ms, ...args) }
    window.EventSource = class extends Source {
      constructor(...args) { super(...args); window.attempts += 1 }
    }
  })
  const waits = () => page.evaluate(() => window.waits)
  const attempts = () => page.evaluate(() => window.attempts)
  const offline = page.locator('#offline')

  fixture.stop()
  const series = [1500, 3000, 6000, 12000, 24000]
  for (const [index, wait] of series.entries()) {
    await expect.poll(waits).toEqual(series.slice(0, index + 1))
    await expect(offline).toBeHidden()
    await page.clock.runFor(wait - 1)
    expect(await attempts(), `no attempt before ${wait} ms`).toBe(index)
    await page.clock.runFor(1)
    expect(await attempts(), `one attempt after ${wait} ms`).toBe(index + 1)
  }
  await expect(offline).toBeVisible()
  await expect(offline).toContainText('Le canvas n’est plus joignable.')
  await page.clock.runFor(10 * 60_000)
  expect(await waits(), 'no wait scheduled once given up').toEqual(series)
  expect(await attempts(), 'no attempt once given up').toBe(series.length)

  // a server started again carries a new token: only the page it serves can talk to it
  const token = () => page.locator('meta[name="canvas-token"]').getAttribute('content')
  const before = await token()
  fixture = await startFixture(['--port', new URL(fixture.url).port])
  await offline.getByRole('button', { name: 'Réessayer' }).click()
  await expect.poll(token).not.toBe(before)
  await expect(offline).toBeHidden()
  await expect(page.locator('.card').first()).toBeVisible()
  // each refused attempt is a network error of the browser's own
  page.errors.length = 0
})

test('the keyboard moves through the plan and toggles the review of a ready story', async ({ page }) => {
  await page.locator('.story').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('k')
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S01')
  await page.keyboard.press('r')
  await expect(row(page, 'EP-001-S01').locator('.m-reviewed')).toBeVisible()
  await page.keyboard.press('r')
  await expect(row(page, 'EP-001-S01').locator('.m-reviewed')).toHaveCount(0)
  await page.keyboard.press('j')
  await page.keyboard.press('j')
  await expect(page.locator('.story-meta code')).toHaveText('EP-001-S03')
})

test('filters and search narrow the plan', async ({ page }) => {
  await page.locator('[data-filter="held"]').click()
  await expect(page.locator('[data-filter="held"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.row')).toHaveCount(1)
  await page.locator('[data-filter="all"]').click()
  await page.locator('[data-action="search"]').fill('30 jours')
  await expect(page.locator('.row')).toHaveCount(1)
  await expect(page.locator('.row .row-id')).toHaveText('EP-001-S03')
  await expect(page.locator('[data-action="search"]')).toBeFocused()
})

test('the panel speaks the language of the PRD', async ({ page }) => {
  const path = join(backlogDir(), 'inventory.json')
  const inventory = JSON.parse(await readFile(path, 'utf8'))
  await writeFile(path, JSON.stringify({ ...inventory, language: 'en' }))
  await expect(page.locator('#h-dor')).toHaveText('Definition of Ready')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.locator('.line-head[data-line="2"]').click()
  await expect(page.locator('.line.open .evidence-why')).toHaveText('"utilisateur" names no specific role (Vague Persona).')
})

test.describe('medium panel', () => {
  test.use({ viewport: { width: 760, height: 844 } })

  test('the plan stays beside the story with its epics and ticks, and the checklist lines stack', async ({ page }) => {
    await expect(page.locator('.plan-toggle')).toBeHidden()
    await expect(page.locator('.plan')).toBeVisible()
    await expect(page.locator('.epic-head')).toHaveCount(2)
    await expect(row(page, 'EP-001-S02').locator('.ticks')).toBeVisible()
    await expect(page.locator('.board')).toBeVisible()
    await expect(page.locator('.leader').first()).toBeHidden()
    await expect(page.locator('.line-head[data-line="2"] .line-response')).toBeVisible()
    expect(await page.locator('.story').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe('narrow panel', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the plan becomes a drawer and nothing overflows sideways', async ({ page }) => {
    const toggle = page.locator('.plan-toggle')
    await expect(toggle).toContainText('EP-001-S02')
    await expect(toggle.locator('.toggle-pos')).toHaveText('2/4')
    await expect(toggle.locator('.toggle-story')).toHaveClass(/v-fail/)
    await expect(page.locator('.plan')).toBeHidden()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.plan')).toBeVisible()
    await row(page, 'EP-001-S01').click()
    await expect(page.locator('.plan')).toBeHidden()
    await expect(page.locator('.story-meta code')).toHaveText('EP-001-S01')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('the progress view stacks each story row and nothing overflows sideways', async ({ page }) => {
    await tab(page, 'Suivi').click()
    await expect(page.locator('.plan-toggle')).toBeHidden()
    await expect(trackRow(page, 'EP-001-S02').locator('.ticks')).toBeVisible()
    const fits = (selector) => page.locator(selector).evaluate((node) => node.scrollWidth <= node.clientWidth)
    expect(await fits('.track')).toBe(true)
    expect(await fits('.top')).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const [title, row] = await Promise.all([trackRow(page, 'EP-001-S02').locator('.track-title').boundingBox(), trackRow(page, 'EP-001-S02').boundingBox()])
    expect(title.width).toBeGreaterThan(row.width * 0.75)
  })
})

test.describe('empty workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('about:blank')
    await fixture.stop()
    fixture = await startFixture(['--empty'])
    await page.goto(fixture.url)
  })

  test('says how to get a backlog', async ({ page }) => {
    await expect(page.locator('#empty')).toHaveText('No backlog in this workspace. Run the skraft-prd-backlog workflow.')
    await expect(page.locator('.plan')).toBeHidden()
  })
})

test('without a host theme the palette follows changes to the browser media preference', async ({ page }) => {
  const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const night = 'rgb(15, 23, 34)'
  const day = 'rgb(246, 248, 251)'
  await expect.poll(ground).toBe(night)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(ground).toBe(day)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(ground).toBe(night)
})

// These exercise the documented CSS inputs, not their delivery by a real host.
// The live Copilot observation and the VS Code 1.142 transport limits are in README.md.
for (const target of ['html', 'body']) {
  test(`theme attributes on ${target} override media, update live, and release back to media`, async ({ page }) => {
    const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const night = 'rgb(15, 23, 34)'
    const day = 'rgb(246, 248, 251)'
    const theme = async (attributes) => page.locator(target).evaluate((element, attributes) => {
      for (const name of ['data-color-mode', 'data-theme-tone']) {
        if (attributes[name]) element.setAttribute(name, attributes[name])
        else element.removeAttribute(name)
      }
    }, attributes)

    await page.emulateMedia({ colorScheme: 'light' })
    await theme({ 'data-color-mode': 'dark' })
    await expect.poll(ground).toBe(night)
    await theme({ 'data-color-mode': 'dark', 'data-theme-tone': 'light' })
    await expect.poll(ground).toBe(day)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(ground).toBe(day)
    await theme({ 'data-color-mode': 'light', 'data-theme-tone': 'dark' })
    await expect.poll(ground).toBe(night)
    await theme({ 'data-color-mode': 'light' })
    await expect.poll(ground).toBe(day)
    await theme({ 'data-color-mode': 'auto', 'data-theme-tone': 'unknown' })
    await expect.poll(ground).toBe(night)
    await theme({})
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(ground).toBe(day)
  })
}
