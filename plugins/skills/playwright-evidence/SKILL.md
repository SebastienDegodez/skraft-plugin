---
name: playwright-evidence
description: >
  Use when capturing E2E test evidence (screenshots, videos, traces) and storing
  them in .skraft/sdlc/evidence/ for agents to consume. Covers Playwright setup,
  on-failure capture, trace collection, and evidence manifest generation.
---

# Playwright Evidence Skill

## Overview

This skill captures evidence and stores it in `.skraft/sdlc/evidence/`. Agents read the
evidence manifest and decide what to publish (GitHub comment, CI artifact, etc.).

```
E2E Test Run  →  Capture Evidence  →  Write Manifest  →  Agent publishes
Playwright       screenshots           .skraft/sdlc/      (orchestrator
(on failure)     videos                evidence/          or other agent)
                 traces                manifest.md
                 report
```

**Scope of this skill:** capture, name, store, and list evidence. Publishing is the agent's responsibility.

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

Naming convention: `{test-title}-{timestamp}.png`. Output dir: `.skraft/sdlc/evidence/screenshots/`.
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

Playwright writes the video file to `.skraft/sdlc/evidence/videos/{test-name}/video.webm`.
Set `outputDir: '.skraft/sdlc/evidence'` in `playwright.config.ts` to keep all artifacts co-located.
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
await context.tracing.stop({ path: '.skraft/sdlc/evidence/traces/trace.zip' });
```

View a trace locally: `npx playwright show-trace evidence/traces/trace.zip`

Traces contain DOM snapshots, network requests, console logs, and source context. Prefer traces
over screenshots when diagnosing flaky tests. Reference `references/trace-viewer.md` for all options.

## Test Report Generation

Configure multi-reporter output in `playwright.config.ts`:

```typescript
reporter: [
  ['html', { outputFolder: '.skraft/sdlc/evidence/reports' }],
  ['junit', { outputFile: '.skraft/sdlc/evidence/reports/results.xml' }],
],
```

CLI equivalents:

```bash
npx playwright test --reporter=html
npx playwright test --reporter=junit
npx playwright show-report
```

The HTML report is uploaded as a CI artifact. The JUnit XML is consumed by CI status checks.

## Evidence Manifest

After the test run, write `.skraft/sdlc/evidence/manifest.md` so agents know what was captured:

```markdown
# Evidence Manifest

## Run
- timestamp: 2026-05-15T10:30:00Z
- status: failed (2 failures, 8 passed)
- duration: 45s

## Files
| Type | Path | Test |
|---|---|---|
| screenshot | .skraft/sdlc/evidence/screenshots/underage-driver-rejected-1715770200000.png | underage driver should be rejected |
| trace | .skraft/sdlc/evidence/traces/policy-flow-1715770200000.zip | full policy flow |
| report | .skraft/sdlc/evidence/reports/index.html | — |
| junit | .skraft/sdlc/evidence/reports/results.xml | — |
```

The orchestrator reads this manifest to decide what to surface in GitHub comments or CI artifacts.

## CI Configuration

Structure the GitHub Actions job:

1. `actions/setup-node@v4` with Node 20
2. `npm ci`
3. `npx playwright install --with-deps chromium` (cache `~/.cache/ms-playwright`)
4. `npx playwright test --reporter=html,junit`
5. `actions/upload-artifact@v4` — upload `.skraft/sdlc/evidence/` on failure

Agents that consume the manifest handle publishing (GitHub comment, PR annotation, etc.).
Reference `references/ci-configuration.md` for the full workflow YAML.

## Evidence Retention Policy

Add to `.gitignore`:

```
.skraft/sdlc/evidence/
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
- `references/ci-configuration.md` — full GitHub Actions workflow YAML, caching, secrets

## Examples

- `examples/01-basic-screenshot.md` — `afterEach` on-failure screenshot with eligibility test
- `examples/02-video-on-failure.md` — `retain-on-failure` video config, accessing video path
- `examples/03-trace-upload.md` — manual trace capture with all options, stop and save
- `examples/04-evidence-manifest.md` — writing the manifest after a test run
