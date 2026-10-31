import { test, expect } from '@playwright/test'

// axe finds no serious or critical issue on the home page and one page per Diátaxis mode, in both
// locales and both colour modes, and no page scrolls sideways at 375px.
// Runs against the served Docusaurus build (playwright.config.mjs); BASE_URL keeps the base URL.
const DOCS_URL = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin'

const PAGES = ['/', '/tutorials/getting-started', '/how-to/install-on-a-host', '/explanation/pipeline/design', '/reference/cli']
const LOCALES = ['', '/fr']
const THEMES = ['light', 'dark']

const loadAxe = async () => {
  try {
    return (await import('@axe-core/playwright')).default
  } catch {
    return undefined
  }
}

for (const colorScheme of THEMES) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme })

    for (const locale of LOCALES) {
      for (const path of PAGES) {
        test(`${locale || '/en'}${path} has no serious or critical axe issue`, async ({ page }) => {
          const AxeBuilder = await loadAxe()
          test.skip(!AxeBuilder, '@axe-core/playwright is not installed')
          await page.goto(`${DOCS_URL}${locale}${path}`)
          const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
          const blocking = violations
            .filter((violation) => ['serious', 'critical'].includes(violation.impact))
            .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
          expect(blocking).toEqual([])
        })

        test(`${locale || '/en'}${path} does not scroll sideways at 375px`, async ({ page }) => {
          await page.setViewportSize({ width: 375, height: 800 })
          await page.goto(`${DOCS_URL}${locale}${path}`)
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          expect(overflow).toBe(0)
        })
      }
    }
  })
}

test('a console block stays a dark card in light mode and copies only its commands', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`${DOCS_URL}/tutorials/getting-started`)
  const terminal = page.getByRole('region', { name: 'Terminal' }).filter({ hasText: 'git add' }).first()
  await expect(terminal).toHaveCSS('background-color', 'rgb(22, 24, 29)')
  await terminal.getByRole('button', { name: 'Copy commands' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('git add .\ngit commit -m "Start the shop"\ngit switch -c pay-by-card')
})
