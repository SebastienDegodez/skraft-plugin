---
name: playwright-evidence
description: >
  Use when capturing E2E test evidence (screenshots, videos, traces) and storing
  them in .copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/ for agents to consume. Covers
  Playwright setup, on-failure capture, trace collection, evidence manifest
  generation; the engine, not the agent, publishes the captures in the pull request.
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

`{story}` is the story slug (e.g. `42-add-eligibility-check`); the Playwright config reads it
from the `SKRAFT_STORY_ID` environment variable. Use the evidence folder the brief names.

**Scope:** capture, name, store and list evidence, and publish it only on the one path below.
For report media selection load `qa-reporting`, then its
[reporting contract](references/report-contract.md#media-boundary).

## Publishing: the engine only

Never push captures, comment on a pull request, or upload evidence anywhere. The skraft engine's
`visuals` workflow node runs `commands.e2e`, reads `skraft-visuals/manifest.json` under the
component, commits the screenshots it lists and shows them in the pull request, after the
developer's consent. Capture locally and end your result with `published: no (the engine publishes)`.

For the engine to show a screenshot:

- Name the Playwright projects `light` and `dark` (`use: { colorScheme: 'light' | 'dark' }`).
- Write each screenshot as a `.png` under `skraft-visuals/` in the component, and list it in
  `skraft-visuals/manifest.json`: `{ "screenshots": [{ "title": "<alt text>", "theme": "light" | "dark", "path": "skraft-visuals/<name>.png" }] }`,
  `path` relative to the component's root.
- Never take or list a screenshot that shows credentials, tokens or personal data; traces stay local.

## Docker Dependency Freshness (MANDATORY)

Before ANY e2e run — first run or re-run after a fix — rebuild and restart every Docker Compose
or Testcontainers dependency the suite talks to. Never reuse a container left running from a
previous session or story.

1. Tear down the story's dependency containers before the FIRST test run of the session
   (`docker compose down`).
2. Rebuild the images so local code and config changes are picked up
   (`docker compose up -d --build`, or the equivalent Testcontainers recreation).
3. Re-run the full e2e suite after every rebuild; never a partial re-run against a mixed
   old/new environment.
4. Record the rebuild in the manifest run notes (`containers: rebuilt`).

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
// SKRAFT_STORY_ID holds the story slug in the environment of `npx playwright test`
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

Return the manifest's exact repository-root-relative path. Include AC/test mapping, revision,
success/failure run status, the published URL when the `visuals` path published it,
local-only status otherwise, and selection omissions.

## CI Configuration

Only when the developer asks for CI setup, adapt the existing job:

1. `actions/setup-node@v4` with Node 20
2. `npm ci`
3. `npx playwright install --with-deps chromium` (cache `~/.cache/ms-playwright`)
4. `npx playwright test --reporter=html,junit`
5. `actions/upload-artifact@v4` — upload `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/` on failure

A CI artifact is never a publication path for the pull request.
Reference `references/ci-configuration.md` for the full workflow YAML.

## Evidence Retention Policy

Add to `.gitignore`:

```
playwright-report/
test-results/
```

Keep the story's evidence folder out of `.gitignore`: the `visuals` path commits it. Preserve
full local failure evidence and correctness proof; publication selection never deletes it.
Report `maxMedia` and a missing consent never limit local proof.

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
