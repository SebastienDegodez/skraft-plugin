import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';

test.describe('SKRAFT handbook navigation', () => {
  test('top menu reduced to the handbook doors', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    // Brand and lang toggle are excluded: the handbook doors live in .site-nav__links.
    const doors = page.locator('.site-nav__links > a');
    await expect(doors).toHaveCount(5);
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

  test('Brownfield is a first-class journey directly after the core journey', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    const sections = page.locator('.doc-sidebar__section');
    await expect(sections).toContainText([
      'Orientation',
      'Parcours principal',
      'Parcours Brownfield',
      'Comprendre le système',
      'Approfondissements',
      'Contextes particuliers'
    ]);
    await expect(page.locator('.doc-sidebar a', { hasText: 'Reprendre un existant' })).toBeVisible();
  });

  test('pager traverses section boundaries in book order', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline/deliver.html`);
    await expect(page.locator('.doc-pager a', { hasText: 'Reprendre un existant' })).toBeVisible();
  });

  test('localized dashboard uses full width and renders ordered topology', async ({ page }) => {
    await page.goto(`${BASE}/fr/dashboard/`);

    await expect(page.locator('.doc-sidebar')).toHaveCount(0);
    await expect(page.locator('.dashboard-layout')).toHaveCSS('width', `${page.viewportSize().width}px`);
    const heroBox = await page.locator('.hero').boundingBox();
    expect(heroBox.x).toBe(0);
    expect(heroBox.width).toBe(page.viewportSize().width);
    await expect(page.locator('.hero h1')).toContainText('Des skills pour une livraison disciplinée.');
    await expect(page.locator('#chains')).toContainText('Préparation produit, puis ingénierie');
    await expect(page.locator('.journey-step')).toHaveCount(3);
    await expect(page.locator('.phase-card')).toHaveCount(4);
    await expect(page.locator('#agent-backlog-discoverer')).toBeAttached();
    await expect(page.locator('[id^="skill-"]').first()).toBeAttached();
  });

  test('legacy dashboard route stays operational with English handbook navigation', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/`);

    await expect(page.locator('.doc-sidebar')).toHaveCount(0);
    await expect(page.locator('.hero h1')).toContainText('Skills that make delivery disciplined.');
    await expect(page.locator('.hero .lead')).toContainText('controlled skill-versus-baseline runs');
    await expect(page.locator('#topology')).toContainText('Engineering pipeline');
    await expect(page.locator('.site-nav__lang a')).toHaveAttribute('href', /\/fr\/dashboard\/$/);
  });
});
