// The models field of the Configuration tab of the skraft-pipeline canvas page: what the page says
// a list of models is, and what it does with a name the engine would refuse. A save writes the
// working copy's skraft-config.local.json, so this file has a run of its own and starts each test
// without that file. Run with `npx playwright test -c playwright.pipeline-canvas.config.mjs`.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { configurationRun, openPanel, scope } from './page-fixture.mjs'

const state = { scope: null, run: null, panel: null, errors: [] }

test.beforeAll(async () => {
  test.setTimeout(180_000)
  state.scope = scope()
  state.run = await configurationRun(state.scope.t)
})
test.afterAll(() => state.scope.close())

const localFile = () => join(state.run.cwd, 'skraft-config.local.json')

test.beforeEach(() => rmSync(localFile(), { force: true }))

test.afterEach(async () => {
  await state.panel?.close()
  expect(state.errors, 'the page raises no error').toEqual([])
})

/** Opens a panel and its page over the run, on the Configuration tab; `writes` collects each request that is not a GET. */
const open = async (page, writes = []) => {
  state.panel = await openPanel({ where: { cwd: state.run.cwd }, home: state.run.home, tab: 'configuration' })
  state.errors = []
  page.on('pageerror', (error) => state.errors.push(error.message))
  page.on('request', (request) => request.method() !== 'GET' && writes.push(`${request.method()} ${new URL(request.url()).pathname}`))
  await page.goto(state.panel.url)
  await expect(page.locator('.app[data-state="ready"]')).toBeVisible()
}

/** The models field of a family on a host. */
const field = (page, family = 'standard', host = 'copilot') => page.locator(`input[data-field="models.${family}.${host}.model"]`)
const saveButton = (page) => page.locator('[data-action="save"]')
const discardButton = (page) => page.locator('[data-action="discard"]')

const WORDS = {
  en: {
    label: 'Models, tried in order',
    placeholder: 'team / default',
    help: 'Model names, separated by commas: the host tries the first, then the next one if it is unavailable. Leave a field empty to keep the team’s choice or the defaults; where there is none, the host decides. For example: model-a, model-b.',
    rule: 'Names separated by commas. A name starts with a letter or a digit and holds only letters, digits, dots, hyphens or underscores, with no space.',
    fix: 'Correct the flagged model names to save.',
    clean: 'Everything is saved',
  },
  fr: {
    label: 'Modèles, essayés dans l’ordre',
    placeholder: 'équipe / défaut',
    help: 'Noms de modèles séparés par des virgules : l’hôte essaie le premier, puis le suivant s’il est indisponible. Laissez un champ vide pour garder le choix de l’équipe ou les valeurs par défaut ; à défaut, l’hôte choisit. Par exemple : model-a, model-b.',
    rule: 'Noms séparés par des virgules. Un nom commence par une lettre ou un chiffre et ne contient que des lettres, des chiffres, des points, des tirets ou des tirets bas, sans espace.',
    fix: 'Corrigez les noms de modèles signalés pour enregistrer.',
    clean: 'Tout est enregistré',
  },
}

/** What a person types that the engine would read as one name, or refuse: spaces, semicolons, empty names. */
const UNREADABLE = ['a;b', 'a b', 'a,,b', 'a,', ',a', '-a', 'a:b']

