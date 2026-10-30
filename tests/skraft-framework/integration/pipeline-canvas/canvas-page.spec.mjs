// The skraft-pipeline canvas page in a real browser, over a scripted run paused on its ADR. Each
// test opens its own panel; none saves anything. Run with
// `npx playwright test -c playwright.pipeline-canvas.config.mjs`.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { journalFile, openPanel, pausedRun, scope } from './page-fixture.mjs'

const state = { scope: null, run: null, panel: null, errors: [] }

test.beforeAll(async () => {
  test.setTimeout(180_000)
  state.scope = scope()
  state.run = await pausedRun(state.scope.t)
})
test.afterAll(() => state.scope.close())

/** Opens a panel and its page; `cwd` null opens the panel on a session with no directory yet; `writes` collects each request that is not a GET. */
const open = async (page, { cwd = state.run.cwd, tab, clock = false, journalRows, writes } = {}) => {
  const where = { cwd }
  state.panel = await openPanel({ where, home: state.run.home, tab, journalRows })
  state.errors = []
  page.on('pageerror', (error) => state.errors.push(error.message))
  if (writes) page.on('request', (request) => request.method() !== 'GET' && writes.push(`${request.method()} ${new URL(request.url()).pathname}`))
  if (clock) await page.clock.install()
  await page.goto(state.panel.url)
  await expect(page.locator('.app[data-state="ready"]')).toBeVisible()
  return where
}

test.afterEach(async () => {
  await state.panel?.close()
  expect(state.errors, 'the page raises no error').toEqual([])
})

test('the page draws a paused run: four tabs, the run waiting, the ADR question', async ({ page }) => {
  await open(page)

  await expect(page.getByRole('tab')).toHaveText(['Run', 'Configuration', 'Workflow', 'Journal'])
  await expect(page.locator('.run-status')).toHaveText('waiting')
  await expect(page.locator('.callout code')).toHaveText('adr-1')
  await page.getByRole('tab', { name: 'Run' }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Journal' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Journal' })).toBeFocused()
})

test('a page already open is moved to the Configuration tab when the canvas is opened on it again', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true')

  await state.panel.reopen('configuration')

  await expect(page.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'false')
})

test('the Journal tab lists each step recorded with its pass, outcome and the edge it took, and says the chain is intact over every line of events.jsonl', async ({ page }) => {
  await open(page)

  await page.getByRole('tab', { name: 'Journal' }).click()

  await expect(page.locator('.j-step .j-id')).toHaveText(['publish_consent', 'visuals_consent', 'research', 'design', 'design_review'])
  await expect(page.locator('.j-step .j-outcome')).toHaveText(['skipped', 'skipped', 'done', 'done', 'approved'])
  await expect(page.locator('.j-step .j-edge')).toHaveText(['then visuals_consent', 'then research', 'then design', 'then design_review', 'then adr'])
  await expect(page.locator('.j-step .j-pass')).toHaveText(Array(5).fill('pass 1'))
  const lines = readFileSync(journalFile(state.run.cwd), 'utf8').split('\n').filter(Boolean).length
  await expect(page.locator('.chain-word')).toHaveText('intact')
  await expect(page.locator('.chain-detail')).toHaveText(`${lines} lines, each chained to the one before and signed.`)
  for (const at of await page.locator('.j-at').all()) await expect(at).toHaveAttribute('datetime', /^\d{4}-\d\d-\d\dT/)
  await expect(page.locator('.journal-shown')).toHaveCount(0)
})

test('the Journal tab shows the last entries only, and says how many there are', async ({ page }) => {
  await open(page, { journalRows: 2 })

  await page.getByRole('tab', { name: 'Journal' }).click()

  await expect(page.locator('.j-row')).toHaveCount(2)
  await expect(page.locator('.j-id')).toHaveText(['design', 'design_review'])
  await expect(page.locator('.journal-shown')).toHaveText('The last 2 of 5 entries.')
})

