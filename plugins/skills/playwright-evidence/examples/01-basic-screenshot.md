# Example 01 — Basic Screenshot on Failure (NUnit)

Domain: MonAssurance auto-insurance eligibility check page.

## Test Class

```csharp
// tests/MonAssurance.IntegrationTests/Tests/EligibilityCheckTests.cs
using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using NUnit.Framework;
using NUnit.Framework.Interfaces;

namespace MonAssurance.IntegrationTests.Tests;

/// <summary>
/// E2E tests for the eligibility check feature.
/// Captures a screenshot on failure and attaches it to the NUnit test result.
/// </summary>
[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class EligibilityCheckTests : PageTest
{
    private const string EligibilityPath = "/eligibility/check";

    // Override base class options to set baseURL from environment
    public override BrowserNewContextOptions ContextOptions() => new()
    {
        BaseURL       = Environment.GetEnvironmentVariable("APP_BASE_URL") ?? "http://localhost:5000",
        ViewportSize  = new() { Width = 1280, Height = 720 },
        Locale        = "fr-CA",
        TimezoneId    = "America/Montreal"
    };

    // ── Tests ──────────────────────────────────────────────────────────────

    [Test]
    [Description("A valid Quebec driver aged 30 with no accidents should be eligible")]
    public async Task Submit_ValidDriver_ShouldShowEligibleResult()
    {
        // Arrange
        await Page.GotoAsync(EligibilityPath);
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        // Act — fill driver form
        await Page.FillAsync("[data-testid='driver-age']", "30");
        await Page.SelectOptionAsync("[data-testid='province']", "QC");
        await Page.FillAsync("[data-testid='years-licensed']", "10");
        await Page.SelectOptionAsync("[data-testid='accident-count']", "0");
        await Page.ClickAsync("[data-testid='submit-eligibility']");

        // Assert
        await Expect(Page.Locator("[data-testid='eligibility-result']"))
            .ToHaveTextAsync("Éligible", new() { Timeout = 5000 });

        await Expect(Page.Locator("[data-testid='eligibility-status']"))
            .ToHaveAttributeAsync("data-status", "eligible");
    }

    [Test]
    [Description("A driver with 3 accidents in the last 3 years should be rejected")]
    public async Task Submit_HighRiskDriver_ShouldShowRejectedResult()
    {
        await Page.GotoAsync(EligibilityPath);
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        await Page.FillAsync("[data-testid='driver-age']", "22");
        await Page.SelectOptionAsync("[data-testid='province']", "QC");
        await Page.FillAsync("[data-testid='years-licensed']", "2");
        await Page.SelectOptionAsync("[data-testid='accident-count']", "3");
        await Page.ClickAsync("[data-testid='submit-eligibility']");

        await Expect(Page.Locator("[data-testid='eligibility-result']"))
            .ToHaveTextAsync("Non éligible", new() { Timeout = 5000 });
    }

    // ── Evidence Capture ───────────────────────────────────────────────────

    [TearDown]
    public async Task CaptureScreenshotOnFailure()
    {
        // Only capture evidence on test failure — skip on pass to save storage
        if (TestContext.CurrentContext.Result.Outcome.Status != TestStatus.Failed)
            return;

        var screenshotDir = Path.Combine("evidence", "screenshots");
        Directory.CreateDirectory(screenshotDir);

        // Naming: {test-name}-{utc-timestamp}.png
        var safeName  = TestContext.CurrentContext.Test.FullName
            .Replace(' ', '_').Replace('(', '-').Replace(')', '-');
        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var fileName  = $"{safeName}-{timestamp}.png";
        var path      = Path.Combine(screenshotDir, fileName);

        // Full-page screenshot captures content below the fold
        await Page.ScreenshotAsync(new()
        {
            Path       = path,
            FullPage   = true,
            Type       = ScreenshotType.Png,
            Animations = ScreenshotAnimations.Disabled  // freeze CSS to avoid blurry frames
        });

        // Attach to NUnit result — visible in the test report and as CI artifact
        TestContext.AddTestAttachment(path, $"Failure screenshot — {TestContext.CurrentContext.Test.Name}");

        TestContext.WriteLine($"Screenshot saved: {path}");
    }
}
```

## Page Object (Optional — Recommended for Maintainability)

```csharp
// tests/MonAssurance.IntegrationTests/PageObjects/EligibilityCheckPage.cs
using Microsoft.Playwright;

namespace MonAssurance.IntegrationTests.PageObjects;

/// <summary>Wraps the eligibility check page for readable test code.</summary>
public class EligibilityCheckPage(IPage page)
{
    private readonly IPage _page = page;

    public async Task NavigateAsync() =>
        await _page.GotoAsync("/eligibility/check");

    public async Task FillDriverFormAsync(int age, string province, int yearsLicensed, int accidentCount)
    {
        await _page.FillAsync("[data-testid='driver-age']", age.ToString());
        await _page.SelectOptionAsync("[data-testid='province']", province);
        await _page.FillAsync("[data-testid='years-licensed']", yearsLicensed.ToString());
        await _page.SelectOptionAsync("[data-testid='accident-count']", accidentCount.ToString());
    }

    public async Task SubmitAsync() =>
        await _page.ClickAsync("[data-testid='submit-eligibility']");

    public ILocator EligibilityResult  => _page.Locator("[data-testid='eligibility-result']");
    public ILocator EligibilityStatus  => _page.Locator("[data-testid='eligibility-status']");
}
```

## Running the Test

```bash
# Run all eligibility tests
dotnet test tests/MonAssurance.IntegrationTests/ \
  --filter "FullyQualifiedName~EligibilityCheckTests"

# Run with evidence output visible
dotnet test tests/MonAssurance.IntegrationTests/ \
  --filter "FullyQualifiedName~EligibilityCheckTests" \
  --logger "console;verbosity=detailed"
```

## Evidence Output

On failure, the test writes:

```
evidence/
└── screenshots/
    └── MonAssurance.IntegrationTests.Tests.EligibilityCheckTests.Submit_ValidDriver_ShouldShowEligibleResult-20240514120000.png
```
