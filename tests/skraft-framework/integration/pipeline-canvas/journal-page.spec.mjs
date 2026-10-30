// The Journal tab of the skraft-pipeline canvas page over a run whose ADR a person rejected with a
// reason that carries markup, then over a journal edited by hand. Each test opens its own panel;
// none writes anything but the edit it undoes. Run with
// `npx playwright test -c playwright.pipeline-canvas.config.mjs`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { decidedRun, journalFile, openPanel, scope } from './page-fixture.mjs'

const REASON = '<img src=x onerror="document.body.dataset.xss=1"> name the provider'
const state = { scope: null, run: null, panel: null, errors: [] }

test.beforeAll(async () => {
  test.setTimeout(180_000)
  state.scope = scope()
  state.run = await decidedRun(state.scope.t, REASON)
})
test.afterAll(() => state.scope.close())

/** Opens a panel and its page over the run. */
const open = async (page) => {
  state.panel = await openPanel({ where: { cwd: state.run.cwd }, home: state.run.home })
  state.errors = []
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.goto(state.panel.url)
  await expect(page.locator('.app[data-state="ready"]')).toBeVisible()
}

test.afterEach(async () => {
  await state.panel?.close()
  expect(state.errors, 'the page raises no error').toEqual([])
})

test('a human decision shows its question, answer and reason as typed, and who gave it; markup in the reason is shown as text, never run; once answered, no We need you button', async ({ page }) => {
  await open(page)

  await page.getByRole('tab', { name: 'Journal' }).click()

  await expect(page.locator('.j-decision .j-id')).toHaveText('adr-1')
  await expect(page.locator('.j-decision .j-answer')).toHaveText('REJECTED')
  await expect(page.locator('.j-decision .j-reason')).toHaveText(REASON)
  await expect(page.locator('.j-decision .j-by')).toHaveText('by decide')
  await expect(page.locator('#panel img')).toHaveCount(0)
  expect(await page.evaluate(() => document.body.dataset.xss)).toBeUndefined()
  await expect(page.locator('.needs-you')).toHaveCount(0)
})

test('a journal edited by hand says its chain is broken and where, and shows no entry', async ({ page }) => {
  const file = journalFile(state.run.cwd)
  const original = readFileSync(file, 'utf8')
  try {
    writeFileSync(file, original.replace('"prev":null', '"prev":"0"'))
    await open(page)

    await page.getByRole('tab', { name: 'Journal' }).click()

    await expect(page.locator('.chain-word')).toHaveText('broken')
    await expect(page.locator('.chain-detail')).toHaveText('journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug')
    await expect(page.locator('.j-row')).toHaveCount(0)
    await expect(page.locator('.run-status')).toHaveText('journal changed')
  } finally {
    writeFileSync(file, original)
  }
})

// Review captures, on demand: SKRAFT_CANVAS_SHOTS=<folder> npx playwright test -c playwright.pipeline-canvas.config.mjs -g captures
test.describe('captures', () => {
  test.skip(!process.env.SKRAFT_CANVAS_SHOTS, 'set SKRAFT_CANVAS_SHOTS to a folder to write the review captures')

  for (const [locale, lang] of [['fr-FR', 'fr'], ['en-US', 'en']]) {
    test(`the journal of a decided run, ${lang}, dark`, async ({ browser }) => {
      const folder = /** @type {string} */ (process.env.SKRAFT_CANVAS_SHOTS)
      mkdirSync(folder, { recursive: true })
      const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1280, height: 860 } })
      const page = await context.newPage()
      await open(page)
      await page.getByRole('tab', { name: 'Journal' }).click()
      await expect(page.locator('.chain-word')).toBeVisible()
      await page.screenshot({ path: join(folder, `journal-decision-${lang}-dark.png`), fullPage: true })
      await context.close()
    })
  }
})