test('a question waiting puts a We need you button in the header, which comes and goes with the question and leads to it', async ({ page }) => {
  const where = await open(page, { cwd: null, tab: 'configuration' })
  await expect(page.locator('.needs-you')).toHaveCount(0)

  where.cwd = state.run.cwd

  const button = page.locator('.needs-you')
  await expect(button).toBeVisible()
  await expect(button).toContainText('We need you')
  await expect(page.locator('.needs-you code')).toHaveText('adr-1')
  await expect(button).toHaveAttribute('aria-keyshortcuts', 'n')
  await expect(page.locator('[role="tablist"] .needs-you')).toHaveCount(0)
  await button.click()
  await expect(page.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#question')).toBeFocused()
})

test('the n key leads to the waiting question from any tab, but not while the person types in a field', async ({ page }) => {
  await open(page, { tab: 'configuration' })
  const field = page.locator('.commands input[type="text"]').first()
  await field.click()
  await page.keyboard.press('End')

  await page.keyboard.type('n')

  await expect(page.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true')
  expect(await field.inputValue()).toMatch(/n$/)

  await page.getByRole('tab', { name: 'Configuration' }).focus()
  await page.keyboard.press('n')
  await expect(page.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#question')).toBeFocused()
})

test('the n key does nothing when no question waits', async ({ page }) => {
  await open(page, { cwd: null, tab: 'configuration' })
  await page.getByRole('tab', { name: 'Configuration' }).focus()

  await page.keyboard.press('n')

  await expect(page.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true')
})

test('the We need you button and the n key answer nothing: the page sends no request but its stream and its files, the run still waits, the journal is unchanged, and the page never names skraft_decide', async ({ page }) => {
  const writes = []
  await open(page, { writes })
  const before = readFileSync(journalFile(state.run.cwd), 'utf8')

  await page.locator('.needs-you').click()
  await page.keyboard.press('n')

  expect(writes).toEqual([])
  await expect(page.locator('.run-status')).toHaveText('waiting')
  expect(readFileSync(journalFile(state.run.cwd), 'utf8')).toBe(before)
  await expect(page.locator('body')).not.toContainText('skraft_decide')
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

  test('the We need you button speaks French', async ({ page }) => {
    await open(page)

    await expect(page.locator('.needs-you')).toContainText('On a besoin de vous')
  })

  test('the Journal tab speaks French: the chain, the pass and the edge', async ({ page }) => {
    await open(page)

    await page.getByRole('tab', { name: 'Journal' }).click()

    await expect(page.locator('.chain-word')).toHaveText('intacte')
    await expect(page.locator('.j-pass').first()).toHaveText('passe 1')
    await expect(page.locator('.j-edge').first()).toHaveText('puis visuals_consent')
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

/** Computed styles of the first node a selector matches. */
const stylesOf = (page, selector, names) => page.locator(selector).first().evaluate((node, wanted) => {
  const styles = getComputedStyle(node)
  return Object.fromEntries(wanted.map((name) => [name, styles[name]]))
}, names)

/** What the system colour Highlight is, computed: a span left out of forced colours takes it as it is. */
const highlight = (page) => page.evaluate(() => {
  const probe = document.body.appendChild(document.createElement('span'))
  probe.style.forcedColorAdjust = 'none'
  probe.style.backgroundColor = 'Highlight'
  const { backgroundColor } = getComputedStyle(probe)
  probe.remove()
  return backgroundColor
})

test('in forced colours the chosen consent keeps its fill, the selected tab and the step under way an outline or border', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await open(page, { tab: 'configuration' })
  const marked = await highlight(page)

  const chosen = await stylesOf(page, '.seg[aria-checked="true"]', ['forcedColorAdjust', 'backgroundColor'])
  const other = await stylesOf(page, '.seg[aria-checked="false"]', ['backgroundColor'])
  expect(chosen).toEqual({ forcedColorAdjust: 'none', backgroundColor: marked })
  expect(other.backgroundColor).not.toBe(marked)

  await page.getByRole('tab', { name: 'Run' }).click()
  expect(await stylesOf(page, '.tab[aria-selected="true"]', ['borderBottomStyle', 'borderBottomWidth'])).toEqual({ borderBottomStyle: 'solid', borderBottomWidth: '3px' })
  expect((await stylesOf(page, '.phase.p-open', ['outlineStyle'])).outlineStyle).toBe('solid')
})

test('with more contrast asked, the soft text takes the colour of the text', async ({ page }) => {
  const soft = async () => (await stylesOf(page, '.legend', ['color'])).color
  const plain = async () => (await stylesOf(page, 'body', ['color'])).color
  await open(page)
  expect(await soft()).not.toBe(await plain())

  await page.emulateMedia({ contrast: 'more' })
  expect(await soft()).toBe(await plain())
})

// Review captures, on demand: SKRAFT_CANVAS_SHOTS=<folder> npx playwright test -c playwright.pipeline-canvas.config.mjs -g captures
test.describe('captures', () => {
  test.skip(!process.env.SKRAFT_CANVAS_SHOTS, 'set SKRAFT_CANVAS_SHOTS to a folder to write the review captures')

  for (const [locale, lang] of [['fr-FR', 'fr'], ['en-US', 'en']]) {
    for (const colorScheme of ['light', 'dark']) {
      test(`the run, the configuration and the journal, ${lang}, ${colorScheme}`, async ({ browser }) => {
        const folder = /** @type {string} */ (process.env.SKRAFT_CANVAS_SHOTS)
        mkdirSync(folder, { recursive: true })
        const context = await browser.newContext({ locale, colorScheme, viewport: { width: 1280, height: 860 } })
        const page = await context.newPage()
        await open(page)
        await page.screenshot({ path: join(folder, `run-${lang}-${colorScheme}.png`), fullPage: true })
        await page.getByRole('tab', { name: 'Configuration' }).click()
        await expect(page.locator('.consent').first()).toBeVisible()
        await page.screenshot({ path: join(folder, `configuration-${lang}-${colorScheme}.png`), fullPage: true })
        await page.getByRole('tab', { name: 'Journal' }).click()
        await expect(page.locator('.chain-word')).toBeVisible()
        await page.screenshot({ path: join(folder, `journal-${lang}-${colorScheme}.png`), fullPage: true })
        await context.close()
      })
    }
  }
})

test.describe('in French (live region)', () => {
  test.use({ locale: 'fr-FR' })

  test('the live region speaks French', async ({ page }) => {
    await open(page)

    await expect(page.locator('#announcer')).toHaveText('État du run : en attente. Le run attend votre réponse à adr-1 (ADR) : répondez dans le chat Copilot.')
  })
})
