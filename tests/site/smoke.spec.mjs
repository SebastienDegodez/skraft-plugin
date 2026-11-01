import { test, expect } from '@playwright/test';

// The Docusaurus handbook, served from its build (playwright.config.mjs). BASE_URL keeps the base URL.
const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';

test.describe('skraft handbook', () => {
  test('the English home routes the reader through the four Diátaxis doors and the pipeline', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('h1').first()).toContainText('SKRAFT');
    const doors = page.locator('main a.skraft-door');
    await expect(doors).toHaveCount(4);
    for (const part of ['tutorials', 'how-to', 'explanation', 'reference']) {
      await expect(page.locator(`main a.skraft-door[href="/skraft-plugin/${part}"]`)).toHaveCount(1);
    }
    for (const phase of ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER']) {
      await expect(page.locator('main')).toContainText(phase);
    }
  });

  test('the French home is in French and its doors stay under /fr', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('h1').first()).toContainText('SKRAFT');
    await expect(page.locator('main a.skraft-door')).toHaveCount(4);
    await expect(page.locator('main a.skraft-door[href="/skraft-plugin/fr/tutorials"]')).toHaveCount(1);
  });

  test('the pipeline page draws its Mermaid diagram', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline`);
    await expect(page.locator('.docusaurus-mermaid-container svg').first()).toBeVisible();
  });

  test('the citations page lists the bibliography', async ({ page }) => {
    await page.goto(`${BASE}/fr/reference/citations`);
    expect(await page.locator('.citation-entry').count()).toBeGreaterThanOrEqual(10);
  });

  test('an unknown page answers 404', async ({ page }) => {
    const response = await page.goto(`${BASE}/fr/nonexistent-page-xyz`);
    expect(response.status()).toBe(404);
  });

  test('an old /en/ address of the Jekyll handbook redirects to the page, anchor kept', async ({ page }) => {
    await page.goto(`${BASE}/en/how-to/run-gates`);
    await expect(page).toHaveURL(`${BASE}/how-to/run-gates`);
    await expect(page.locator('article h1').first()).toBeVisible();
    // The `.html` form (`/en/reference/cli.html`) is not reachable here: `docusaurus serve` 3.10.2
    // answers it with a 301 to `/en/reference/cli` without the base URL. tests/tooling/docs-redirects
    // covers those redirect files.
    await page.goto(`${BASE}/en/reference/cli#see-also`);
    await expect(page).toHaveURL(`${BASE}/reference/cli#see-also`);
  });

  // `docusaurus serve` answers a folder address with its index.html; when that index was a redirect
  // to the page, the page reloaded itself forever (WP0 handback, §11.1).
  for (const path of ['/explanation', '/tutorials', '/explanation/pipeline', '/fr/explanation/pipeline/']) {
    test(`${path} renders once and stays put`, async ({ page }) => {
      let loads = 0;
      page.on('load', () => { loads += 1; });
      await page.goto(`${BASE}${path}`);
      await expect(page.locator('h1').first()).toBeVisible();
      await page.waitForTimeout(1500);
      expect(loads).toBe(1);
      expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(`/skraft-plugin${path}`.replace(/\/$/, ''));
    });
  }
});
