// The Configuration tab and the We need you button of the skraft-pipeline canvas page over a run
// that waits on its configuration question, and over a run that waits on an ADR: what the page says
// before a save and after it. Saving rewrites the working copy's skraft-config.json, so these runs
// are this file's own. Run with `npx playwright test -c playwright.pipeline-canvas.config.mjs`.
import { expect, test } from '@playwright/test'
import { configurationRun, openPanel, pausedRun, scope } from './page-fixture.mjs'

const state = { scope: null, configuration: null, adr: null, panel: null, errors: [] }

test.beforeAll(async () => {
  test.setTimeout(180_000)
  state.scope = scope()
  state.configuration = await configurationRun(state.scope.t)
  state.adr = await pausedRun(state.scope.t)
})
test.afterAll(() => state.scope.close())

/** Opens a panel and its page over `run`, on `tab`. */
const open = async (page, run, tab = 'configuration', pollMs = 100) => {
  state.panel = await openPanel({ where: { cwd: run.cwd }, home: run.home, tab, pollMs })
  state.errors = []
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.goto(state.panel.url)
  await expect(page.locator('.app[data-state="ready"]')).toBeVisible()
}

test.afterEach(async () => {
  await state.panel?.close()
  expect(state.errors, 'the page raises no error').toEqual([])
})

let edits = 0
/** Types a new value, one nobody saved yet, in the first command field. */
const edit = async (page) => {
  await page.locator('.commands input[type="text"]').first().fill(`npm run edit-${++edits}`)
  await expect(page.locator('.bar-state')).toHaveText(/^(Unsaved changes|Modifications non enregistrées)/)
}

const save = (page) => page.locator('[data-action="save"]').click()

const WORDS = {
  en: {
    asked: 'The run waits for your go-ahead on this configuration. Change what you need and save, then answer START or STOP in the Copilot chat: the run reads the configuration again when you answer START.',
    saved: 'Configuration saved. The run still waits for your answer, START or STOP, in the Copilot chat; it reads this configuration when you answer START.',
    savedHint: 'Configuration saved. The run still waits for your answer, START or STOP, in the Copilot chat. Go to the question (n).',
    savedBar: 'The run still waits for your answer, START or STOP, in the Copilot chat.',
    needsYou: 'We need you', needsYouSaved: 'Saved: answer in the chat', clean: 'Everything is saved', dirty: 'Unsaved changes',
  },
  fr: {
    asked: 'Le run attend votre feu vert sur cette configuration. Changez ce qu’il faut et enregistrez, puis répondez START ou STOP dans le chat Copilot : le run relit la configuration quand vous répondez START.',
    saved: 'Configuration enregistrée. Le run attend toujours votre réponse, START ou STOP, dans le chat Copilot ; il lit cette configuration quand vous répondez START.',
    savedHint: 'Configuration enregistrée. Le run attend encore votre réponse, START ou STOP, dans le chat Copilot. Aller à la question (n).',
    savedBar: 'Le run attend toujours votre réponse, START ou STOP, dans le chat Copilot.',
    needsYou: 'On a besoin de vous', needsYouSaved: 'Enregistré : répondez dans le chat', clean: 'Tout est enregistré', dirty: 'Modifications non enregistrées',
  },
}

const asksForTheGoAhead = (words) => async ({ page }) => {
  await open(page, state.configuration)

  await expect(page.locator('#config-state')).toHaveText(words.asked)
  await expect(page.locator('.needs-you')).toContainText(words.needsYou)
  await expect(page.locator('.needs-you code')).toHaveText('configuration-1')
}

const saysItWasSaved = (words) => async ({ page }) => {
  await open(page, state.configuration)
  await edit(page)

  await save(page)

  await expect(page.locator('.bar-state')).toContainText(words.clean)
  await expect(page.locator('.bar-state .note')).toHaveText(words.savedBar)
  await expect(page.locator('#config-state')).toHaveText(words.saved)
  await expect(page.locator('#announcer')).toHaveText(words.saved)
  await expect(page.locator('.needs-you')).toContainText(words.needsYouSaved)
  await expect(page.locator('.needs-you')).toHaveAttribute('title', words.savedHint)
  await expect(page.locator('.needs-you code')).toHaveText('configuration-1')
  await expect(page.locator('.run-status')).toHaveText(/waiting|en attente/)

  await page.locator('.needs-you').click()

  await expect(page.locator('#question')).toBeFocused()
  await expect(page.locator('.callout code')).toHaveText('configuration-1')
  await expect(page.locator('.callout-saved')).toHaveText(words.saved)
  expect(await page.locator('body').innerText()).not.toContain('skraft_decide')
}

const asksAgainOnceEditedAfterTheSave = (words) => async ({ page }) => {
  await open(page, state.configuration, 'configuration', 30_000)
  await edit(page)
  const savedCommand = await page.locator('.commands input[type="text"]').first().inputValue()
  await save(page)
  await expect(page.locator('.needs-you')).toContainText(words.needsYouSaved)

  await edit(page)

  const other = await page.context().newPage()
  await other.goto(state.panel.url)
  await expect(other.locator('.commands input[type="text"]').first()).toHaveValue(savedCommand)
  await other.close()

  await expect(page.locator('.needs-you')).toContainText(words.needsYou)
  await expect(page.locator('.bar-state .note')).toHaveCount(0)
  await expect(page.locator('#config-state')).toHaveText(words.asked)
}

test('a run that waits on its configuration question says on the Configuration tab that it waits for the go-ahead, in the Copilot chat', asksForTheGoAhead(WORDS.en))
test('saving the configuration says it is saved and that the run still waits for the answer in the chat: the bar, the tab, the button, the question and the live region', saysItWasSaved(WORDS.en))
test('an edit made after the save brings back the plain We need you button and the go-ahead sentence', asksAgainOnceEditedAfterTheSave(WORDS.en))

test('a save while the run waits on an ADR leaves the We need you button as it was: the save answers nothing', async ({ page }) => {
  await open(page, state.adr)
  await edit(page)

  await save(page)

  await expect(page.locator('.bar-state')).toContainText(WORDS.en.clean)
  await expect(page.locator('.needs-you')).toContainText(WORDS.en.needsYou)
  await expect(page.locator('.needs-you code')).toHaveText('adr-1')
  await expect(page.locator('.bar-state .note')).toHaveCount(0)
  await expect(page.locator('#config-state')).not.toHaveText(WORDS.en.saved)
})

test.describe('in French', () => {
  test.use({ locale: 'fr-FR' })

  test('a run that waits on its configuration question says on the Configuration tab that it waits for the go-ahead', asksForTheGoAhead(WORDS.fr))
  test('saving the configuration says it is saved and that the run still waits for the answer in the chat', saysItWasSaved(WORDS.fr))
  test('an edit made after the save brings back the plain button and the go-ahead sentence', asksAgainOnceEditedAfterTheSave(WORDS.fr))
})
