import { defineConfig } from '@playwright/test';

// The site suite (tests/site/*.spec.mjs) runs against the built Docusaurus handbook.
// BASE_URL points at another server (a served CI artifact, for instance); PLAYWRIGHT_CHROMIUM_PATH
// launches a Chromium already on the machine when Playwright cannot download its own revision.
const PORT = 4000;
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/site',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${PORT}/skraft-plugin`,
    browserName: 'chromium',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        // The dashboard is fed by data derived from the plugin sources; regenerate it before the
        // handbook is built so the page is never served against stale or absent data. `docusaurus
        // serve` honours the site's baseUrl (/skraft-plugin/) and trailingSlash. SKRAFT_SITE_PREBUILT=1
        // serves an existing docs/website/build as it is (the CI e2e job builds it in its own step).
        command: process.env.SKRAFT_SITE_PREBUILT
          ? `npm run docs:serve -- --port ${PORT} --no-open`
          : `node eng/catalog/scan.mjs && node eng/dashboard/build.mjs --out docs/website/static/dashboard/data/dashboard.json && npm run docs:build && npm run docs:serve -- --port ${PORT} --no-open`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 600000,
      },
});
