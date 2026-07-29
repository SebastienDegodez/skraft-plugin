# Example 01 — Basic Screenshot on Failure (TypeScript)

Domain: MonAssurance auto-insurance eligibility check page.

## Test File

```typescript
// tests/e2e/eligibility-check.spec.ts
import { test, expect } from '@playwright/test';

// On-failure screenshot hook — runs after every test in this file
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' });
  }
});

test('valid Quebec driver aged 30 should be eligible', async ({ page }) => {
  await page.goto('/eligibility/check');

  await page.getByTestId('driver-age').fill('30');
  await page.getByTestId('province').selectOption('QC');
  await page.getByTestId('years-licensed').fill('10');
  await page.getByTestId('accident-count').selectOption('0');
  await page.getByTestId('submit-eligibility').click();

  await expect(page.getByTestId('eligibility-result')).toHaveText('Éligible');
});

test('driver with 3 accidents should be rejected', async ({ page }) => {
  await page.goto('/eligibility/check');

  await page.getByTestId('driver-age').fill('22');
  await page.getByTestId('province').selectOption('QC');
  await page.getByTestId('years-licensed').fill('2');
  await page.getByTestId('accident-count').selectOption('3');
  await page.getByTestId('submit-eligibility').click();

  await expect(page.getByTestId('eligibility-result')).toHaveText('Non éligible');
  await expect(page.getByTestId('rejection-reason')).toBeVisible();
});
```

## CLI Commands

Run the test file:

```bash
npx playwright test eligibility-check.spec.ts
```

Debug interactively (opens Playwright Inspector):

```bash
npx playwright test --debug eligibility-check.spec.ts
```

Run headed (visible browser):

```bash
npx playwright test --headed eligibility-check.spec.ts
```

Open the HTML report after run:

```bash
npx playwright show-report
```

## Notes

- `testInfo.attach()` embeds the screenshot inline in the HTML report — no file path needed.
- `page.getByTestId()` uses the `data-testid` attribute by default (configurable in `playwright.config.ts` via `testIdAttribute`).
- `test.afterEach` is scoped to the file; move to a shared `fixtures.ts` to apply across all spec files.
