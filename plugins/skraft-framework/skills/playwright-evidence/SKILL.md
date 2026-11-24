---
name: playwright-evidence
description: >
  Use when a front end's e2e tests must leave screenshots for the pull request, or keep
  failure evidence (videos, traces, reports) local. Covers Playwright setup, the light and dark
  projects, the skraft-visuals/manifest.json the engine reads, on-failure capture and traces;
  the engine, not the agent, shows the screenshots in the pull request.
---

# Playwright Evidence Skill

## Overview

One manifest exists: `skraft-visuals/manifest.json` under the front end's root, written by the
Playwright reporter of the component when its e2e run ends. The engine starts no e2e command:
you run the component's e2e command through `skraft_repl` with
`gate('e2e', <the e2e command of your brief>, { cwd: <the component's root> })`, on your last
commit, like every other gate. After the DELIVER review the engine's `visuals` node reads the last
traced e2e run of each front end and the manifest it left, and, with the developer's consent,
shows the screenshots in the pull request: on GitHub gh attaches each one to it; on Azure DevOps
the engine commits them on the working branch and links each at its commit.

Never push captures, comment on a pull request, upload evidence or write a report of your own.
Backend-only work loads no browser capture.

## The manifest the engine reads

- Name the Playwright projects `light` and `dark` (`use: { colorScheme: 'light' | 'dark' }`).
- Write each screenshot as a `.png` under `skraft-visuals/` in the component, and list it in
  `skraft-visuals/manifest.json`: `{ "screenshots": [{ "title": "<alt text>", "theme": "light" | "dark", "path": "skraft-visuals/<name>.png" }] }`,
  `path` relative to the component's root, with no `..`, no `#` and no symbolic link on the way.
- Give each screenshot of a scenario `"scenario": "S<n>"`, its number in the test plan (the reporter
  takes it from a test title that starts with `S<n>`): the QA table's Screenshot column of S<n> names
  its themes. An entry without `scenario` counts for the scenario its title names (`S<n> …`, or the
  scenario's title itself); give no other value.
- The pull request shows the first 6 screenshots of each theme of a component, light first, dark folded.
- Keep `skraft-visuals/` in the component's `.gitignore`.
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
4. Say in your result that the containers were rebuilt.

## Playwright Setup (TypeScript)

Install dependencies:

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

Configure via `playwright.config.ts` at project root. Reference `references/playwright-ts-setup.md`
for full configuration options, parallel settings, and browser lifecycle management.

## Screenshot Capture

For an approved frontend journey, take one screenshot at its asserted outcome during the e2e run
you trace, in each theme, under `skraft-visuals/`, attached with its title
(`testInfo.attach('<title>', { path, contentType: 'image/png' })`) so the reporter lists it.
A screenshot never proves correctness: the scenario's assertion does. Never rerun the tests to
improve a screenshot.

Wire an `afterEach` hook to capture on failure, kept local, out of `skraft-visuals/`:

```typescript
import { test, expect } from '@playwright/test';

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshotPath = `test-results/failures/${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    testInfo.attachments.push({ name: 'screenshot', path: screenshotPath, contentType: 'image/png' });
  }
});
```

Naming convention: `{test-title}-{timestamp}.png`, under `test-results/`, which stays local.
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

Videos and traces go to Playwright's `outputDir` (`test-results/` by default), which stays local.
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
  ['list'],
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ['./skraft-visuals-reporter.ts'],
],
```

CLI equivalents:

```bash
npx playwright test --reporter=html
npx playwright test --reporter=junit
npx playwright show-report
```

Keep HTML and JUnit reports local. Do not add uploads or change CI to publish a report.

## The reporter that writes the manifest

`examples/04-evidence-manifest.md` holds the reporter: it lists each PNG attachment of a test under
`skraft-visuals/` with its title and its project's theme, and writes `skraft-visuals/manifest.json`
when the run ends. Write no other manifest.

## CI Configuration

Only when the developer asks for CI setup, adapt the existing job:

1. `actions/setup-node@v4` with Node 20
2. `npm ci`
3. `npx playwright install --with-deps chromium` (cache `~/.cache/ms-playwright`)
4. `npx playwright test --reporter=html,junit`
5. `actions/upload-artifact@v4` — upload `test-results/` and `playwright-report/` on failure

A CI artifact is never a publication path for the pull request.
Reference `references/ci-configuration.md` for the full workflow YAML.

## Evidence Retention Policy

Add to the component's `.gitignore`:

```
playwright-report/
test-results/
skraft-visuals/
```

A missing consent never limits local proof: the screenshots stay on disk, unpublished.

## References

- `references/playwright-ts-setup.md` — npm install, CLI, `playwright.config.ts`, parallel settings
- `references/screenshot-and-video.md` — `page.screenshot()` options, video recording, on-failure hooks
- `references/trace-viewer.md` — tracing config, `context.tracing` API, trace viewer CLI
- `references/ci-configuration.md` — full GitHub Actions workflow YAML, caching, secrets

## Examples

- `examples/01-basic-screenshot.md` — `afterEach` on-failure screenshot with eligibility test
- `examples/02-video-on-failure.md` — `retain-on-failure` video config, accessing video path
- `examples/03-trace-upload.md` — manual trace capture with all options, stop and save
- `examples/04-evidence-manifest.md` — the reporter that writes `skraft-visuals/manifest.json`
