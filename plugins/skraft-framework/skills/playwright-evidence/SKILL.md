---
name: playwright-evidence
description: >
  Use when capturing E2E test evidence (screenshots, videos, traces) and storing
  them in .copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/ for agents to consume. Covers
  Playwright setup, on-failure capture, trace collection, and evidence manifest
  generation.
---

# Playwright Evidence Skill

## Overview

For frontend stories, engineer captures evidence under the exact dispatched
story directory (normally `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/`).
Use the resolved tracking root and return actual repository-root-relative paths;
never infer today's directory or read pipeline state. Backend-only work does not
load browser capture.

```
Approved real E2E run → Engineer captures → Local manifest → Reviewed report refs
                       bounded success     all evidence     remote URLs or
                       + failure proof     retained         explicit local-only
```

`{story}` is the story slug passed as `SKRAFT_STORY_ID` env var (e.g. `42-add-eligibility-check`).
Use returned plan and evidence refs, not legacy phase-path conventions.

**Scope:** capture, name, store and list evidence. Engineer owns capture/manifest;
router consumes refs only. For report media selection load
[qa-reporting](../qa-reporting/SKILL.md), then its
[reporting contract](../qa-reporting/references/report-contract.md#media-boundary). No hosting or
automatic upload/push. Existing remote URLs must be verified; local paths are
local-only, never published attachments. Upload mechanism and consent require
separate agreement; warn that traces/screenshots may expose private data.

## Docker Dependency Freshness (MANDATORY)

Before running ANY e2e verification — first run or re-run after a fix — rebuild and restart every
Docker Compose / Testcontainers dependency the suite talks to (`docker compose down && docker compose
up -d --build`, or the equivalent Testcontainers container recreation). Do NOT reuse a container left
running from a previous session or a previous story.

**Why:** a stale container silently passes tests against yesterday's image — the suite is green but
proves nothing about the current code. This exact failure mode (e2e passing against an out-of-date
dependency container) reached DELIVER undetected on a prior epic and was only caught by a manual
rework pass. Treat it as a checklist item, not an optional troubleshooting step:

1. Tear down existing dependency containers for this story before the FIRST test run of the session.
2. Rebuild images (`--build` / equivalent) so local code/config changes are actually picked up.
3. Re-run the full e2e suite after every dependency rebuild — a partial re-run against a mixed
   old/new environment is worse than no run, since it produces a false-positive green.
4. Record the rebuild in the evidence manifest run notes (e.g. `containers: rebuilt`) so reviewers
   can see freshness was verified, not assumed.

## Playwright Setup (TypeScript)

Install dependencies:

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

Configure via `playwright.config.ts` at project root. Reference `references/playwright-ts-setup.md`
for full configuration options, parallel settings, and browser lifecycle management.

## Screenshot Capture

For an approved frontend journey, capture a bounded representative success
screenshot at its asserted outcome during the existing approved real test run.
Agree the optional success selection count; do not invent a default. Associate
each capture with AC, test, source revision and actual run result in the manifest.
Screenshot alone never proves correctness. Do not rerun tests for report cosmetics;
any additional reporting-only run needs explicit approval and cost warning.

Success-selection and report `maxMedia` limits never truncate correctness-gate
captures, failure diagnostics or reviewer inputs. Retain full local evidence.

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

Naming convention: `{test-title}-{timestamp}.png`. Output dir: `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/screenshots/`.
`{story}` comes from the `SKRAFT_STORY_ID` environment variable.
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

Set `outputDir` in `playwright.config.ts` to `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/${process.env.SKRAFT_STORY_ID}/evidence`
so Playwright writes all test-results (videos, traces) under the story-keyed path.
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
await context.tracing.stop({ path: `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/${process.env.SKRAFT_STORY_ID}/evidence/traces/trace.zip` });
```

View a trace locally: `npx playwright show-trace evidence/traces/trace.zip`

Traces contain DOM snapshots, network requests, console logs, and source context. Prefer traces
over screenshots when diagnosing flaky tests. Reference `references/trace-viewer.md` for all options.

## Test Report Generation

Configure multi-reporter output in `playwright.config.ts`:

```typescript
reporter: [
  ['html', { outputFolder: `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/${process.env.SKRAFT_STORY_ID}/evidence/reports` }],
  ['junit', { outputFile: `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/${process.env.SKRAFT_STORY_ID}/evidence/reports/results.xml` }],
],
// SKRAFT_STORY_ID must be set before running: e.g. SKRAFT_STORY_ID=42-add-eligibility-check npx playwright test
```

CLI equivalents:

```bash
npx playwright test --reporter=html
npx playwright test --reporter=junit
npx playwright show-report
```

Retain HTML/JUnit locally. Existing approved CI may expose artifacts/status checks;
without a verified remote URL, report them as local-only. Do not add uploads or
change CI solely to publish a report.

## Evidence Manifest

After the test run, write `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/manifest.md` so agents know what was captured.
The story key makes the manifest unambiguous when multiple stories run in sequence:

```markdown
# Evidence Manifest

## Run
- timestamp: 2026-05-15T10:30:00Z
- status: failed (2 failures, 8 passed)
- duration: 45s
- containers: rebuilt

## Files
| Type | Path | Test |
|---|---|---|
| screenshot | .copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/42-add-eligibility-check/evidence/screenshots/underage-driver-rejected-1715770200000.png | underage driver should be rejected |
| trace | .copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/42-add-eligibility-check/evidence/traces/policy-flow-1715770200000.zip | full policy flow |
| report | .copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/42-add-eligibility-check/evidence/reports/index.html | — |
| junit | .copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/42-add-eligibility-check/evidence/reports/results.xml | — |
```

Engineer returns the manifest's exact repository-root-relative path to router and
reviewer. Include AC/test mapping, revision, success/failure run status, verified
remote URL if already available, local-only status otherwise, and selection
omissions. Router never guesses the date or produces the manifest.

## CI Configuration

Only when CI setup/upload is separately authorized, adapt the existing job:

1. `actions/setup-node@v4` with Node 20
2. `npm ci`
3. `npx playwright install --with-deps chromium` (cache `~/.cache/ms-playwright`)
4. `npx playwright test --reporter=html,junit`
5. `actions/upload-artifact@v4` — upload `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/` on failure

Manifest consumption alone never authorizes a binary upload.
Reference `references/ci-configuration.md` for the full workflow YAML.

## Evidence Retention Policy

Add to `.gitignore`:

```
.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/
playwright-report/
test-results/
```

Preserve full local failure evidence and correctness proof; publication selection
never deletes it. Retain only agreed optional representative success captures,
without changing required gate capture. CI retention follows separately approved
policy; neither report `maxMedia` nor missing upload consent limits local proof.

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
