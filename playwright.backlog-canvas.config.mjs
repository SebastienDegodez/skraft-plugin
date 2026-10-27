// Browser tests of the skraft-backlog canvas. Each test serves its own fixture workspace
// (tests/skraft-backlog/canvas/serve-fixture.mjs), so no web server is configured here.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/skraft-backlog/canvas',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { colorScheme: 'dark', viewport: { width: 1280, height: 860 } },
})
