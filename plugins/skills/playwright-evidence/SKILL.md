---
name: playwright-evidence
description: >
  Use when capturing E2E test evidence (screenshots, videos, traces), uploading
  evidence to GitHub issue comments, or configuring Playwright in CI pipelines
  for the DELIVER phase and orchestrator feedback loop.
---

# Playwright Evidence Skill

## Overview

Evidence flows from test execution through capture to GitHub for traceability:

```
E2E Test Run  →  Capture Evidence  →  Upload to GitHub
Playwright       screenshots           issue comment
(on failure)     videos                with attachments
                 traces
                 test report
```

The orchestrator triggers evidence upload after each DELIVER phase run. Evidence links
back to the originating GitHub issue so reviewers see pass/fail proof inline.

## Playwright Setup (TypeScript)

Install dependencies:

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

Configure via `playwright.config.ts` at project root. Reference `references/playwright-ts-setup.md`
for full configuration options, parallel settings, and browser lifecycle management.

## Screenshot Capture

Wire an `afterEach` hook to capture on failure:

```typescript
import { test, expect } from '@playwright/test';

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshotPath = `evidence/screenshots/${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    testInfo.attachments.push({ name: 'screenshot', path: screenshotPath, contentType: 'image/png' });
  }
});
```

Naming convention: `{test-title}-{timestamp}.png`. Output dir: `evidence/screenshots/`.
Using `testInfo.attachments` makes the screenshot appear inline in the HTML report.
Reference `references/screenshot-and-video.md` for all `page.screenshot()` options and
on-failure hook patterns.

## Video Recording

Set `video: 'retain-on-failure'` in `playwright.config.ts`:

```typescript
use: {
  video: { mode: 'retain-on-failure', size: { width: 1280, height: 720 } },
}
```

CLI override: `npx playwright test --video=retain-on-failure`

Playwright writes the video file to `test-results/{test-name}/video.webm` automatically.
No manual context management required — the test runner handles lifecycle.
Reference `references/screenshot-and-video.md` for all video config options.

## Trace Files

Set `trace: 'retain-on-failure'` in `playwright.config.ts` for automatic capture:

```typescript
use: {
  trace: 'retain-on-failure',
}
```

CLI: `npx playwright test --trace=on` to capture traces for all tests.

For manual control within a test:

```typescript
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
// ... test steps ...
await context.tracing.stop({ path: 'evidence/traces/trace.zip' });
```

View a trace locally: `npx playwright show-trace evidence/traces/trace.zip`

Traces contain DOM snapshots, network requests, console logs, and source context. Prefer traces
over screenshots when diagnosing flaky tests. Reference `references/trace-viewer.md` for all options.

## Test Report Generation

Configure multi-reporter output in `playwright.config.ts`:

```typescript
reporter: [
  ['html', { outputFolder: 'evidence/reports' }],
  ['junit', { outputFile: 'evidence/reports/results.xml' }],
],
```

CLI equivalents:

```bash
npx playwright test --reporter=html
npx playwright test --reporter=junit
npx playwright show-report
```

The HTML report is uploaded as a CI artifact. The JUnit XML is consumed by CI status checks.

## GitHub Evidence Upload

After DELIVER phase tests complete, post evidence to the originating GitHub issue:

```bash
gh issue comment "$ISSUE_NUMBER" \
  --body-file evidence/comment-body.md \
  --repo "$GITHUB_REPOSITORY"
```

Compose `comment-body.md` with:
- Test run summary (pass/fail count, duration)
- Embedded screenshot if ≤500 KB (base64 inline image)
- Link to CI artifact for videos, traces, and HTML report
- Collapsible `<details>` block for full test output

For images >1 MB use the GitHub REST API to upload as an asset and link. Token requires
`repo` scope. Reference `references/evidence-upload-github.md` for REST API details,
body formatting, and rate limit guidance.

## CI Configuration

Structure the GitHub Actions job:

1. `actions/setup-node@v4` with Node 20
2. `npm ci`
3. `npx playwright install --with-deps chromium` (cache `~/.cache/ms-playwright`)
4. `npx playwright test --reporter=html,junit`
5. `actions/upload-artifact@v4` — upload `playwright-report/` and `evidence/` on failure
6. Post issue comment with evidence links using `gh` CLI

Reference `references/ci-configuration.md` for the full workflow YAML.

## Evidence Retention Policy

Add to `.gitignore`:

```
evidence/screenshots/
evidence/videos/
evidence/traces/
evidence/reports/
playwright-report/
test-results/
```

In CI, set `retention-days: 7` on `upload-artifact` for failure evidence. In test code, skip
writing evidence files when `testInfo.status === testInfo.expectedStatus` (test passed) to
avoid accumulating passing-run artifacts.

## References

- `references/playwright-ts-setup.md` — npm install, CLI, `playwright.config.ts`, parallel settings
- `references/screenshot-and-video.md` — `page.screenshot()` options, video recording, on-failure hooks
- `references/trace-viewer.md` — tracing config, `context.tracing` API, trace viewer CLI
- `references/evidence-upload-github.md` — GitHub REST API, `gh` CLI, body formatting, token scopes
- `references/ci-configuration.md` — full GitHub Actions workflow YAML, caching, secrets

## Examples

- `examples/01-basic-screenshot.md` — `afterEach` on-failure screenshot with eligibility test
- `examples/02-video-on-failure.md` — `retain-on-failure` video config, accessing video path
- `examples/03-trace-upload.md` — manual trace capture with all options, stop and save
- `examples/04-github-comment-evidence.md` — post-test evidence upload script for orchestrator
