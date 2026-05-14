# Trace Viewer Reference

## Config: `playwright.config.ts`

```typescript
use: {
  trace: 'retain-on-failure',  // recommended for CI
}
```

| Value | Behaviour |
|---|---|
| `'retain-on-failure'` | Capture trace for all tests, discard on pass, keep on failure |
| `'on'` | Always capture trace |
| `'on-first-retry'` | Capture only on first retry |
| `'off'` | No tracing (default) |

CLI: `npx playwright test --trace=on` — overrides config for all tests in the run.

## Manual Tracing API

### `context.tracing.start()` Options

```typescript
await context.tracing.start({
  screenshots: true,   // capture screenshot at every action
  snapshots:   true,   // full DOM snapshot per action (enables timeline scrubbing and "Pick locator")
  sources:     true,   // embed test source files in the trace (shows which line ran)
  title:       `${testInfo.title} — ${new Date().toISOString()}`,
});
```

| Option | Effect | Overhead |
|---|---|---|
| `screenshots: true` | Thumbnail per action in timeline | Low |
| `snapshots: true` | Full DOM + styles per action | Medium — required for timeline inspection |
| `sources: true` | Embeds `.ts` source files | Low — invaluable for CI debugging |
| `title` | Label shown in Trace Viewer header | None |

### `context.tracing.stop()` Options

```typescript
await context.tracing.stop({
  path: `evidence/traces/trace-${Date.now()}.zip`,
});
```

Omit `path` to discard (for passing tests):

```typescript
await context.tracing.stop();  // discards trace data
```

### On-Failure Pattern in `test.afterEach`

```typescript
test.afterEach(async ({ context }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const tracePath = `evidence/traces/${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.zip`;
    await context.tracing.stop({ path: tracePath });
    await testInfo.attach('trace', { path: tracePath, contentType: 'application/zip' });
  } else {
    await context.tracing.stop();  // discard on pass
  }
});
```

### Full Test Wrapper Pattern

```typescript
import { test, expect } from '@playwright/test';

test('full policy flow with trace', async ({ page, context }) => {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    await page.goto('/eligibility/check');
    // ... test steps ...
    await expect(page.getByTestId('policy-number')).toBeVisible();
  } finally {
    await context.tracing.stop({ path: `evidence/traces/policy-flow-${Date.now()}.zip` });
  }
});
```

## Trace File Structure

A `.zip` trace file contains:

```
trace.zip
├── trace.trace          # binary action log
├── trace.network        # network requests/responses
├── resources/
│   ├── *.jpeg           # screenshot thumbnails
│   ├── *.png            # DOM snapshots (rendered)
│   └── *.dat            # raw DOM snapshots
└── src/                 # embedded source files (when sources: true)
    └── tests/e2e/eligibility-check.spec.ts
```

## What the Trace Captures

| Category | Details Captured |
|---|---|
| Actions | Click, fill, navigate, wait — with before/after DOM snapshots |
| Assertions | `expect(locator).toBeVisible()` outcomes |
| Network | Request URL, method, status, headers, request/response body |
| Console | `console.log`, `console.error`, `console.warn` from the page |
| Source | Line of `.ts` test code that triggered each action |
| Screenshots | Thumbnail per action (with `screenshots: true`) |

## Opening a Trace

### Local CLI

```bash
npx playwright show-trace evidence/traces/trace.zip
```

### Online Viewer

Upload `.zip` to [trace.playwright.dev](https://trace.playwright.dev) — no install required.

## `testInfo.attachments` for Report Integration

```typescript
await testInfo.attach('trace', {
  path:        'evidence/traces/trace.zip',
  contentType: 'application/zip',
});
```

Attaching makes the trace file accessible directly from the HTML report.
Suitable for sharing traces with team members without Playwright installed.

## Traces vs Screenshots — When to Use Which

| Situation | Use |
|---|---|
| Quick confirmation of final UI state | Screenshot |
| Diagnosing which action caused a failure | Trace |
| Flaky test with intermittent network issues | Trace (inspect Network tab) |
| Sharing evidence with non-technical stakeholders | Screenshot or video |
| Debugging a locator that stopped working | Trace (DOM snapshot in timeline) |
| CI artifact for automated comment | Screenshot (small size) + trace link |

## Output Directory

```
evidence/
└── traces/     # .zip files, one per failing test
```

Add to `.gitignore`:

```
evidence/traces/
```
