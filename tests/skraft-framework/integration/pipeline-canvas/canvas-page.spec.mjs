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
const open = async (page, { cwd = state.run.cwd, tab, clock = false } = {}) => {
  const where = { cwd }
  state.panel = await openPanel({ where, home: state.run.home, tab })
  state.errors = []
  page.on('pageerror', (error) => state.errors.push(error.message))
  if (clock) await page.clock.install()
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

test('a live region announces the run status, then a question that comes to wait', async ({ page }) => {
  const where = await open(page, { cwd: null })
  const announcer = page.locator('#announcer')

  await expect(announcer).toHaveAttribute('role', 'status')
  await expect(announcer).toHaveAttribute('aria-live', 'polite')
  await expect(announcer).toHaveText('Run status: no directory.')

  where.cwd = state.run.cwd
  await expect(announcer).toHaveText('Run status: waiting. The run waits for your answer to adr-1 (ADR): answer it in the Copilot chat.')
})

const NO_DIRECTORY_FR = 'La session Copilot n’a pas encore de dossier de travail.'

test.describe('in French (the driver\'s sentences)', () => {
  test.use({ locale: 'fr-FR' })

  test('the skip link and the sentences the driver fixes are read in French', async ({ page }) => {
    await open(page, { cwd: null })

    await expect(page.locator('.skip')).toHaveText('Aller au contenu')
    await expect(page.locator('.reason')).toHaveText(NO_DIRECTORY_FR)
    await page.getByRole('tab', { name: 'Configuration' }).click()
    await expect(page.locator('.notice.n-fail')).toHaveText(NO_DIRECTORY_FR)
  })

  test('where to answer the question is read in French, the engine\'s question as it wrote it', async ({ page }) => {
    await open(page)

    await expect(page.locator('.callout-how')).toHaveText('Répondez-y dans le chat Copilot, où Copilot vous la pose ; ou tapez skraft decide adr-1 RATIFIED|REJECTED dans un terminal.')
    await expect(page.locator('.callout-text')).toContainText('Ratify the Proposed ADRs')
  })
})

test('where to answer the question is read in English', async ({ page }) => {
  await open(page)

  await expect(page.locator('.skip')).toHaveText('Skip to content')
  await expect(page.locator('.callout-how')).toHaveText('Answer it in the Copilot chat, where Copilot puts it to you; or type skraft decide adr-1 RATIFIED|REJECTED in a terminal.')
})

test('the consent choices are one tab stop and move with the arrow keys, Home and End, the choice following the focus', async ({ page }) => {
  await open(page, { tab: 'configuration' })
  const group = page.getByRole('radiogroup', { name: 'Push the branch, open its pull request and keep a comment on the issue' })
  const radio = (name) => group.getByRole('radio', { name, exact: true })

  await expect(radio('No')).toHaveAttribute('aria-checked', 'true')
  await expect(group.getByRole('radio')).toHaveCount(3)
  await expect(radio('No')).toHaveAttribute('tabindex', '0')
  await expect(radio('Yes')).toHaveAttribute('tabindex', '-1')
  await expect(radio('Ask at the run')).toHaveAttribute('tabindex', '-1')

  await radio('No').focus()
  for (const [key, name] of [['ArrowLeft', 'Yes'], ['ArrowUp', 'Ask at the run'], ['ArrowLeft', 'No'], ['Home', 'Ask at the run'], ['End', 'No'], ['ArrowDown', 'Ask at the run'], ['ArrowRight', 'Yes']]) {
    await page.keyboard.press(key)
    await expect(radio(name), `${key} chooses ${name}`).toHaveAttribute('aria-checked', 'true')
    await expect(radio(name), `${key} focuses ${name}`).toBeFocused()
    await expect(radio(name)).toHaveAttribute('tabindex', '0')
  }
  await expect(page.locator('.bar-state')).toHaveText('Unsaved changes')
})

/** The panel's server goes away, and the page's five attempts to reach it again pass on a clock we run. */
const losesItsServer = async (page) => {
  await open(page, { clock: true })
  await state.panel.close()
  state.panel = null
  await expect.poll(async () => {
    await page.clock.runFor(30_000)
    return page.locator('#offline').isVisible()
  }, { timeout: 20_000 }).toBe(true)
}

test('a page that lost its server says to close the canvas and open it again, and offers no reload', async ({ page }) => {
  await losesItsServer(page)

  await expect(page.locator('#offline')).toHaveText('The panel lost its connection to skraft. Close this canvas and open it again from Copilot.')
  await expect(page.locator('#offline button')).toHaveCount(0)
})

test.describe('in French (offline)', () => {
  test.use({ locale: 'fr-FR' })

  test('a page that lost its server says so in French', async ({ page }) => {
    await losesItsServer(page)

    await expect(page.locator('#offline')).toHaveText('Le panneau a perdu sa connexion à skraft. Fermez ce canvas puis rouvrez-le depuis Copilot.')
    await expect(page.locator('#offline button')).toHaveCount(0)
  })
})

test.describe('in French (live region)', () => {
  test.use({ locale: 'fr-FR' })

  test('the live region speaks French', async ({ page }) => {
    await open(page)

    await expect(page.locator('#announcer')).toHaveText('État du run : en attente. Le run attend votre réponse à adr-1 (ADR) : répondez dans le chat Copilot.')
  })
})
