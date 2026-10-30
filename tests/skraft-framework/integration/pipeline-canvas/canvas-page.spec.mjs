// The skraft-pipeline canvas page in a real browser, over a scripted run paused on its ADR. Each
// test opens its own panel; none saves anything. Run with
// `npx playwright test -c playwright.pipeline-canvas.config.mjs`.
import { expect, test } from '@playwright/test'
import { openPanel, pausedRun, scope } from './page-fixture.mjs'

const state = { scope: null, run: null, panel: null, errors: [] }

test.beforeAll(async () => {
  test.setTimeout(180_000)
  state.scope = scope()
  state.run = await pausedRun(state.scope.t)
})
test.afterAll(() => state.scope.close())

/** Opens a panel and its page; `cwd` null opens the panel on a session with no directory yet. */
const open = async (page, { cwd = state.run.cwd, tab } = {}) => {
  const where = { cwd }
  state.panel = await openPanel({ where, home: state.run.home, tab })
  state.errors = []
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.goto(state.panel.url)
  await expect(page.locator('.app[data-state="ready"]')).toBeVisible()
  return where
}

test.afterEach(async () => {
  await state.panel?.close()
  expect(state.errors, 'the page raises no error').toEqual([])
})

test('the page draws a paused run: three tabs, the run waiting, the ADR question', async ({ page }) => {
  await open(page)

  await expect(page.getByRole('tab')).toHaveText(['Run', 'Configuration', 'Workflow'])
  await expect(page.locator('.run-status')).toHaveText('waiting')
  await expect(page.locator('.callout code')).toHaveText('adr-1')
})

const WORDS = {
  en: { phases: ['closed', 'under way', 'to come', 'to come', 'to come'], steps: ['done:', 'done:', 'under way:'] },
  fr: { phases: ['close', 'en cours', 'à venir', 'à venir', 'à venir'], steps: ['faite:', 'faite:', 'en cours:'] },
}

const saysEachState = ({ phases, steps }) => async ({ page }) => {
  await open(page)

  await expect(page.locator('.phase-head .state-word')).toHaveText(phases)
  await expect(page.locator('.phase.p-open .step-line .sr-only')).toHaveText(steps)
  for (const icon of await page.locator('.phase-head .icon').all()) await expect(icon).toHaveAttribute('aria-hidden', 'true')
}

test('each phase says its state in a word, each step in a hidden one, in English', saysEachState(WORDS.en))

test.describe('in French', () => {
  test.use({ locale: 'fr-FR' })

  test('each phase says its state in a word, each step in a hidden one', saysEachState(WORDS.fr))
})
