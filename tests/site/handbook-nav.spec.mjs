import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';

test.describe('SKRAFT handbook navigation', () => {
  test('top menu reduced to the handbook doors', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    // Brand and lang toggle are excluded: the handbook doors live in .site-nav__links.
    const doors = page.locator('.site-nav__links > a');
    await expect(doors).toHaveCount(4);
    await expect(doors.nth(0)).toContainText('handbook');
  });

  test('handbook sidebar is present and grouped by Diátaxis mode', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    await expect(page.locator('.doc-sidebar')).toBeAttached();
    await expect(
      page.locator('.doc-sidebar__group', { hasText: 'Explication' })
    ).toBeVisible();
    await expect(
      page.locator('.doc-sidebar__group', { hasText: 'Référence' })
    ).toBeVisible();
  });

  test('HVE-Core substrate is reachable from the pipeline sidebar', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    await expect(
      page.locator('.doc-sidebar a', { hasText: 'substrat HVE-Core' })
    ).toBeVisible();
  });
});
