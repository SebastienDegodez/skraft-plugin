# Screenshot and Video Reference

## `page.screenshot()` Options

```typescript
await page.screenshot({
  path:            'evidence/screenshots/test-name.png',
  fullPage:        true,         // capture entire scrollable page (default: false)
  type:            'png',        // 'png' | 'jpeg'
  quality:         80,           // jpeg only, 0–100
  omitBackground:  false,        // transparent background for png
  clip:            { x: 0, y: 0, width: 800, height: 600 },  // capture specific region
  timeout:         5000,         // ms, default: 30000
  animations:      'disabled',   // freeze CSS animations
  caret:           'hide',       // hide text cursor
  scale:           'css',        // 'css' | 'device'
  mask:            [page.locator('.sensitive-data')],  // grey out elements
});
```

### Locator Screenshot

```typescript
const element = page.locator('#eligibility-result');
await element.screenshot({
  path:    'evidence/screenshots/eligibility-result.png',
  type:    'png',
  timeout: 5000,
});
```

### Attach to Report via `testInfo`

```typescript
const screenshot = await page.screenshot({ fullPage: true });
await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' });
```

Using `testInfo.attach()` embeds the screenshot inline in the HTML report.

## File Naming Convention

Pattern: `{test-title}-{timestamp}.png`

```typescript
const safeName = testInfo.title.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
const screenshotPath = `evidence/screenshots/${safeName}-${Date.now()}.png`;
```

## On-Failure Hook — `test.afterEach`

```typescript
import { test } from '@playwright/test';

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshotPath = `evidence/screenshots/${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    testInfo.attachments.push({ name: 'screenshot', path: screenshotPath, contentType: 'image/png' });
  }
});
```

## Video Configuration

Set in `playwright.config.ts`:

```typescript
use: {
  video: 'retain-on-failure',
  // Or with size options:
  video: { mode: 'retain-on-failure', size: { width: 1280, height: 720 } },
}
```

| Value | Behaviour |
|---|---|
| `'on'` | Record video for every test |
| `'retain-on-failure'` | Record all, delete on pass, keep on failure |
| `'on-first-retry'` | Record only on first retry |
| `'off'` | No recording (default) |

CLI override: `npx playwright test --video=retain-on-failure`

### Accessing the Video Path After Test

```typescript
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const videoPath = await page.video()?.path();
    if (videoPath) {
      testInfo.attachments.push({ name: 'video', path: videoPath, contentType: 'video/webm' });
    }
  }
});
```

Playwright writes to `test-results/{test-name}/video.webm` by default. The video is finalized
after the test context closes — always access `page.video()?.path()` in `afterEach`, not inline.

## Combined CLI Options

```bash
npx playwright test --screenshot=only-on-failure --video=retain-on-failure
```

## Output Directories

```
evidence/
├── screenshots/    # .png files, named by test title + timestamp
├── videos/         # .webm files (from test-results/ or custom path)
playwright-report/  # default HTML report output
test-results/       # default artifacts (videos, traces, screenshots)
```

Add to `.gitignore`:

```
evidence/screenshots/
evidence/videos/
playwright-report/
test-results/
```
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

## Output Directories

```
evidence/
├── screenshots/    # .png files, named by test title + timestamp
├── videos/         # .webm files (from test-results/ or custom path)
playwright-report/  # default HTML report output
test-results/       # default artifacts (videos, traces, screenshots)
```

Add to `.gitignore`:

```
evidence/screenshots/
evidence/videos/
playwright-report/
test-results/
```
