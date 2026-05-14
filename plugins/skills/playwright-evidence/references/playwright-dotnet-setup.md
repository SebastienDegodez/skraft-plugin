# Playwright .NET Setup Reference

## NuGet Packages

```xml
<!-- MonAssurance.IntegrationTests.csproj -->
<ItemGroup>
  <PackageReference Include="Microsoft.Playwright" Version="1.44.0" />
  <PackageReference Include="Microsoft.Playwright.NUnit" Version="1.44.0" />
</ItemGroup>

<!-- MSTest variant (choose one test framework) -->
<PackageReference Include="Microsoft.Playwright.MSTest" Version="1.44.0" />

<!-- xUnit variant -->
<PackageReference Include="Microsoft.Playwright.Xunit" Version="1.44.0" />
```

## Browser Installation

Run after every `dotnet restore` or package update:

```bash
# PowerShell (cross-platform)
pwsh bin/Debug/net10.0/playwright.ps1 install --with-deps chromium

# Install all browsers
pwsh bin/Debug/net10.0/playwright.ps1 install --with-deps

# CI: explicit path
dotnet build
pwsh tests/MonAssurance.IntegrationTests/bin/Debug/net10.0/playwright.ps1 install --with-deps chromium
```

## Project Structure

```
tests/
└── MonAssurance.IntegrationTests/
    ├── MonAssurance.IntegrationTests.csproj
    ├── playwright.config.json          # optional static config
    ├── PageObjects/
    │   ├── EligibilityCheckPage.cs
    │   └── PolicySummaryPage.cs
    ├── Tests/
    │   ├── EligibilityCheckTests.cs
    │   └── PolicyFlowTests.cs
    ├── Fixtures/
    │   └── BrowserFixture.cs
    └── evidence/                       # gitignored
        ├── screenshots/
        ├── videos/
        ├── traces/
        └── reports/
```

## Configuration File

`playwright.config.json` is read by Playwright's built-in config loader:

```json
{
  "use": {
    "baseURL": "http://localhost:5000",
    "headless": true,
    "viewport": { "width": 1280, "height": 720 },
    "ignoreHTTPSErrors": true,
    "screenshot": "only-on-failure",
    "video": "retain-on-failure",
    "trace": "on-first-retry"
  },
  "timeout": 30000,
  "expect": {
    "timeout": 5000
  },
  "retries": 2,
  "workers": 4,
  "outputDir": "evidence"
}
```

## Code-Based Configuration

Override any config value in code via `BrowserNewContextOptions`:

```csharp
var contextOptions = new BrowserNewContextOptions
{
    BaseURL = Environment.GetEnvironmentVariable("APP_BASE_URL") ?? "http://localhost:5000",
    ViewportSize = new() { Width = 1280, Height = 720 },
    RecordVideoDir = "evidence/videos",
    RecordVideoSize = new() { Width = 1280, Height = 720 },
    IgnoreHTTPSErrors = true,
    Locale = "fr-CA",                   // MonAssurance targets Quebec market
    TimezoneId = "America/Montreal"
};
```

## Dependency Injection Patterns

Playwright interfaces available for DI / constructor injection:

| Interface | Scope | Purpose |
|---|---|---|
| `IPlaywright` | Session | Factory for browser types |
| `IBrowser` | Session | Browser instance (reuse across tests) |
| `IBrowserContext` | Test | Isolated context per test |
| `IPage` | Test | Single page within a context |

### NUnit Browser Lifecycle with `[SetUpFixture]`

```csharp
// Fixtures/BrowserFixture.cs
using Microsoft.Playwright;
using NUnit.Framework;

[SetUpFixture]
public class BrowserFixture
{
    public static IPlaywright PlaywrightInstance { get; private set; } = null!;
    public static IBrowser Browser { get; private set; } = null!;

    [OneTimeSetUp]
    public async Task GlobalSetup()
    {
        PlaywrightInstance = await Playwright.CreateAsync();
        Browser = await PlaywrightInstance.Chromium.LaunchAsync(new()
        {
            Headless = true,
            Args = ["--no-sandbox", "--disable-dev-shm-usage"]  // required in CI
        });
    }

    [OneTimeTearDown]
    public async Task GlobalTearDown()
    {
        await Browser.CloseAsync();
        PlaywrightInstance.Dispose();
    }
}
```

### Per-Test Context (NUnit)

```csharp
public class EligibilityCheckTests : PageTest
{
    // PageTest base class provides: Page, Context, Browser, BrowserType
    // Override options:
    public override BrowserNewContextOptions ContextOptions() => new()
    {
        BaseURL = "http://localhost:5000",
        RecordVideoDir = "evidence/videos"
    };
}
```

### Manual Context (xUnit)

```csharp
public class EligibilityCheckTests : IAsyncLifetime
{
    private IPlaywright _playwright = null!;
    private IBrowser _browser = null!;
    protected IBrowserContext Context = null!;
    protected IPage Page = null!;

    public async Task InitializeAsync()
    {
        _playwright = await Playwright.CreateAsync();
        _browser = await _playwright.Chromium.LaunchAsync(new() { Headless = true });
        Context = await _browser.NewContextAsync(new()
        {
            BaseURL = "http://localhost:5000",
            RecordVideoDir = "evidence/videos"
        });
        Page = await Context.NewPageAsync();
    }

    public async Task DisposeAsync()
    {
        await Context.CloseAsync();   // finalizes video
        await _browser.CloseAsync();
        _playwright.Dispose();
    }
}
```

## Parallel Execution Settings

NUnit parallel test execution config (`NUnit.runsettings`):

```xml
<?xml version="1.0" encoding="utf-8"?>
<RunSettings>
  <NUnit>
    <NumberOfTestWorkers>4</NumberOfTestWorkers>
  </NUnit>
  <Playwright>
    <BrowserName>chromium</BrowserName>
    <LaunchOptions>
      <Headless>true</Headless>
    </LaunchOptions>
  </Playwright>
</RunSettings>
```

Each parallel worker gets its own `IBrowserContext`, sharing the `IBrowser` instance.
Never share `IPage` or `IBrowserContext` across parallel tests.

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `PLAYWRIGHT_BROWSERS_PATH` | Cache dir for browser binaries | `~/.cache/ms-playwright` |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | Skip install in CI if cached | `0` |
| `APP_BASE_URL` | Override base URL per environment | `http://localhost:5000` |
| `GITHUB_ISSUE_NUMBER` | Target issue for evidence upload | — |
| `GITHUB_TOKEN` | Auth for `gh` CLI evidence upload | — |
