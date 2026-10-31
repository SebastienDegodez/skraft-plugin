import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4000/skraft-plugin';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const LOCALES = [
  {
    locale: 'en',
    path: '/how-to/run-gates',
    name: 'Open this page as Markdown for an AI agent (new tab) and copy it',
    copied: 'Markdown copied',
  },
  {
    locale: 'fr',
    path: '/fr/how-to/run-gates',
    name: 'Ouvrir cette page en Markdown pour un agent IA (nouvel onglet) et la copier',
    copied: 'Markdown copié',
  },
];

for (const { locale, path, name, copied } of LOCALES) {
  test.describe(`Agent button (${locale})`, () => {
    test('is a labelled link to the twin, declared as the Markdown alternate', async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      const button = page.getByRole('link', { name, exact: true });
      await expect(button).toHaveText('Agent');
      await expect(button).toHaveAttribute('title', name);
      await expect(button).toHaveAttribute('target', '_blank');
      await expect(button).toHaveAttribute('href', `/skraft-plugin${path}.md`);
      await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
        'href',
        `/skraft-plugin${path}.md`,
      );
    });

    test('Enter opens the twin in a new tab and copies it', async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      const title = (await page.locator('article h1').first().textContent()).trim();
      const button = page.getByRole('link', { name, exact: true });
      await button.focus();
      const popup = page.waitForEvent('popup');
      await page.keyboard.press('Enter');
      const twinPage = await popup;
      expect(twinPage.url()).toMatch(/\.md$/);
      const twin = await (await page.request.get(twinPage.url())).text();
      expect(twin.startsWith(`# ${title}\n`)).toBe(true);

      await page.bringToFront();
      await expect(page.locator('.skraft-agent-button ~ [role="status"]')).toHaveText(copied);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(twin);
    });
  });
}
