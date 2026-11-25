# Example 04 — The manifest the engine reads

Domain: MonAssurance auto-insurance eligibility check, front end in `web/`.

The engine reads one manifest, `skraft-visuals/manifest.json` under the front end's root, once the
e2e run you traced with `gate('e2e', …)` ends. A reporter of the component writes it.

## Configuration

```typescript
// web/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
  reporter: [['list'], ['./skraft-visuals-reporter.ts']],
});
```

## Reporter

```typescript
// web/skraft-visuals-reporter.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class SkraftVisuals implements Reporter {
  private screenshots: Array<{ title: string; theme: string; path: string; scenario?: string }> = [];

  onTestEnd(test: TestCase, result: TestResult) {
    const theme = test.parent.project()?.name ?? '';
    const scenario = /^S\d+\b/.exec(test.title)?.[0];
    for (const { name, path, contentType } of result.attachments) {
      const shown = path ? relative(process.cwd(), path).split('\\').join('/') : '';
      if (contentType === 'image/png' && shown.startsWith('skraft-visuals/')) this.screenshots.push({ title: name, theme, path: shown, ...(scenario ? { scenario } : {}) });
    }
  }

  onEnd() {
    mkdirSync('skraft-visuals', { recursive: true });
    writeFileSync('skraft-visuals/manifest.json', JSON.stringify({ screenshots: this.screenshots }, null, 2));
  }
}
```

## A test that leaves its screenshot

```typescript
test('S2 an underage driver is told they are not eligible', async ({ page }, testInfo) => {
  await page.goto('/quote');
  await page.getByLabel('Birth date').fill('2010-04-01');
  await page.getByRole('button', { name: 'Check eligibility' }).click();
  await expect(page.getByRole('alert')).toHaveText('Drivers under 18 are not eligible');

  const path = `skraft-visuals/underage-rejected-${testInfo.project.name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach('Underage driver rejected', { path, contentType: 'image/png' });
});
```

## What the run leaves

```json
{
  "screenshots": [
    { "title": "Underage driver rejected", "theme": "light", "path": "skraft-visuals/underage-rejected-light.png", "scenario": "S2" },
    { "title": "Underage driver rejected", "theme": "dark", "path": "skraft-visuals/underage-rejected-dark.png", "scenario": "S2" }
  ]
}
```

Run it through `skraft_design_repl`, from the component's root, on your last commit:

```javascript
await gate('e2e', 'npx playwright test', { cwd: 'web' })
```

Report the run in your result; never copy, commit or upload the screenshots: the engine shows them.
