---
name: playwright-evidence
description: >
  Use when capturing E2E test evidence for a frontend story: the success screenshots
  recorded in the story's evidence log (the only evidence kept with the test plan), plus
  local-only failure diagnostics (videos, traces, reports). Covers Playwright setup,
  screenshot capture and recording, on-failure capture and trace collection.
---

# Playwright Evidence Skill

## Overview

For frontend stories, the engineer records the success screenshots in the story's evidence
directory (`.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/screenshots/`,
listed by the `evidence.screenshots` gate of its log). With the test plan, they are the evidence
the QA reads; nothing else is kept as evidence. Failure diagnostics (videos, traces, HTML and JUnit
reports) stay in Playwright's own `test-results/` and `playwright-report/` folders, local-only.
Use the resolved tracking root and return actual repository-root-relative paths;
never infer today's directory or read pipeline state. Backend-only work does not
load browser capture.

```
Approved real E2E run → Engineer captures   → evidence.screenshots → Reviewed report refs
                       mandatory success     hashed in the v7 log   remote URLs or
                       + failure proof       (Git-ignored)          explicit local-only
```

`{story}` is the story slug passed as `SKRAFT_STORY_ID` env var (e.g. `42-add-eligibility-check`).
Use returned plan and evidence refs, not legacy phase-path conventions.

**Scope:** capture, name and record screenshots. The engineer owns capture and recording; the
evidence log lists them, so no manifest is written; the router consumes refs only. For report media selection load
`qa-reporting`, then its
[reporting contract](references/report-contract.md#media-boundary). No hosting or
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
4. Say it in the change log (e.g. `containers: rebuilt`) so reviewers can see freshness was
   verified, not assumed.

## Playwright Setup (TypeScript)

Install dependencies:

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

Configure via `playwright.config.ts` at project root. Reference `references/playwright-ts-setup.md`
for full configuration options, parallel settings, and browser lifecycle management.

## Screenshot Capture

Screenshots are mandatory for a frontend story: one whose commits touch a `@visual`
scenario, `tests/e2e/`, a `package.json` declaring `react` or a `playwright.config.*`.
Capture at least one success screenshot per delivered journey at its asserted outcome,
during the real E2E run of the story, and name it after the scenario it shows. Record each PNG
with the stack adapter's `gate-log.mjs --log {evidence dir}/qg-{story}.json --screenshot <png>`
(on .NET, `qg-collect.mjs --screenshot <png>`): it copies the PNG into the story's evidence
directory (ignored by Git, never committed) and records it in the `evidence.screenshots` gate of
the v7 log (`quality-gates-evidence-contract`) with the sha256 of its bytes. A frontend story
without a screenshot fails `qg-verify`.
Screenshot alone never proves correctness. Do not rerun tests for report cosmetics.

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

Naming convention: `{test-title}-{timestamp}.png`, under Playwright's `test-results/`: a
failure screenshot is a local diagnostic, never recorded as evidence.
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

Keep Playwright's default `outputDir` (`test-results/`): videos and traces are local
diagnostics, never evidence.
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
await context.tracing.stop({ path: 'test-results/traces/trace.zip' });
```

View a trace locally: `npx playwright show-trace test-results/traces/trace.zip`

Traces contain DOM snapshots, network requests, console logs, and source context. Prefer traces
over screenshots when diagnosing flaky tests. Reference `references/trace-viewer.md` for all options.

## Test Report Generation

Configure multi-reporter output in `playwright.config.ts`:

```typescript
reporter: [
  ['html', { outputFolder: 'playwright-report' }],
  ['junit', { outputFile: 'playwright-report/results.xml' }],
],
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

## CI Configuration

Only when CI setup/upload is separately authorized, adapt the existing job:

1. `actions/setup-node@v4` with Node 20
2. `npm ci`
3. `npx playwright install --with-deps chromium` (cache `~/.cache/ms-playwright`)
4. `npx playwright test --reporter=html,junit`
5. `actions/upload-artifact@v4` — upload `playwright-report/` and `test-results/` on failure

Recording a screenshot never authorizes a binary upload.
Reference `references/ci-configuration.md` for the full workflow YAML.

## Evidence Retention Policy

Add to `.gitignore`:

```
.copilot-tracking/skraft-plans/*/evidence/
playwright-report/
test-results/
```

Preserve full local failure evidence and correctness proof; publication selection
never deletes it, nor any screenshot the `evidence.screenshots` gate cites. CI retention follows separately approved
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
