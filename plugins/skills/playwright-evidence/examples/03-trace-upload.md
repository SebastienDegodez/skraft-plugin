# Example 03 — Full Trace Capture (NUnit)

Domain: MonAssurance auto-insurance — eligibility form multi-step trace.

## Test Class

```csharp
// tests/MonAssurance.IntegrationTests/Tests/EligibilityTraceTests.cs
using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using NUnit.Framework;
using NUnit.Framework.Interfaces;

namespace MonAssurance.IntegrationTests.Tests;

/// <summary>
/// E2E tests with full Playwright trace capture.
/// Trace files (screenshots + DOM snapshots + network + source) are saved on failure.
/// Use `npx playwright show-trace &lt;file.zip&gt;` or trace.playwright.dev to inspect.
/// </summary>
[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class EligibilityTraceTests : PageTest
{
    private string _tracePath = string.Empty;

    public override BrowserNewContextOptions ContextOptions() => new()
    {
        BaseURL      = Environment.GetEnvironmentVariable("APP_BASE_URL") ?? "http://localhost:5000",
        ViewportSize = new() { Width = 1280, Height = 720 },
        Locale       = "fr-CA"
    };

    // ── Tracing Setup ──────────────────────────────────────────────────────

    [SetUp]
    public async Task StartTrace()
    {
        var traceDir = Path.Combine("evidence", "traces");
        Directory.CreateDirectory(traceDir);

        var safeName  = TestContext.CurrentContext.Test.FullName
            .Replace(' ', '_').Replace('/', '_');
        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        _tracePath = Path.Combine(traceDir, $"{safeName}-{timestamp}.zip");

        // Start tracing with all capture options enabled
        await Context.Tracing.StartAsync(new()
        {
            Screenshots = true,   // thumbnail per action in the Trace Viewer timeline
            Snapshots   = true,   // full DOM snapshot per action (enables "Pick locator" tool)
            Sources     = true,   // embed .cs source files — shows exactly which line ran
            Title       = $"{TestContext.CurrentContext.Test.FullName} — {DateTime.UtcNow:u}"
        });
    }

    [TearDown]
    public async Task StopTrace()
    {
        var failed = TestContext.CurrentContext.Result.Outcome.Status == TestStatus.Failed;

        if (failed)
        {
            // Save trace — retains all captured data for the failing test
            await Context.Tracing.StopAsync(new() { Path = _tracePath });
            TestContext.AddTestAttachment(_tracePath, "Playwright trace");
            TestContext.WriteLine($"Trace saved: {_tracePath}");
            TestContext.WriteLine($"Open with: npx playwright show-trace \"{_tracePath}\"");
        }
        else
        {
            // Discard trace — no evidence needed for passing tests
            await Context.Tracing.StopAsync(new());
        }
    }

    // ── Tests ──────────────────────────────────────────────────────────────

    [Test]
    [Description("Trace captures all actions for a valid driver submission")]
    public async Task Submit_ValidDriver_TraceCaptures_AllActions()
    {
        // Each action below appears as a separate step in the Trace Viewer timeline

        // Step: Navigate to eligibility form
        await Page.GotoAsync("/eligibility/check");
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        // Step: Fill driver details (Quebec, 30 years old, 10 years licensed, no accidents)
        await Page.FillAsync("[data-testid='driver-age']", "30");

        // Step: Province selection — triggers async validation call
        await Page.SelectOptionAsync("[data-testid='province']", "QC");
        await Page.WaitForResponseAsync("**/api/eligibility/province-rules");

        await Page.FillAsync("[data-testid='years-licensed']", "10");
        await Page.SelectOptionAsync("[data-testid='accident-count']", "0");

        // Step: Submit — triggers POST /api/eligibility/check
        await Page.ClickAsync("[data-testid='submit-eligibility']");

        // Step: Assert result visible
        await Expect(Page.Locator("[data-testid='eligibility-result']"))
            .ToBeVisibleAsync(new() { Timeout = 5000 });

        await Expect(Page.Locator("[data-testid='eligibility-result']"))
            .ToHaveTextAsync("Éligible");
    }

    [Test]
    [Description("Trace captures network error when eligibility API is unavailable")]
    public async Task Submit_ApiUnavailable_TraceCaptures_NetworkError()
    {
        // Intercept the eligibility API call and return a 503
        await Page.RouteAsync("**/api/eligibility/check", async route =>
        {
            await route.FulfillAsync(new()
            {
                Status      = 503,
                ContentType = "application/json",
                Body        = "{\"error\": \"Service temporarily unavailable\"}"
            });
        });

        await Page.GotoAsync("/eligibility/check");
        await Page.FillAsync("[data-testid='driver-age']", "30");
        await Page.SelectOptionAsync("[data-testid='province']", "QC");
        await Page.FillAsync("[data-testid='years-licensed']", "10");
        await Page.SelectOptionAsync("[data-testid='accident-count']", "0");
        await Page.ClickAsync("[data-testid='submit-eligibility']");

        // Expect the UI to display an error message
        await Expect(Page.Locator("[data-testid='api-error-banner']"))
            .ToBeVisibleAsync(new() { Timeout = 5000 });

        await Expect(Page.Locator("[data-testid='api-error-banner']"))
            .ToContainTextAsync("Service temporairement indisponible");
    }
}
```

## Inspecting the Trace Locally

After a failure, the trace file is at `evidence/traces/*.zip`.

```bash
# Open with npx (no global install needed)
npx playwright show-trace evidence/traces/EligibilityTraceTests-Submit_ValidDriver-20240514120000.zip

# Or via the Playwright PowerShell script
pwsh tests/MonAssurance.IntegrationTests/bin/Debug/net10.0/playwright.ps1 \
  show-trace evidence/traces/EligibilityTraceTests-Submit_ValidDriver-20240514120000.zip
```

The Trace Viewer opens at `http://localhost:XXXX` in your default browser showing:

- **Timeline** — every action with screenshots and timing
- **Network** — all HTTP requests including the eligibility API call
- **Console** — browser console output
- **Source** — the exact C# line that triggered each action
- **DOM Snapshot** — live HTML/CSS inspection at any point in the test

## Online Viewer (No Install)

Upload the `.zip` to [trace.playwright.dev](https://trace.playwright.dev) and share the URL
with reviewers who do not have Playwright installed.

## Evidence Output

```
evidence/
└── traces/
    └── MonAssurance.IntegrationTests.Tests.EligibilityTraceTests.Submit_ValidDriver_TraceCaptures_AllActions-20240514120000.zip
```
