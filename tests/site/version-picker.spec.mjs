import { test, expect } from '@playwright/test';
import { MANIFEST } from './version-picker.harness.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';
const ROOT = new URL(BASE).pathname.replace(/\/$/, '');

// Le site local n'a pas de versions.json : chaque test sert le sien (ou un 404).
async function serveManifest(page, manifest) {
  await page.route('**/versions.json', (route) =>
    manifest
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) })
      : route.fulfill({ status: 404, body: '' }),
  );
}

test.describe('Sélecteur de version', () => {
  test('est rendu dans l\'en-tête, à côté de la langue, et marque la page', async ({ page }) => {
    await serveManifest(page, null);
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    const picker = page.locator('.site-nav .vpick[data-skraft-version-switcher]');
    await expect(picker).toHaveCount(1);
    await expect(page.locator('[data-skraft-version-switcher]')).toHaveCount(1);
    await expect(page.locator('.site-nav__links > a')).toHaveCount(5);
  });

  test('sans versions.json : pastille inactive, sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await serveManifest(page, null);
    await page.goto(`${BASE}/fr/`);
    const btn = page.locator('.vpick__btn');
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.vpick__label')).toHaveText('Dernière');
    await btn.click({ force: true });
    await expect(page.locator('.vpick__pop')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('liste les versions et met en avant la version affichée', async ({ page }) => {
    await serveManifest(page, MANIFEST);
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    await expect(page.locator('.vpick')).not.toHaveClass(/is-disabled/);
    await expect(page.locator('.vpick__label')).toHaveText('v1.15.2');
    await page.locator('.vpick__btn').click();
    await expect(page.locator('.vpick__btn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.vpick__option[aria-selected="true"]')).toContainText('Dernière');
    await expect(page.locator('.vpick__badge--pre').first()).toHaveText('pré-version');
    await page.locator('.vpick__filter').fill('1.14');
    await expect(page.locator('.vpick__option .vpick__name')).toHaveText(['v1.14.1', 'v1.14.0']);
    await page.keyboard.press('Escape');
    await expect(page.locator('.vpick__pop')).toBeHidden();
    await expect(page.locator('.vpick__btn')).toBeFocused();
  });

  test('change de version en gardant la page, ou retombe sur l\'accueil de la langue', async ({ page }) => {
    await serveManifest(page, MANIFEST);
    await page.route(`**${ROOT}/v1.14.1/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      return path === `${ROOT}/v1.14.1/fr/`
        ? route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>v1.14.1</h1>' })
        : route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${BASE}/fr/explanation/pipeline/`);
    await expect(page.locator('.vpick')).not.toHaveClass(/is-disabled/);
    await page.locator('.vpick__btn').click();
    await page.locator('.vpick__option', { hasText: 'v1.14.1' }).click();
    await expect(page).toHaveURL(`${BASE}/v1.14.1/fr/`);
  });

  test('pas de bandeau d\'intégration hors de l\'arbre v2-next', async ({ page }) => {
    await serveManifest(page, MANIFEST);
    await page.goto(`${BASE}/fr/`);
    await expect(page.locator('.vpick')).not.toHaveClass(/is-disabled/);
    await expect(page.locator('.vbanner')).toHaveCount(0);
  });
});
