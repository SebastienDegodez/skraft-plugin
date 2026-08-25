import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/site',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4000/skraft-plugin',
  },
  webServer: {
    // The dashboard is fed by data derived from the plugin sources; regenerate it
    // before Jekyll starts so the page is never served against stale or absent data.
    command:
      'node eng/catalog/scan.mjs && node eng/dashboard/build.mjs && cd docs/site && bundle exec jekyll serve --baseurl /skraft-plugin --port 4000',
    port: 4000,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
