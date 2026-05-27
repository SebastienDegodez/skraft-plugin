import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/site',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4000/skraft-plugin',
  },
  webServer: {
    command: 'cd docs/site && bundle exec jekyll serve --baseurl /skraft-plugin --port 4000',
    port: 4000,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
