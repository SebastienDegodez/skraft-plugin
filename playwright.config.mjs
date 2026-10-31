import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/site',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4000/skraft-plugin',
  },
  webServer: {
    // The dashboard is fed by data derived from the plugin sources; regenerate it before the
    // handbook is built so the page is never served against stale or absent data. `docusaurus
    // serve` honours the site's baseUrl (/skraft-plugin/) and trailingSlash.
    command:
      'node eng/catalog/scan.mjs && node eng/dashboard/build.mjs --out docs/website/static/dashboard/data/dashboard.json && npm run build --prefix docs/website && npm run serve --prefix docs/website -- --port 4000 --no-open',
    port: 4000,
    reuseExistingServer: !process.env.CI,
    timeout: 600000,
  },
});
