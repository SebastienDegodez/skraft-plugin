import { test, expect } from '@playwright/test'

// The workflow viewer on the Docusaurus build (BASE_URL: the served build, base URL included).
// Until the embedding commit it lives on the preview page; the viewer under test is the first one.
const BASE = process.env.BASE_URL || 'http://localhost:3000/skraft-plugin'
const PAGE = `${BASE}/workflow-viewer-preview`
const PIPELINE_NODES = [
  'start', 'publish_consent', 'visuals_consent', 'research', 'design', 'design_review', 'adr', 'distill',
  'distill_review', 'deliver', 'gates', 'deliver_review', 'mutation', 'kill_proposal', 'mutation_plan',
  'kill_mutants', 'mutation_review', 'mutation_gates', 'visuals', 'pr_writer', 'publish', 'exit',
]

const viewer = (page) => page.locator('figure[data-workflow]').first()
const node = (page, id) => viewer(page).locator(`.react-flow__node[data-id="${id}"]`)

test.describe('workflow viewer', () => {
  test('draws every node of the pipeline the engine reads', async ({ page }) => {
    await page.goto(PAGE)
    await expect(node(page, 'design')).toBeVisible()
    for (const id of PIPELINE_NODES) await expect(node(page, id)).toHaveCount(1)
    await expect(node(page, 'design_review')).toContainText('architecture-compliance')
    await expect(node(page, 'gates').getByRole('img', { name: 'locked' })).toBeVisible()
  })

  test('switches the layout and the workflow from the toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(PAGE)
    const vertical = viewer(page).getByRole('button', { name: 'Vertical' })
    await expect(viewer(page).getByRole('button', { name: 'Horizontal' })).toHaveAttribute('aria-pressed', 'true')
    await vertical.click()
    await expect(vertical).toHaveAttribute('aria-pressed', 'true')
    await expect(viewer(page).locator('[data-direction]')).toHaveAttribute('data-direction', 'TB')
    await viewer(page).getByRole('button', { name: 'Review' }).click()
    await expect(viewer(page)).toHaveAttribute('data-workflow', 'review')
    await expect(node(page, 'verdict')).toContainText('contract-fidelity')
  })

  test('the keyboard opens the details of a node and Esc gives the focus back', async ({ page }) => {
    await page.goto(PAGE)
    await node(page, 'design').focus()
    await page.keyboard.press('Enter')
    const panel = viewer(page).locator('aside')
    await expect(panel).toContainText('solution-architect')
    await expect(panel.getByRole('link', { name: 'DESIGN' })).toHaveAttribute('href', /reference\/phases#design$/)
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(node(page, 'design')).toBeFocused()
  })

  test('the wheel scrolls the page, never the diagram', async ({ page }) => {
    await page.goto(PAGE)
    await expect(node(page, 'design')).toBeVisible()
    const before = await viewer(page).locator('.react-flow__viewport').getAttribute('style')
    await viewer(page).locator('.react-flow__pane').hover()
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    expect(await viewer(page).locator('.react-flow__viewport').getAttribute('style')).toBe(before)
  })

  test('with GitHub unreachable it draws the copy built with the page and says so', async ({ page }) => {
    await page.route('**/raw.githubusercontent.com/**', (route) => route.abort())
    await page.goto(PAGE)
    await expect(node(page, 'design')).toBeVisible()
    const notice = viewer(page).locator('figcaption')
    await expect(notice).toHaveAttribute('data-origin', 'bundled')
    await expect(notice).toContainText('live fetch failed (network)')
  })
})
