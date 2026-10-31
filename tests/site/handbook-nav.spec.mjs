import { test, expect } from '@playwright/test';

// Navigation of the Docusaurus handbook: navbar doors, one sidebar per part, locale and version
// switches, search. BASE_URL keeps the base URL (playwright.config.mjs serves the build).
const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';
const ROOT = new URL(BASE).pathname.replace(/\/$/, '');

const PARTS = [
  { part: 'tutorials', en: 'Tutorials', fr: 'Tutoriels' },
  { part: 'how-to', en: 'How-to guides', fr: 'Guides pratiques' },
  { part: 'explanation', en: 'Explanation', fr: 'Explication' },
  { part: 'reference', en: 'Reference', fr: 'Référence' },
];

const navbarDoors = (page) => page.locator('nav.navbar a.navbar__item.navbar__link').filter({ hasNot: page.locator('svg') });
const topCategories = (page) => page.locator('.theme-doc-sidebar-menu > li.theme-doc-sidebar-item-category-level-1 > div > a');

test.describe('handbook navigation', () => {
  for (const locale of ['en', 'fr']) {
    const prefix = locale === 'en' ? '' : '/fr';

    test(`the navbar has the four part doors, in book order (${locale})`, async ({ page }) => {
      await page.goto(`${BASE}${prefix}/explanation/pipeline`);
      const doors = navbarDoors(page).filter({ hasNotText: 'GitHub' });
      await expect(doors).toHaveText(PARTS.map((part) => part[locale]));
      for (const [index, { part }] of PARTS.entries()) {
        await expect(doors.nth(index)).toHaveAttribute('href', `${ROOT}${prefix}/${part}`);
      }
      await expect(doors.nth(2)).toHaveClass(/navbar__link--active/);
    });

    test(`a door opens its part, whose sidebar holds that part only (${locale})`, async ({ page }) => {
      for (const { part } of PARTS) {
        await page.goto(`${BASE}${prefix}/`);
        await navbarDoors(page).filter({ hasText: PARTS.find((p) => p.part === part)[locale] }).click();
        await expect(page).toHaveURL(`${BASE}${prefix}/${part}`);
        await expect(topCategories(page)).toHaveCount(1);
        await expect(topCategories(page)).toHaveAttribute('href', `${ROOT}${prefix}/${part}`);
      }
    });
  }

  test('the explanation sidebar follows the book: orientation, core journey, then brownfield', async ({ page }) => {
    await page.goto(`${BASE}/fr/explanation/pipeline`);
    const sections = page.locator('.theme-doc-sidebar-item-category-level-2 > div > a');
    await expect(sections.nth(0)).toHaveText('Orientation');
    await expect(sections.nth(1)).toHaveText('Parcours principal');
    await expect(sections.nth(2)).toHaveText('Parcours Brownfield');
    await expect(page.locator('.theme-doc-sidebar-menu a[aria-current="page"]')).toHaveAttribute('href', `${ROOT}/fr/explanation/pipeline`);
  });

  test('the locale switch keeps the page, both ways', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/explanation/pipeline/design`);
    const localeMenu = page.locator('nav.navbar .dropdown').filter({ has: page.locator('a[lang="fr"]') });
    await localeMenu.hover();
    await localeMenu.locator('a[lang="fr"]').click();
    await expect(page).toHaveURL(`${BASE}/fr/explanation/pipeline/design`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await localeMenu.hover();
    await localeMenu.locator('a[lang="en"]').click();
    await expect(page).toHaveURL(`${BASE}/explanation/pipeline/design`);
  });

  // Before the 2.x cut there is one Docusaurus version (`current`, "2.0 preview") plus the v1 archive
  // links, which stay on the site root in every locale (§11.1, a42befe6).
  for (const { locale, prefix, label } of [
    { locale: 'en', prefix: '', label: '2.0 preview' },
    { locale: 'fr', prefix: '/fr', label: 'Aperçu 2.0' },
  ]) {
    test(`the version dropdown lists the preview and the v1 archive (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${BASE}${prefix}/how-to/run-gates`);
      const versions = page.locator('nav.navbar .dropdown').filter({ hasText: '1.15 (archived)' });
      await expect(versions.locator('> a.navbar__link')).toHaveText(label);
      await versions.hover();
      const entries = versions.locator('.dropdown__menu a.dropdown__link');
      await expect(entries).toHaveText([label, '1.15 (archived)', 'All v1 versions']);
      await expect(entries.nth(0)).toHaveAttribute('href', `${ROOT}${prefix}/how-to/run-gates`);
      await expect(entries.nth(1)).toHaveAttribute('href', `${ROOT}/v1.15.3/`);
      await expect(entries.nth(2)).toHaveAttribute('href', `${ROOT}/v1/`);
    });
  }

  test('a French query finds French pages, and "See all results" lists them', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/fr/`);
    const input = page.locator('nav.navbar input.navbar__search-input');
    await input.click();
    await input.pressSequentially('portes de qualité');
    const hits = page.locator('.navbar__search [role="listbox"] a[href*="/fr/"], .navbar__search [role="listbox"] [role="option"] a');
    await expect(hits.first()).toBeVisible();
    const hrefs = await hits.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(new RegExp(`^${ROOT}/fr/`));

    const seeAll = page.locator('.navbar__search a[href*="search/?"]');
    await expect(seeAll).toHaveAttribute('href', new RegExp(`^${ROOT}/fr/search/\\?q=`));
    await page.goto(new URL(await seeAll.getAttribute('href'), BASE).href);
    const results = page.locator('article h2 a');
    await expect(results.first()).toBeVisible();
    for (const href of await results.evaluateAll((links) => links.map((link) => link.getAttribute('href')))) {
      expect(href).toMatch(new RegExp(`^${ROOT}/fr/`));
    }
  });
});
