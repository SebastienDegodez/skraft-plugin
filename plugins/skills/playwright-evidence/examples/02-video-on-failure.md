# Example 02 — Video Recording on Failure (xUnit)

Domain: MonAssurance auto-insurance — policy purchase flow.

## Test Class

```csharp
// tests/MonAssurance.IntegrationTests/Tests/PolicyPurchaseVideoTests.cs
using Microsoft.Playwright;
using Xunit;

namespace MonAssurance.IntegrationTests.Tests;

/// <summary>
/// xUnit-style E2E tests with context-level video recording.
/// Video is retained only when the test fails; deleted on pass to save storage.
/// </summary>
public class PolicyPurchaseVideoTests : IAsyncLifetime
{
    private IPlaywright _playwright = null!;
    private IBrowser    _browser    = null!;

    protected IBrowserContext Context = null!;
    protected IPage           Page    = null!;

    private string   _testName  = string.Empty;
    private bool     _testFailed;
    private string?  _videoPath;

    // ── Lifecycle ──────────────────────────────────────────────────────────

    public async Task InitializeAsync()
    {
        _playwright = await Playwright.CreateAsync();
        _browser    = await _playwright.Chromium.LaunchAsync(new()
        {
            Headless = true,
            Args     = ["--no-sandbox", "--disable-dev-shm-usage"]
        });

        var videoDir = Path.Combine("evidence", "videos");
        Directory.CreateDirectory(videoDir);

        Context = await _browser.NewContextAsync(new()
        {
            BaseURL         = Environment.GetEnvironmentVariable("APP_BASE_URL") ?? "http://localhost:5000",
            ViewportSize    = new() { Width = 1280, Height = 720 },
            RecordVideoDir  = videoDir,
            // Match viewport to avoid letterboxing in the recorded video
            RecordVideoSize = new() { Width = 1280, Height = 720 },
            Locale          = "fr-CA"
        });

        Page = await Context.NewPageAsync();
    }

    public async Task DisposeAsync()
    {
        // IMPORTANT: close context BEFORE reading video path — Playwright finalizes the .webm here
        await Context.CloseAsync();

        // Retrieve video path after context is closed
        _videoPath = await Page.Video?.PathAsync()!;

        if (_testFailed)
        {
            // Retain video — rename to a human-readable name
            if (_videoPath is not null && File.Exists(_videoPath))
            {
                var timestamp   = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
                var destination = Path.Combine("evidence", "videos",
                    $"{_testName}-failure-{timestamp}.webm");
                File.Move(_videoPath, destination, overwrite: true);
                _videoPath = destination;
            }
        }
        else
        {
            // Delete video on pass — no evidence needed for green tests
            if (_videoPath is not null && File.Exists(_videoPath))
                File.Delete(_videoPath);
        }

        await _browser.CloseAsync();
        _playwright.Dispose();
    }

    // ── Tests ──────────────────────────────────────────────────────────────

    [Fact(DisplayName = "Eligible driver can complete policy purchase flow")]
    public async Task EligibleDriver_CompletesPolicy_VideoRecorded()
    {
        _testName = nameof(EligibleDriver_CompletesPolicy_VideoRecorded);

        try
        {
            // Step 1: eligibility check
            await Page.GotoAsync("/eligibility/check");
            await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);
            await Page.FillAsync("[data-testid='driver-age']", "35");
            await Page.SelectOptionAsync("[data-testid='province']", "QC");
            await Page.FillAsync("[data-testid='years-licensed']", "15");
            await Page.SelectOptionAsync("[data-testid='accident-count']", "0");
            await Page.ClickAsync("[data-testid='submit-eligibility']");

            // Expect eligible — if this fails, the video captures the failed state
            var result = Page.Locator("[data-testid='eligibility-result']");
            await result.WaitForAsync(new() { State = WaitForSelectorState.Visible, Timeout = 5000 });

            var resultText = await result.InnerTextAsync();
            Assert.Equal("Éligible", resultText);

            // Step 2: proceed to policy selection
            await Page.ClickAsync("[data-testid='proceed-to-policy']");
            await Page.WaitForURLAsync("**/policy/select");

            // Step 3: select basic coverage
            await Page.ClickAsync("[data-testid='coverage-basic']");
            await Page.ClickAsync("[data-testid='add-to-cart']");

            await Page.WaitForURLAsync("**/policy/checkout");
            var confirmationHeading = Page.Locator("h1[data-testid='checkout-heading']");
            Assert.Equal("Récapitulatif de votre police", await confirmationHeading.InnerTextAsync());
        }
        catch
        {
            _testFailed = true;
            throw;
        }
    }

    [Fact(DisplayName = "Ineligible driver cannot proceed to policy purchase")]
    public async Task IneligibleDriver_CannotProceed_VideoRecorded()
    {
        _testName = nameof(IneligibleDriver_CannotProceed_VideoRecorded);

        try
        {
            await Page.GotoAsync("/eligibility/check");
            await Page.FillAsync("[data-testid='driver-age']", "17");
            await Page.SelectOptionAsync("[data-testid='province']", "QC");
            await Page.FillAsync("[data-testid='years-licensed']", "0");
            await Page.SelectOptionAsync("[data-testid='accident-count']", "2");
            await Page.ClickAsync("[data-testid='submit-eligibility']");

            var proceedButton = Page.Locator("[data-testid='proceed-to-policy']");
            await proceedButton.WaitForAsync(new() { State = WaitForSelectorState.Visible });

            // Button must be disabled for ineligible drivers
            var isDisabled = await proceedButton.IsDisabledAsync();
            Assert.True(isDisabled, "Proceed button should be disabled for ineligible driver");
        }
        catch
        {
            _testFailed = true;
            throw;
        }
    }
}
```

## Video File Location After Test

On failure, the video is renamed and placed in:

```
evidence/
└── videos/
    └── EligibleDriver_CompletesPolicy_VideoRecorded-failure-20240514120000.webm
```

## Converting WebM to MP4 (Optional)

Playwright records in WebM. Convert for wider compatibility:

```bash
ffmpeg -i evidence/videos/test-failure-20240514120000.webm \
       -c:v libx264 -crf 23 -preset fast \
       evidence/videos/test-failure-20240514120000.mp4
```

## Running

```bash
dotnet test tests/MonAssurance.IntegrationTests/ \
  --filter "FullyQualifiedName~PolicyPurchaseVideoTests" \
  --logger "console;verbosity=detailed"
```
