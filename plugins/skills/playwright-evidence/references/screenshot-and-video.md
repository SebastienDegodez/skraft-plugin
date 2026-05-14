# Screenshot and Video Reference

## `ScreenshotAsync` Options

```csharp
await page.ScreenshotAsync(new PageScreenshotOptions
{
    Path          = "evidence/screenshots/test-name-20240514T120000.png",
    FullPage      = true,         // capture entire scrollable page (default: false)
    Type          = ScreenshotType.Png,   // Png | Jpeg
    Quality       = 80,           // Jpeg only, 0–100
    OmitBackground = false,       // transparent background for Png
    Clip = new Clip              // capture specific region
    {
        X = 0, Y = 0, Width = 800, Height = 600
    },
    Timeout       = 5000,         // ms, default: 30000
    Animations    = ScreenshotAnimations.Disabled,  // freeze CSS animations
    Caret         = ScreenshotCaret.Hide,            // hide text cursor
    Scale         = ScreenshotScale.Css,             // Css | Device
    Mask          = new[] { page.Locator(".sensitive-data") }  // grey out elements
});
```

### Element Screenshot

```csharp
var element = page.Locator("#eligibility-result");
await element.ScreenshotAsync(new LocatorScreenshotOptions
{
    Path    = "evidence/screenshots/eligibility-result.png",
    Type    = ScreenshotType.Png,
    Timeout = 5000
});
```

## File Naming Convention

Pattern: `{test-class}-{test-method}-{timestamp}.{ext}`

```csharp
private static string EvidenceName(string prefix, string ext)
{
    var testName = TestContext.CurrentContext.Test.FullName
        .Replace(' ', '_')
        .Replace('(', '_')
        .Replace(')', '_');
    var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
    return $"{prefix}-{testName}-{timestamp}.{ext}";
}
// Usage:
var path = Path.Combine("evidence", "screenshots", EvidenceName("screenshot", "png"));
```

## On-Failure Hook — NUnit

```csharp
[TearDown]
public async Task CaptureEvidenceOnFailure()
{
    if (TestContext.CurrentContext.Result.Outcome.Status == TestStatus.Failed)
    {
        var screenshotDir = Path.Combine("evidence", "screenshots");
        Directory.CreateDirectory(screenshotDir);

        var fileName = EvidenceName("failure", "png");
        await Page.ScreenshotAsync(new() { Path = Path.Combine(screenshotDir, fileName), FullPage = true });

        TestContext.AddTestAttachment(Path.Combine(screenshotDir, fileName), "Failure screenshot");
    }
}
```

## On-Failure Hook — MSTest

```csharp
[TestCleanup]
public async Task CaptureEvidenceOnFailure()
{
    if (TestContext.CurrentTestOutcome == UnitTestOutcome.Failed)
    {
        var screenshotDir = Path.Combine("evidence", "screenshots");
        Directory.CreateDirectory(screenshotDir);

        var fileName = $"failure-{TestContext.TestName}-{DateTime.UtcNow:yyyyMMddHHmmss}.png";
        var path = Path.Combine(screenshotDir, fileName);
        await Page.ScreenshotAsync(new() { Path = path, FullPage = true });

        TestContext.AddResultFile(path);
    }
}
```

## On-Failure Hook — xUnit (IAsyncLifetime)

```csharp
public async Task DisposeAsync()
{
    // xUnit does not have an outcome API; check a flag set in the test
    if (_testFailed)
    {
        await Page.ScreenshotAsync(new()
        {
            Path = Path.Combine("evidence", "screenshots",
                $"failure-{_testName}-{DateTime.UtcNow:yyyyMMddHHmmss}.png"),
            FullPage = true
        });
    }
    await Context.CloseAsync();
    await _browser.CloseAsync();
    _playwright.Dispose();
}
```

---

## Video Recording

### Context-Level Option

```csharp
var context = await browser.NewContextAsync(new BrowserNewContextOptions
{
    RecordVideoDir  = "evidence/videos",
    RecordVideoSize = new RecordVideoSize { Width = 1280, Height = 720 }
});
```

### Retrieve Video Path

Always call `context.CloseAsync()` **before** reading the path:

```csharp
await Context.CloseAsync();   // Playwright finalizes the .webm file here
var videoPath = await Page.Video!.PathAsync();
```

### Video Formats

Playwright records in **WebM** (VP8 codec). Convert to MP4 with ffmpeg if needed:

```bash
ffmpeg -i evidence/videos/test.webm evidence/videos/test.mp4
```

### Conditional Retain (Delete on Pass)

```csharp
[TearDown]
public async Task ManageVideoEvidence()
{
    var failed = TestContext.CurrentContext.Result.Outcome.Status == TestStatus.Failed;

    await Context.CloseAsync();  // finalize video

    if (!failed)
    {
        var videoPath = await Page.Video!.PathAsync();
        if (File.Exists(videoPath))
            File.Delete(videoPath);
    }
    else
    {
        var videoPath = await Page.Video!.PathAsync();
        TestContext.AddTestAttachment(videoPath, "Failure video");
    }
}
```

### RecordVideoSize Recommendations

| Use Case | Width | Height |
|---|---|---|
| Desktop viewport | 1280 | 720 |
| Mobile viewport | 390 | 844 |
| CI (reduce file size) | 800 | 600 |

Video size should match `ViewportSize` to avoid letterboxing.

## Output Directories

```
evidence/
├── screenshots/    # .png files, named by test + timestamp
└── videos/         # .webm files, named by context ID (auto) or renamed on close
```

Add to `.gitignore`:

```
evidence/screenshots/
evidence/videos/
```
