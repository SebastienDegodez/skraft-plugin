import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';

test.describe('SKRAFT docs site', () => {
  test('FR landing loads', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    await expect(page.locator('h1')).toContainText('SKRAFT');
  });

  test('FR landing presents the phase-by-phase handbook', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    const body = page.locator('body');
    // Guided flow with the long-form phase naming.
    await expect(body).toContainText('DISCOVER');
    await expect(body).toContainText('DISCUSS');
    await expect(body).toContainText('DESIGN');
    await expect(body).toContainText('DISTILL');
    await expect(body).toContainText('DELIVER');
    // Handbook context sections.
    await expect(body).toContainText('Clean Architecture');
    await expect(body).toContainText('Object Calisthenics');
    await expect(body).toContainText('ADR');
  });

  test('EN landing loads', async ({ page }) => {
    await page.goto(`${BASE}/en/`);
    await expect(page.locator('h1')).toContainText('SKRAFT');
  });

  test('Language toggle works', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    await page.click('.lang-toggle a');
    await expect(page).toHaveURL(/\/en\//);
  });

  test('Pipeline page renders Mermaid', async ({ page }) => {
    await page.goto(`${BASE}/fr/pipeline/`);
    const mermaid = page.locator('div.mermaid, svg');
    await expect(mermaid.first()).toBeVisible();
  });

  test('Navigation has expected links', async ({ page }) => {
    await page.goto(`${BASE}/fr/`);
    const navLinks = page.locator('.site-nav a');
    await expect(navLinks).toHaveCount({ minimum: 5 });
  });

  test('Citations page renders entries', async ({ page }) => {
    await page.goto(`${BASE}/fr/citations`);
    const entries = page.locator('.citation-entry');
    await expect(entries).toHaveCount({ minimum: 10 });
  });

  test('404 returns 404', async ({ page }) => {
    const response = await page.goto(`${BASE}/fr/nonexistent-page-xyz`);
    expect(response.status()).toBe(404);
  });
});
