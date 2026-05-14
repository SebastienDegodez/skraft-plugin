# Trace Viewer Reference

## `StartTracingAsync` Options

```csharp
await context.Tracing.StartAsync(new TracingStartOptions
{
    Screenshots = true,    // capture screenshot at every action
    Snapshots   = true,    // capture DOM snapshot at every action (enables timeline scrubbing)
    Sources     = true,    // embed test source files in the trace (shows which line ran)
    Title       = $"{TestContext.CurrentContext.Test.FullName} — {DateTime.UtcNow:u}"
});
```

| Option | Effect | Overhead |
|---|---|---|
| `Screenshots = true` | Thumbnail per action in timeline | Low |
| `Snapshots = true` | Full DOM + styles per action | Medium — enables "Pick locator" and timeline inspection |
| `Sources = true` | Embeds `.cs` source files | Low — invaluable for CI debugging |
| `Title` | Label shown in Trace Viewer header | None |

## `StopTracingAsync` Options

```csharp
await context.Tracing.StopAsync(new TracingStopOptions
{
    Path = Path.Combine("evidence", "traces",
        $"{testName}-{DateTime.UtcNow:yyyyMMddHHmmss}.zip")
});
```

`Path` is required if you want to save the trace. Omit to discard (e.g., on passing tests).

### Stop Without Saving (Passing Tests)

```csharp
if (TestContext.CurrentContext.Result.Outcome.Status == TestStatus.Passed)
    await context.Tracing.StopAsync(new());  // discard
else
    await context.Tracing.StopAsync(new() { Path = tracePath });
```

## Chunked Tracing (Long Tests)

For long-running tests, use chunks to avoid memory pressure:

```csharp
await context.Tracing.StartChunkAsync(new() { Title = "Step: navigate to eligibility" });
// ... actions ...
await context.Tracing.StopChunkAsync(new() { Path = "evidence/traces/step1.zip" });

await context.Tracing.StartChunkAsync(new() { Title = "Step: submit form" });
// ... actions ...
await context.Tracing.StopChunkAsync(new() { Path = "evidence/traces/step2.zip" });
```

## Trace File Structure

A `.zip` trace file contains:

```
trace.zip
├── trace.trace          # binary action log (protobuf)
├── trace.network        # network requests/responses
├── resources/
│   ├── *.jpeg           # screenshot thumbnails
│   ├── *.png            # DOM snapshots (rendered)
│   └── *.dat            # raw DOM snapshots
└── src/                 # embedded source files (when Sources=true)
    └── Tests/EligibilityCheckTests.cs
```

## What the Trace Captures

| Category | Details Captured |
|---|---|
| Actions | Click, fill, navigate, wait — with before/after DOM snapshots |
| Assertions | `Expect(locator).ToBeVisible()` outcomes |
| Network | Request URL, method, status, headers, request/response body |
| Console | `console.log`, `console.error`, `console.warn` from the page |
| Source | Line of `.cs` test code that triggered each action |
| Screenshots | Thumbnail per action (with `Screenshots = true`) |

## Opening a Trace

### Local (npx)

```bash
npx playwright show-trace evidence/traces/test-name-20240514T120000.zip
```

### Local (dotnet tool)

```bash
pwsh bin/Debug/net10.0/playwright.ps1 show-trace evidence/traces/test-name.zip
```

### Online Viewer

Upload `.zip` to [trace.playwright.dev](https://trace.playwright.dev) — no install required.
Suitable for sharing traces with team members without Playwright installed.

## Traces vs Screenshots — When to Use Which

| Situation | Use |
|---|---|
| Quick confirmation of final UI state | Screenshot |
| Diagnosing which action caused a failure | Trace |
| Flaky test with intermittent network issues | Trace (inspect Network tab) |
| Sharing evidence with non-technical stakeholders | Screenshot or video |
| Debugging a locator that stopped working | Trace (DOM snapshot in timeline) |
| CI artifact for automated comment | Screenshot (small size) + trace link |

## Output Directory

```
evidence/
└── traces/     # .zip files, one per failing test
```

Add to `.gitignore`:

```
evidence/traces/
```

## NUnit Integration Pattern

```csharp
[SetUp]
public async Task StartTracing()
{
    await Context.Tracing.StartAsync(new()
    {
        Screenshots = true,
        Snapshots   = true,
        Sources     = true,
        Title       = TestContext.CurrentContext.Test.FullName
    });
}

[TearDown]
public async Task StopTracing()
{
    var failed  = TestContext.CurrentContext.Result.Outcome.Status == TestStatus.Failed;
    var dirPath = Path.Combine("evidence", "traces");
    Directory.CreateDirectory(dirPath);

    if (failed)
    {
        var tracePath = Path.Combine(dirPath,
            $"{TestContext.CurrentContext.Test.FullName.Replace('/', '_')}-{DateTime.UtcNow:yyyyMMddHHmmss}.zip");
        await Context.Tracing.StopAsync(new() { Path = tracePath });
        TestContext.AddTestAttachment(tracePath, "Playwright trace");
    }
    else
    {
        await Context.Tracing.StopAsync(new());  // discard
    }
}
```
