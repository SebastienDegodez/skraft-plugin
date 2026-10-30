// Contrôle navigateur du sélecteur de version sans Jekyll :
//   node --test tests/site/version-picker.harness.test.mjs
// Utilise la bibliothèque Playwright installée (ou PLAYWRIGHT_MODULE=<chemin>), et
// enregistre des captures quand VPICK_SHOTS=<dossier> est défini.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ORIGIN, ROOT, serveSite } from './version-picker.harness.mjs';

// Premier module Playwright dont le navigateur se lance (versions locale et préinstallée
// peuvent différer) ; sans navigateur, les tests sont ignorés.
async function launchBrowser() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '@playwright/test'].filter(Boolean);
  for (const c of candidates) {
    try {
      const mod = await import(c.startsWith('/') ? pathToFileURL(c).href : c);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return await chromium.launch();
    } catch { /* candidat suivant */ }
  }
  return null;
}

const browser = await launchBrowser();
const SHOTS = process.env.VPICK_SHOTS;

after(async () => { await browser?.close(); });

const V2 = `${ORIGIN}${ROOT}/v2-next/fr/explanation/pipeline/`;
const LATEST = `${ORIGIN}${ROOT}/fr/explanation/pipeline/`;

async function open(url, { manifest, viewport = { width: 1280, height: 800 }, lang } = {}) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const requests = await serveSite(page, { manifest, lang });
  await page.goto(url);
  return { page, context, requests };
}

const ready = (page) => page.waitForSelector('.vpick:not(.is-disabled)');
const optionNames = (page) => page.locator('.vpick__option .vpick__name').allTextContents();
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `picker-${name}.png`) }); };

const t = browser ? test : test.skip;

