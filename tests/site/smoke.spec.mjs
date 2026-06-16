import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';

test.describe('SKRAFT docs site', () => {
  test('Root splash offers both languages', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('.splash__door[lang="fr"]')).toHaveAttribute('href', /\/fr\/$/);
    await expect(page.locator('.splash__door[lang="en"]')).toHaveAttribute('href', /\/en\/$/);
  });

  test('FR landing loads', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    await expect(page.locator('h1')).toContainText('SKRAFT');
  });

  test('FR landing routes the reader (Diátaxis doors + pipeline)', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    const body = page.locator('body');
    // Pipeline phases shown in the map.
    await expect(body).toContainText('DISCOVER');
    await expect(body).toContainText('DISCUSS');
    await expect(body).toContainText('DESIGN');
    await expect(body).toContainText('DISTILL');
    await expect(body).toContainText('DELIVER');
    // Diátaxis routing doors + running example entry point.
    await expect(body).toContainText('Diátaxis');
    await expect(body).toContainText('fil rouge');
  });

  test('EN landing loads', async ({ page }) => {
    await page.goto(`${BASE}/en/`);
    await expect(page.locator('h1')).toContainText('SKRAFT');
  });

  test('Language toggle works', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    await page.click('.site-nav__lang a');
    await expect(page).toHaveURL(/\/en\//);
  });

  test('Pipeline page renders Mermaid', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    const mermaid = page.locator('div.mermaid, svg');
    await expect(mermaid.first()).toBeVisible();
  });

  test('Navigation is reduced to the handbook doors', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    // Top menu doors inside .site-nav__links (brand and lang toggle excluded).
    const doors = page.locator('.site-nav__links > a');
    await expect(doors).toHaveCount(4);
  });

  test('Citations page renders entries', async ({ page }) => {
    await page.goto(`${BASE}/fr/reference/citations`);
    const entries = page.locator('.citation-entry');
    expect(await entries.count()).toBeGreaterThanOrEqual(10);
  });

  test('404 returns 404', async ({ page }) => {
    const response = await page.goto(`${BASE}/fr/nonexistent-page-xyz`);
    expect(response.status()).toBe(404);
  });
});
