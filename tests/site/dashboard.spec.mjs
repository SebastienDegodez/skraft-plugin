import { expect, test } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin'

// The dashboard is a static page fed by data/dashboard.json, which the site
// server regenerates from the plugin sources before Jekyll starts. These checks
// prove the page renders the catalogue it was given — never that an evaluation
// passed, which is evidence the page reports rather than something it owns.
test.describe('quality dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/dashboard/`)
    await expect(page.locator('#status')).not.toHaveText('Loading catalogue…')
  })

  test('announces the plugin and its headline numbers', async ({ page }) => {
    await expect(page).toHaveTitle(/SKRAFT Agent Skills/)
    await expect(page.locator('h1')).toContainText('disciplined')

    const metrics = page.locator('#summary .metric')
    await expect(metrics).toHaveCount(4)
    await expect(metrics.first()).toContainText('Distributed skills')
    await expect(metrics.first().locator('strong')).not.toHaveText('0')
  })

  test('lists the shipped skills with their context profile', async ({ page }) => {
    const row = page.locator('.rows tr', { hasText: 'outside-in-tdd' }).first()

    await expect(row).toBeVisible()
    await expect(row).toContainText('tokens')
    await expect(row.locator('a').first()).toHaveAttribute('href', /plugins\/skraft-framework\/skills\/outside-in-tdd\/SKILL\.md$/)
  })

  test('states plainly when a skill has no runtime evidence yet', async ({ page }) => {
    const row = page.locator('.rows tr', { hasText: 'outside-in-tdd' }).first()

    await expect(row.locator('.badge')).toHaveText(/No runtime data|Not evaluated|pass|regression|inconclusive|no-improvement/i)
  })

  test('lists the orchestration agents and their review lenses', async ({ page }) => {
    await expect(page.locator('.family-header h3', { hasText: 'Agents' })).toBeVisible()
    await expect(page.locator('.rows tr', { hasText: 'Skraft - Orchestrator' }).first()).toBeVisible()
    await expect(page.locator('.badge', { hasText: 'lens' }).first()).toBeVisible()
  })

  test('states plainly when an agent has no runtime evidence yet', async ({ page }) => {
    const row = page.locator('.rows tr', { hasText: 'Skraft - Orchestrator' }).first()

    await expect(row.locator('.badge')).toHaveText([/agent/i, /Not evaluated|pass|regression|inconclusive|no-improvement/i])
  })

  test('narrows the catalogue as the reader searches', async ({ page }) => {
    await page.locator('#search').fill('mocking')

    await expect(page.locator('.rows tbody tr', { hasText: 'outside-in-tdd' })).toHaveCount(0)
    await expect(page.locator('.rows tbody tr', { hasText: 'mocking-strategy-roster' }).first()).toBeVisible()
  })

  test('separates catalogue, quality, and efficiency evidence', async ({ page }) => {
    const tabs = page.locator('.tabs .tab')
    await expect(tabs).toHaveCount(4)

    await page.getByRole('button', { name: 'Quality' }).click()
    await expect(page.locator('#panel-quality')).toBeVisible()
    await expect(page.locator('#panel-quality h2')).toHaveText('Quality and activation')

    await page.getByRole('button', { name: 'Efficiency' }).click()
    await expect(page.locator('#panel-efficiency')).toBeVisible()
    await expect(page.locator('#panel-efficiency h2')).toHaveText('Efficiency')

    await page.getByRole('button', { name: 'Models' }).click()
    await expect(page.locator('#panel-models')).toBeVisible()
    await expect(page.locator('#panel-models h2')).toHaveText('Model comparison')
  })

  test('compares model arms only within a single judge', async ({ page }) => {
    // Two judges do not share a scale, so a comparison table that mixed them
    // would be meaningless. Every rendered cohort names exactly one judge, and
    // holds at least the two arms that make it a comparison.
    await page.getByRole('button', { name: 'Models' }).click()

    const cohorts = page.locator('#model-grid .family')
    for (let index = 0; index < (await cohorts.count()); index += 1) {
      const cohort = cohorts.nth(index)
      await expect(cohort.locator('.eyebrow')).toHaveText(/judged by \S+$/)
      expect(await cohort.locator('.rows tbody tr').count()).toBeGreaterThan(1)
    }
  })

  test('hides the session replay entry point until a session is published', async ({ page }) => {
    // A visible callout must always lead somewhere: either it is hidden, or its
    // link points at the replay app rather than the placeholder anchor.
    const callout = page.locator('#replay-callout')

    if (await callout.isVisible()) {
      await expect(page.locator('#replay-link')).not.toHaveAttribute('href', '#')
    } else {
      await expect(callout).toBeHidden()
    }
  })

  test('is reachable from the handbook', async ({ page }) => {
    await expect(page.locator('.nav a', { hasText: 'Handbook' })).toHaveAttribute('href', '../')
  })
})
