// The backlog canvas in a real browser, over the fixture workspace and a fake `gh`. Each test starts
// its own server on a fresh workspace, so a review or a creation never leaks into the next test.
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const SERVE = fileURLToPath(new URL('./serve-fixture.mjs', import.meta.url))

/** @param {string[]} [args] @returns {Promise<{ url: string, cwd: string, stop: () => void }>} */
const startFixture = (args = []) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [SERVE, ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
  let out = ''
  child.stdout.on('data', (chunk) => {
    out += chunk
    const [url, cwd] = out.split('\n')
    if (cwd) resolve({ url, cwd, stop: () => child.kill('SIGTERM') })
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
  await expect(page.locator('.story-head')).toBeVisible()
})
test.afterEach(async ({ page }) => {
  expect(page.errors, 'the panel logs no error').toEqual([])
  fixture.stop()
})

const backlogDir = () => join(fixture.cwd, '.copilot-tracking', 'skraft-plans', 'eligibilite-prd', 'backlog')
const row = (page, id) => page.locator(`.row[data-story="${id}"]`)

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
  await expect(page.locator('.finding')).toHaveCount(3)
  await expect(page.locator('.finding.unplaced .evidence-why')).toHaveText('The upload limit is unstated')
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
  await expect(page.locator('.issue-link')).toHaveAttribute('href', 'https://github.com/acme/permis/issues/102')
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

test('the checklist closes on the human review: a ready story is signed off there', async ({ page }) => {
  await expect(page.locator('.signoff .signoff-answer')).toHaveText('pas prête, rien à relire')
  await row(page, 'EP-001-S01').click()
  await expect(page.locator('.signoff .line')).toHaveClass(/s-pending/)
  await page.locator('.signoff [data-action="review"]').click()
  await expect(page.locator('.signoff .line')).toHaveClass(/s-pass/)
  await expect(page.locator('.signoff .signoff-answer')).toContainText('relue le 20')
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

test.describe('narrow panel', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the plan becomes a drawer and nothing overflows sideways', async ({ page }) => {
    const toggle = page.locator('.plan-toggle')
    await expect(toggle).toContainText('EP-001-S02')
    await expect(page.locator('.plan')).toBeHidden()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.plan')).toBeVisible()
    await row(page, 'EP-001-S01').click()
    await expect(page.locator('.plan')).toBeHidden()
    await expect(page.locator('.story-meta code')).toHaveText('EP-001-S01')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe('empty workspace', () => {
  test.beforeEach(async ({ page }) => {
    fixture.stop()
    fixture = await startFixture(['--empty'])
    await page.goto(fixture.url)
  })

  test('says how to get a backlog', async ({ page }) => {
    await expect(page.locator('#empty')).toHaveText('No backlog in this workspace. Run the skraft-prd-backlog workflow.')
    await expect(page.locator('.plan')).toBeHidden()
  })
})