t('sans versions.json : pastille inactive, aucune erreur', async () => {
  const errors = [];
  const { page, context } = await open(V2, { manifest: null });
  page.on('pageerror', (e) => errors.push(e));
  await page.waitForLoadState('networkidle');
  const btn = page.locator('.vpick__btn');
  assert.equal(await btn.getAttribute('aria-disabled'), 'true');
  assert.equal(await page.locator('.vpick__label').textContent(), 'v2-next');
  await btn.click({ force: true });
  assert.equal(await page.locator('.vpick__pop').isHidden(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

t('ouvre la liste : épinglés, une entrée par ligne, version courante', async () => {
  const { page, context } = await open(V2);
  await ready(page);
  await shot(page, 'desktop-closed');
  const btn = page.locator('.vpick__btn');
  assert.equal(await btn.getAttribute('aria-haspopup'), 'listbox');
  await btn.click();
  assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await optionNames(page), ['Dernière — v1.15.2', 'v2-next', 'v2.0.0-alpha.19', 'v1.15.2', 'v1.14.1', 'v1.13.0']);
  const current = page.locator('.vpick__option[aria-selected="true"]');
  assert.equal(await current.count(), 1);
  assert.match(await current.textContent(), /v2-next/);
  assert.equal(await page.locator('.vpick__badge--pre').first().textContent(), 'pré-version');
  assert.equal(await page.locator('.vpick__badge--int').textContent(), 'intégration');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'vpick__filter');
  await shot(page, 'desktop-open');
  await page.locator('.vpick__all').click();
  assert.deepEqual((await optionNames(page)).slice(2), [
    'v2.0.0-alpha.19', 'v2.0.0-alpha.18', 'v1.15.2', 'v1.15.1', 'v1.15.0', 'v1.14.1', 'v1.14.0', 'v1.13.0',
  ]);
  assert.equal(await page.locator('.vpick__all').getAttribute('aria-expanded'), 'true');
  await page.mouse.click(600, 600);
  assert.equal(await page.locator('.vpick__pop').isHidden(), true, 'clic extérieur ferme');
  await context.close();
});

t('filtre en direct sur toutes les versions', async () => {
  const { page, context } = await open(V2);
  await ready(page);
  await page.locator('.vpick__btn').click();
  await page.locator('.vpick__filter').fill('1.14');
  assert.deepEqual(await optionNames(page), ['v1.14.1', 'v1.14.0']);
  await page.locator('.vpick__filter').fill('alpha.18');
  assert.deepEqual(await optionNames(page), ['v2.0.0-alpha.18']);
  await page.locator('.vpick__filter').fill('zzz');
  assert.equal(await page.locator('.vpick__option').count(), 0);
  assert.equal(await page.locator('.vpick__empty').isVisible(), true);
  await context.close();
});

t('clavier : Entrée/Espace ouvrent, flèches, Échap, « / » non capturé', async () => {
  const { page, context } = await open(V2);
  await ready(page);
  await page.keyboard.press('/');
  assert.equal(await page.locator('.vpick__pop').isHidden(), true, '« / » ne doit pas ouvrir le sélecteur');
  await page.locator('.vpick__btn').focus();
  await page.keyboard.press('Enter');
  const input = page.locator('.vpick__filter');
  assert.equal(await page.locator('.vpick__pop').isVisible(), true);
  const first = await input.getAttribute('aria-activedescendant');
  assert.match(await page.locator(`#${first}`).textContent(), /v2-next/, 'la version courante est active');
  await page.keyboard.press('ArrowDown');
  const next = await input.getAttribute('aria-activedescendant');
  assert.notEqual(next, first);
  assert.match(await page.locator(`#${next}`).textContent(), /alpha\.19/);
  await page.keyboard.press('ArrowUp');
  assert.equal(await input.getAttribute('aria-activedescendant'), first);
  await page.keyboard.type('1/');
  assert.equal(await input.inputValue(), '1/', '« / » reste saisi dans le filtre');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.vpick__pop').isHidden(), true);
  assert.equal(await page.evaluate(() => document.activeElement.className), 'vpick__btn');
  await page.keyboard.press(' ');
  assert.equal(await page.locator('.vpick__pop').isVisible(), true, 'Espace ouvre');
  await context.close();
});

t('changer de version garde la page, sinon accueil de la langue', async () => {
  const { page, context, requests } = await open(`${V2}#etapes`);
  await ready(page);
  await page.locator('.vpick__btn').click();
  await page.locator('.vpick__option', { hasText: 'Dernière' }).click();
  await page.waitForURL(`${LATEST}#etapes`);
  assert.ok(requests.some((r) => r.method === 'HEAD' && r.path === `${ROOT}/fr/explanation/pipeline/`));

  await ready(page);
  assert.equal(await page.locator('.vpick__label').textContent(), 'v1.15.2');
  await page.locator('.vpick__btn').click();
  assert.match(await page.locator('.vpick__option[aria-selected="true"]').textContent(), /Dernière/);
  await page.locator('.vpick__filter').fill('1.14.1');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${ORIGIN}${ROOT}/v1.14.1/fr/`);
  await context.close();
});

t('bandeau d\'intégration : lien vers la version publiée, masquage mémorisé', async () => {
  const { page, context } = await open(V2);
  const banner = page.locator('.vbanner');
  await banner.waitFor();
  assert.match(await banner.textContent(), /branche d'intégration V2, pas encore publiée/);
  const link = banner.locator('a');
  assert.equal(await link.textContent(), 'Voir la version publiée');
  assert.equal(await link.getAttribute('href'), `${ROOT}/fr/explanation/pipeline/`);
  const navBottom = await page.locator('.site-nav').evaluate((n) => n.getBoundingClientRect().bottom);
  const bannerTop = await banner.evaluate((b) => b.getBoundingClientRect().top);
  assert.ok(Math.abs(bannerTop - navBottom) < 2, 'le bandeau est collé sous l\'en-tête');
  await banner.locator('.vbanner__close').click();
  assert.equal(await banner.count(), 0);
  await page.reload();
  await ready(page);
  assert.equal(await page.locator('.vbanner').count(), 0, 'masquage mémorisé');

  await page.goto(LATEST);
  await ready(page);
  assert.equal(await page.locator('.vbanner').count(), 0, 'pas de bandeau hors v2-next');
  await context.close();
});

t('libellés anglais quand la page est en anglais', async () => {
  const { page, context } = await open(`${ORIGIN}${ROOT}/v2-next/en/explanation/pipeline/`);
  await ready(page);
  assert.match(await page.locator('.vbanner').textContent(), /V2 integration branch/);
  await page.locator('.vpick__btn').click();
  assert.equal(await page.locator('.vpick__option .vpick__name').first().textContent(), 'Latest — v1.15.2');
  assert.equal(await page.locator('.vpick__all').textContent(), 'All versions');
  await context.close();
});

t('375 px : popover pleine largeur sous l\'en-tête, sans défilement horizontal', async () => {
  const { page, context } = await open(V2, { viewport: { width: 375, height: 760 } });
  await ready(page);
  await page.locator('.vpick__btn').click();
  const box = await page.locator('.vpick__pop').boundingBox();
  const navBottom = await page.locator('.site-nav').evaluate((n) => n.getBoundingClientRect().bottom);
  assert.equal(Math.round(box.x), 0);
  assert.equal(Math.round(box.width), 375);
  assert.ok(Math.abs(box.y - navBottom) < 2, `sous l'en-tête (${box.y} vs ${navBottom})`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375));
  const btnBox = await page.locator('.vpick__btn').boundingBox();
  assert.ok(btnBox.x + btnBox.width <= 375 && btnBox.y < navBottom, 'pastille visible dans la barre');
  await shot(page, 'mobile-open');
  await context.close();
});
