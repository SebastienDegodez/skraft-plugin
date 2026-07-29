# Example 03 — Full Trace Capture (TypeScript)

Domain: MonAssurance auto-insurance — eligibility form multi-step trace.

## Test File with Manual Trace Capture

```typescript
// tests/e2e/eligibility-trace.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('full policy flow with trace', async ({ page, context }) => {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  try {
    // Step: Navigate to eligibility form
    await page.goto('/eligibility/check');
    await page.waitForLoadState('networkidle');

    // Step: Fill driver details (Quebec, 30 years old, 10 years licensed, no accidents)
    await page.getByTestId('driver-age').fill('30');

    // Step: Province selection — may trigger async validation
    await page.getByTestId('province').selectOption('QC');

    await page.getByTestId('years-licensed').fill('10');
    await page.getByTestId('accident-count').selectOption('0');

    // Step: Submit — triggers POST /api/eligibility/check
    await page.getByTestId('submit-eligibility').click();

    // Step: Verify eligibility result
    await expect(page.getByTestId('eligibility-result')).toHaveText('Éligible');

    // Step: Proceed to quote
    await page.getByTestId('proceed-to-quote').click();
    await expect(page.getByTestId('policy-number')).toBeVisible();
  } finally {
    const traceDir = 'evidence/traces';
    fs.mkdirSync(traceDir, { recursive: true });
    const tracePath = path.join(traceDir, `policy-flow-${Date.now()}.zip`);
    await context.tracing.stop({ path: tracePath });
  }
});
```

## Using `test.afterEach` for Automatic On-Failure Traces

```typescript
// tests/e2e/eligibility-check.spec.ts
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
});

test.afterEach(async ({ context }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const tracePath = `evidence/traces/${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.zip`;
    await context.tracing.stop({ path: tracePath });
    await testInfo.attach('trace', { path: tracePath, contentType: 'application/zip' });
  } else {
    await context.tracing.stop();  // discard on pass
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
```

## CLI Commands

Capture traces for all tests:

```bash
npx playwright test --trace=on
```

Capture traces only on first retry (recommended for CI):

```bash
npx playwright test --trace=on-first-retry
```

Open the trace viewer:

```bash
npx playwright show-trace evidence/traces/policy-flow-*.zip
```

## Notes

- `context.tracing.stop()` without a `path` discards the trace silently.
- `testInfo.attach('trace', ...)` makes the trace downloadable from the HTML report.
- Trace `.zip` files can also be opened at [trace.playwright.dev](https://trace.playwright.dev).
