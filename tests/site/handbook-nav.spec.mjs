import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';

test.describe('SKRAFT handbook navigation', () => {
  test('top menu reduced to 3 doors', async ({ page }) => {
    await page.goto(`${BASE}/fr/pipeline/`);
    // Brand + lang toggle are excluded: only the 3 handbook doors are direct
    // <a> children of .site-nav that are not the brand.
    const doors = page.locator('.site-nav > a:not(.site-nav__brand)');
    await expect(doors).toHaveCount(3);
    await expect(doors.nth(0)).toContainText('handbook');
  });

  test('handbook sidebar is present and grouped by phase', async ({ page }) => {
    await page.goto(`${BASE}/fr/pipeline/`);
    await expect(page.locator('.doc-sidebar')).toBeAttached();
    await expect(
      page.locator('.doc-sidebar__group', { hasText: 'Le pipeline' })
    ).toBeVisible();
    await expect(
      page.locator('.doc-sidebar__group', { hasText: 'Le catalogue' })
    ).toBeVisible();
  });

  test('HVE-Core substrate is reachable from the pipeline sidebar', async ({ page }) => {
    await page.goto(`${BASE}/fr/pipeline/`);
    await expect(
      page.locator('.doc-sidebar a', { hasText: 'substrat HVE-Core' })
    ).toBeVisible();
  });
});