const saysWhatTheFieldHolds = (words) => async ({ page }) => {
  await open(page)

  await expect(page.locator('th', { hasText: `copilot — ${words.label}` })).toBeVisible()
  await expect(page.locator('#models-help')).toHaveText(words.help)
  await expect(field(page)).toHaveAccessibleName(`standard · copilot · ${words.label}`)
  await expect(field(page)).toHaveAttribute('placeholder', words.placeholder)
  await expect(field(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.field-error')).toHaveCount(0)
}

const flagsAListTheEngineWouldRefuse = (words) => async ({ page }) => {
  await open(page)

  for (const typed of UNREADABLE) {
    await field(page).fill(typed)

    await expect(field(page), typed).toHaveAttribute('aria-invalid', 'true')
    await expect(field(page), typed).toHaveAccessibleDescription(words.rule)
    await expect(page.locator('.field-error'), typed).toHaveText(words.rule)
    await expect(page.locator('.bar-state .error'), typed).toHaveText(words.fix)
    await expect(saveButton(page), typed).toBeDisabled()
  }
}

const savesAListOfNamesSeparatedByCommas = (words) => async ({ page }) => {
  await open(page)

  await field(page).fill(' model-a , model-b ')

  await expect(field(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.field-error')).toHaveCount(0)
  await expect(page.locator('.bar-state .error')).toHaveCount(0)
  await expect(saveButton(page)).toBeEnabled()

  await saveButton(page).click()

  await expect(page.locator('.bar-state')).toContainText(words.clean)
  expect(JSON.parse(readFileSync(localFile(), 'utf8')).models.standard.copilot.model).toEqual(['model-a', 'model-b'])
}

test('the models field says it is a list of names tried in order, separated by commas, and what an empty field does', saysWhatTheFieldHolds(WORDS.en))
test('a list the engine would refuse is flagged on its field with the rule, and cannot be saved', flagsAListTheEngineWouldRefuse(WORDS.en))
test('a list of names separated by commas, with spaces around the commas, is saved as the names in their order', savesAListOfNamesSeparatedByCommas(WORDS.en))

test('emptying a flagged field takes the flag back: an empty field leaves the choice to the host', async ({ page }) => {
  await open(page)
  await field(page).fill('a b')
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true')

  await field(page).fill('')

  await expect(field(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.field-error')).toHaveCount(0)
  await expect(page.locator('.bar-state')).toContainText(WORDS.en.clean)
  await expect(page.locator('.bar-state .error')).toHaveCount(0)
})

test('the save stays closed until every flagged field is corrected, whatever its family and host', async ({ page }) => {
  await open(page)
  await field(page).fill('a b')
  await field(page, 'frontier', 'claude-code').fill('c;d')
  await expect(page.locator('.field-error')).toHaveCount(2)

  await field(page).fill('a')

  await expect(page.locator('.field-error')).toHaveCount(1)
  await expect(field(page, 'frontier', 'claude-code')).toHaveAttribute('aria-invalid', 'true')
  await expect(saveButton(page)).toBeDisabled()

  await field(page, 'frontier', 'claude-code').fill('c')

  await expect(page.locator('.field-error')).toHaveCount(0)
  await expect(saveButton(page)).toBeEnabled()
})

test('the keyboard save sends nothing while a name is flagged', async ({ page }) => {
  const writes = []
  await open(page, writes)
  await field(page).fill('a b')
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true')

  await page.keyboard.press('ControlOrMeta+S')

  await expect(page.locator('.bar-state .error')).toHaveText(WORDS.en.fix)
  expect(writes).toEqual([])
})

test('typing goes on in the field the page flags: focus and caret stay where they were', async ({ page }) => {
  await open(page)
  await field(page).click()

  await page.keyboard.type('a b,c')

  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue('a b,c')
})

test('a model the local file writes as one plain name shows as that name, not as a refused list', async ({ page }) => {
  writeFileSync(localFile(), JSON.stringify({ models: { standard: { copilot: { model: 'model-a' } } } }))
  await open(page)

  await expect(field(page)).toHaveValue('model-a')
  await expect(field(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.bar-state')).toContainText(WORDS.en.clean)
})

test('discarding takes back what was typed in the field, flagged or not', async ({ page }) => {
  await open(page)
  await field(page).fill('a b')
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true')

  await discardButton(page).click()

  await expect(field(page)).toHaveValue('')
  await expect(field(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.field-error')).toHaveCount(0)
  await expect(page.locator('.bar-state')).toContainText(WORDS.en.clean)
  await expect(page.locator('.bar-state .error')).toHaveCount(0)

  await field(page).fill('model-a, model-b')
  await discardButton(page).click()

  await expect(field(page)).toHaveValue('')
  await expect(saveButton(page)).toBeDisabled()
})

test.describe('in French', () => {
  test.use({ locale: 'fr-FR' })

  test('the models field says it is a list of names tried in order, separated by commas, and what an empty field does', saysWhatTheFieldHolds(WORDS.fr))
  test('a list the engine would refuse is flagged on its field with the rule, and cannot be saved', flagsAListTheEngineWouldRefuse(WORDS.fr))
  test('a list of names separated by commas, with spaces around the commas, is saved as the names in their order', savesAListOfNamesSeparatedByCommas(WORDS.fr))
})
