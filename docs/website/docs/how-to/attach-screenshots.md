---
title: "Attach a front end's screenshots"
description: "Declare the e2e command, add a Playwright reporter and let the run attach light and dark screenshots to its pull request."
persona: software-engineer
---

# Attach a front end's screenshots

Have a run attach the screenshots of a front end's e2e tests to its pull request.

## Prerequisites

- A run that publishes its pull request ([Publish a run's pull request](./publish-pull-request.md)).
- A front end with Playwright tests: a `react` component, or any component with `commands.e2e`.

## Steps

For such a component, the `visuals` node runs `commands.e2e` after the DELIVER review.

1. Declare the front end's e2e command:

   ```json
   { "name": "web", "root": "web", "stack": "react",
     "commands": { "test": "npm test", "e2e": "npx playwright test" } }
   ```

2. Add two projects and a reporter to the front end's Playwright configuration:

   ```ts
   // playwright.config.ts
   import { defineConfig } from '@playwright/test'

   export default defineConfig({
     projects: [
       { name: 'light', use: { colorScheme: 'light' } },
       { name: 'dark', use: { colorScheme: 'dark' } },
     ],
     reporter: [['list'], ['./skraft-visuals-reporter.ts']],
   })
   ```

   ```ts
   // skraft-visuals-reporter.ts
   import { mkdirSync, writeFileSync } from 'node:fs'
   import { relative } from 'node:path'
   import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

   export default class SkraftVisuals implements Reporter {
     private screenshots: Array<{ title: string, theme: string, path: string }> = []

     onTestEnd(test: TestCase, result: TestResult) {
       const theme = test.parent.project()?.name ?? ''
       for (const { name, path, contentType } of result.attachments) {
         if (contentType === 'image/png' && path) this.screenshots.push({ title: name, theme, path: relative(process.cwd(), path).split('\\').join('/') })
       }
     }

     onEnd() {
       mkdirSync('skraft-visuals', { recursive: true })
       writeFileSync('skraft-visuals/manifest.json', JSON.stringify({ screenshots: this.screenshots }))
     }
   }
   ```

3. In a test, take the screenshot under `skraft-visuals/` and attach it with its title:

   ```ts
   const path = `skraft-visuals/checkout-${testInfo.project.name}.png`
   await page.screenshot({ path, fullPage: true })
   await testInfo.attach('Checkout, card paid', { path, contentType: 'image/png' })
   ```

4. Add `skraft-visuals/` to the front end's `.gitignore`.
5. Answer `ACCEPTED` to the `reporting-consent` question (header `Reporting`), or write
   `"visuals": true` under `publish`.

Result: the screenshots are committed alone on the branch
(`docs(evidence): screenshots of <components>`) and the pull request's Screenshots section shows
them, the dark ones folded. Screenshots are evidence, not a gate: a failing e2e run does not stop
the run.

## Troubleshooting

### `not published (consent): skraft-config.json sets publish.visuals to false`

Write `"visuals": true` under `publish` if the screenshots show no private data.

### `skraft-visuals/manifest.json is missing or is not an object with a screenshots list`

Check that the reporter is declared and that `commands.e2e` runs Playwright from the component's root.

## Next steps <!-- #next-steps -->

- [Publish a run's pull request](./publish-pull-request.md)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
