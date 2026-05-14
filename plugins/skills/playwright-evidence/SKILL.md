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

## Playwright Setup (.NET)

Add NuGet packages to the test project:

```xml
<PackageReference Include="Microsoft.Playwright" Version="1.44.*" />
<PackageReference Include="Microsoft.Playwright.NUnit" Version="1.44.*" />
<!-- OR for MSTest: -->
<PackageReference Include="Microsoft.Playwright.MSTest" Version="1.44.*" />
```

Install browser binaries after restore:

```bash
pwsh bin/Debug/net10.0/playwright.ps1 install --with-deps chromium
```

Configure via `playwright.config.json` at project root or via `BrowserNewContextOptions` in code.
Reference `references/playwright-dotnet-setup.md` for full configuration options, parallel settings,
and browser lifecycle management with `[SetUpFixture]`.

## Screenshot Capture

Call `page.ScreenshotAsync()` on test failure. Always capture with `FullPage = true` for full context.

```csharp
var screenshotPath = Path.Combine("evidence", "screenshots",
    $"{TestContext.CurrentContext.Test.Name}-{DateTime.UtcNow:yyyyMMddHHmmss}.png");
await page.ScreenshotAsync(new() { Path = screenshotPath, FullPage = true });
```

Naming convention: `{test-name}-{timestamp}.png`. Output dir: `evidence/screenshots/`.
Wire capture into `TearDown` (NUnit) or `Dispose` / `IAsyncLifetime.DisposeAsync` (xUnit).
Reference `references/screenshot-and-video.md` for all `ScreenshotAsync` options and on-failure
hook patterns for both NUnit and MSTest.

## Video Recording

Pass `RecordVideoDir` when creating the browser context:

```csharp
await using var context = await browser.NewContextAsync(new()
{
    RecordVideoDir = "evidence/videos",
    RecordVideoSize = new() { Width = 1280, Height = 720 }
});
```

Always call `context.CloseAsync()` before reading the video path — Playwright finalizes the file on
context close. Only retain the video file when the test fails; delete on pass to save storage.
Output dir: `evidence/videos/`. Reference `references/screenshot-and-video.md`.

## Trace Files

Wrap every test with tracing:

```csharp
await context.Tracing.StartAsync(new()
{
    Screenshots = true,
    Snapshots = true,
    Sources = true
});
// ... test steps ...
await context.Tracing.StopAsync(new()
{
    Path = $"evidence/traces/{testName}-{timestamp}.zip"
});
```

Traces contain DOM snapshots, network requests, console logs, and source context. Use
`npx playwright show-trace <trace.zip>` locally for debugging. Prefer traces over screenshots
when diagnosing flaky tests. Reference `references/trace-viewer.md` for all options.

## Test Report Generation

Configure multi-reporter output for both human review and CI parsing:

```bash
dotnet test -- NUnit.DefaultTestNamePattern="{m}" \
  --logger "html;LogFileName=evidence/reports/report.html" \
  --logger "junit;LogFileName=evidence/reports/results.xml"
```

Output dir: `evidence/reports/`. The HTML report is uploaded as a CI artifact. The JUnit XML is
consumed by CI status checks and coverage gates.

## GitHub Evidence Upload

After DELIVER phase tests complete, post evidence to the originating GitHub issue:

```bash
gh issue comment "$ISSUE_NUMBER" \
  --body "$(cat evidence/comment-body.md)" \
  --repo "$GITHUB_REPOSITORY"
```

Compose `comment-body.md` with:
- Test run summary (pass/fail count, duration)
- Embedded screenshot if ≤500KB (base64 inline image)
- Link to CI artifact for videos, traces, and HTML report
- Collapsible `<details>` block for full test output

For images >1MB use the GitHub REST API to upload as asset and link. Token requires
`repo` scope. Reference `references/evidence-upload-github.md` for REST API details,
body formatting, and rate limit guidance.

## CI Configuration

Structure the GitHub Actions job:

1. `actions/setup-dotnet` with the project's .NET version
2. `dotnet restore` + `dotnet build`
3. `playwright install --with-deps chromium` (cache `~/.cache/ms-playwright`)
4. `dotnet test` with evidence output dirs set via env vars
5. `actions/upload-artifact` — upload `evidence/` on failure (always + `if: failure()`)
6. Post issue comment with evidence links using `gh` CLI

Set `PLAYWRIGHT_BROWSERS_PATH` for caching. Use `--retries=2` for flaky test resilience.
Reference `references/ci-configuration.md` for the full workflow YAML.

## Evidence Retention Policy

Add to `.gitignore`:

```
evidence/screenshots/
evidence/videos/
evidence/traces/
evidence/reports/
```

In CI, set `retention-days: 7` on `upload-artifact` for failure evidence. Delete local evidence
dir at the start of each test run to prevent stale files from previous runs being uploaded.
After successful GitHub comment post, evidence dirs may be purged from the runner.

## References

- `references/playwright-dotnet-setup.md` — NuGet, CLI, config, parallel settings, browser lifecycle
- `references/screenshot-and-video.md` — `ScreenshotAsync` options, video recording, on-failure hooks
- `references/trace-viewer.md` — `StartTracingAsync` options, trace structure, debugging workflow
- `references/evidence-upload-github.md` — GitHub REST API, `gh` CLI, body formatting, token scopes
- `references/ci-configuration.md` — Full GitHub Actions workflow YAML, caching, secrets

## Examples

- `examples/01-basic-screenshot.md` — NUnit on-failure screenshot with auto-insurance eligibility test
- `examples/02-video-on-failure.md` — Context-level video recording, conditional save on failure
- `examples/03-trace-upload.md` — Full trace capture with all options, stop and save
- `examples/04-github-comment-evidence.md` — Post-test evidence upload script for orchestrator
