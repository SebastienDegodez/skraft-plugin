# Example 02 — Video Recording on Failure (TypeScript)

Domain: MonAssurance auto-insurance — eligibility check video evidence.

## `playwright.config.ts` — Video Config

```typescript
// playwright.config.ts excerpt
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    video: { mode: 'retain-on-failure', size: { width: 1280, height: 720 } },
  },
});
```

## Test File

```typescript
// tests/e2e/eligibility-video.spec.ts
import { test, expect } from '@playwright/test';

test('underage driver should be rejected', async ({ page }) => {
  await page.goto('/eligibility/check');

  await page.getByTestId('driver-age').fill('16');
  await page.getByTestId('province').selectOption('QC');
  await page.getByTestId('years-licensed').fill('0');
  await page.getByTestId('accident-count').selectOption('0');
  await page.getByTestId('submit-eligibility').click();

  // Expect rejection — if this assertion fails, the video is retained
  await expect(page.getByTestId('eligibility-result')).toHaveText('Non éligible');
  await expect(page.getByTestId('rejection-reason')).toContainText('âge minimum');
});

test('eligible driver completes full flow', async ({ page }) => {
  await page.goto('/eligibility/check');

  await page.getByTestId('driver-age').fill('35');
  await page.getByTestId('province').selectOption('QC');
  await page.getByTestId('years-licensed').fill('15');
  await page.getByTestId('accident-count').selectOption('0');
  await page.getByTestId('submit-eligibility').click();

  await expect(page.getByTestId('eligibility-result')).toHaveText('Éligible');
  await expect(page.getByTestId('proceed-to-quote')).toBeVisible();
});
```

## Accessing the Video Path

To attach the video to the test report explicitly:

```typescript
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const videoPath = await page.video()?.path();
    if (videoPath) {
      await testInfo.attach('video', { path: videoPath, contentType: 'video/webm' });
    }
  }
});
```

## CLI Commands

Run with video retained on failure:

```bash
npx playwright test --video=retain-on-failure
```

Always record video (all tests):

```bash
npx playwright test --video=on
```

## Video Output Location

Playwright saves videos to:

```
test-results/{test-title}-{browser}/video.webm
```

When using `retain-on-failure`, videos for passing tests are deleted automatically.
For failing tests, the `.webm` file stays and is linked in the HTML report.
