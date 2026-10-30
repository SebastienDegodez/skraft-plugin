// Browser tests of the skraft-pipeline canvas page. Each test opens its own panel over a scripted run
// (tests/skraft-framework/integration/pipeline-canvas/page-fixture.mjs): no web server here.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/skraft-framework/integration/pipeline-canvas',
  testMatch: '**/*.spec.mjs',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { colorScheme: 'dark', viewport: { width: 1280, height: 860 }, locale: 'en-US' },
})
