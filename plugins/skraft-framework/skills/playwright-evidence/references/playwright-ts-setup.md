# Playwright TypeScript Setup Reference

## Installation

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
# Install all browsers:
npx playwright install --with-deps
# Install specific browsers:
npx playwright install chromium firefox webkit
```

## `playwright.config.ts` — Full Example

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,                      // per-test timeout (ms)
  retries: process.env.CI ? 2 : 0,      // retry on CI, none locally
  workers: process.env.CI ? 1 : undefined,  // parallel locally, serial in CI
  fullyParallel: true,                  // run tests within a file in parallel

  use: {
    baseURL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    locale: 'fr-CA',
    timezoneId: 'America/Montreal',
    trace: 'retain-on-failure',         // save trace on failure
    video: 'retain-on-failure',         // save video on failure
    screenshot: 'only-on-failure',      // save screenshot on failure
  },

  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: 'evidence/reports/results.xml' }],
      ]
    : [['html', { open: 'on-failure' }]],

  outputDir: 'test-results',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
```

## Per-File Overrides with `test.use()`

```typescript
import { test } from '@playwright/test';

// Override viewport and locale for a specific test file
test.use({
  viewport: { width: 375, height: 812 },  // mobile
  locale: 'en-CA',
});
```

## Fixture Scopes

| Fixture | Scope | Description |
|---|---|---|
| `page` | test | New page per test (default) |
| `context` | test | New browser context per test |
| `browser` | worker | Shared browser instance per worker |
| `testInfo` | test | Metadata: title, status, attachments, retry |
| `browserName` | worker | `'chromium'` \| `'firefox'` \| `'webkit'` |

## `test.beforeAll` / `test.afterEach` Patterns

```typescript
import { test, expect } from '@playwright/test';

test.beforeAll(async ({ browser }) => {
  // Runs once per test file, per worker
  // Use for expensive setup (e.g., login state)
  const page = await browser.newPage();
  await page.goto('/login');
  // ... login steps ...
  await page.context().storageState({ path: 'auth.json' });
  await page.close();
});

test.afterEach(async ({ page }, testInfo) => {
  // Runs after every test — ideal for evidence capture
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' });
  }
});
```

## Parallel Execution

```typescript
// playwright.config.ts
fullyParallel: true,              // all tests in all files run in parallel
workers: 4,                       // explicit worker count
```

CLI override: `npx playwright test --workers=4`

Serial file: add `test.describe.configure({ mode: 'serial' });` at file top to
run tests in that file sequentially even when `fullyParallel: true`.

## Domain: MonAssurance Eligibility Check

```typescript
// playwright.config.ts
use: {
  baseURL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
}

// In tests — paths are relative to baseURL:
await page.goto('/eligibility/check');
```

`APP_BASE_URL` is injected by CI. Locally defaults to `http://localhost:3000`.

## Common CLI Commands

```bash
npx playwright test                          # run all tests
npx playwright test eligibility-check.spec.ts  # run single file
npx playwright test --debug                  # open inspector
npx playwright test --headed                 # visible browser
npx playwright test --retries=2              # override retries
npx playwright test --workers=4              # parallel workers
npx playwright test --reporter=html          # HTML report only
npx playwright show-report                   # open last HTML report
npx playwright show-trace evidence/traces/trace.zip  # open trace viewer
npx playwright codegen http://localhost:3000  # record test actions
```
