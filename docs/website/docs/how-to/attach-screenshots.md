---
title: "Attach QA evidence"
description: "The QA evidence a pull request carries (test plan, scenario outcomes, screenshots) and how a front end's screenshots get attached, on GitHub and Azure DevOps."
persona: software-engineer
---

# Attach QA evidence

Have a run's pull request carry its QA evidence: the test plan, each scenario's outcome and a front
end's screenshots. The engine renders all three from the run's journal and the signed trace of
the software engineer's runs; no agent writes a QA report.

## What the pull request carries

- **QA**, under its heading: `QA: 14/14 scenarios passed on <sha> (run r12, 45 s).`, the test
  plan's path, and *Delivered is not deployed*.
- **Scenario outcomes**, folded: one row per scenario, `| # | Scenario | AC | Component | RED | Green | Final run | Named in log | Screenshot |`.
  A scenario is `passed` only when its acceptance test is still its red commit's, a green commit
  delivered its group, and the whole test suite of its component (the last traced `test` run under
  it) passed on the final commit. Anything else is `not proven`, with why: missing is never
  passed. *Named in log* says whether that run's log names the scenario's test (`S3_…`,
  `test_S3_…`); *Screenshot* lists the themes, light first, of the screenshots whose manifest
  entry names it (`"scenario": "S3"`), else of those titled after it (`S3 …`, or its title).
- **Tests**, folded: the test plan, whole.
- **Screenshots**, folded: what follows.

On Azure DevOps, whose description takes 4,000 characters, the QA line stays in the description
and the folded table goes to a `skraft · run details` thread. `qa-report.md`, in the tracking
folder, shows the same QA line and table after each step.

## Screenshots

### Prerequisites

- A run that publishes its pull request ([Publish a run's pull request](./publish-pull-request.md)).
- A front end with Playwright tests: a `react` component, or any component with `commands.e2e`.

### Steps

skraft never starts the e2e command. The software engineer runs it through `skraft_repl` with
`gate('e2e', …)` on its last commit, like the component's other gates; after the DELIVER review the
`visuals` node reads that traced run and the one manifest it left, `skraft-visuals/manifest.json`.

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
     private screenshots: Array<{ title: string, theme: string, path: string, scenario?: string }> = []

     onTestEnd(test: TestCase, result: TestResult) {
       const theme = test.parent.project()?.name ?? ''
       const scenario = /^S\d+\b/.exec(test.title)?.[0]
       for (const { name, path, contentType } of result.attachments) {
         if (contentType === 'image/png' && path) this.screenshots.push({ title: name, theme, path: relative(process.cwd(), path).split('\\').join('/'), ...(scenario ? { scenario } : {}) })
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
5. Write `"visuals": true` under `publish`, with `"questionVersions": { "visuals": 2 }`, or let
   `/skraft-init` ask you for it. Until it is settled, a run that would publish screenshots is
   refused.

Result: the pull request's Screenshots section shows the first six screenshots of each theme,
the dark ones folded. How they get there depends on the forge:

- **GitHub**: they stay where Playwright wrote them, nothing is committed. The body refers to each
  by its path from the folder of the body's file (`../../../web/skraft-visuals/checkout.png`), and
  `gh pr create` or `gh pr edit`, started from that folder, uploads it with `--attach`, rewriting the
  reference. A screenshot whose path holds a `#` is refused when the manifest is read: gh takes
  what follows `#` for the alt text. When the description is longer than a pull request takes
  (60,000 characters), the Screenshots section goes to a comment of the run details:
  `gh pr comment --attach` posts that comment with its screenshots, and the comment it replaces is
  emptied, never deleted; skraft reads the comment back and says which did not attach, and the
  next `skraft publish` posts it again. skraft reads the body back and says which screenshots did not attach. `skraft doctor`
  warns when your gh has no `--attach` (gh 2.103.3 has it); with such a gh, skraft opens or updates
  the pull request without its screenshots, says why in its Screenshots section and in the
  publication's reason, and journals `pull-request.screenshots-skipped`.
- **Azure DevOps**: `az` sends no file as a binary body, so the pull request's attachments cannot
  be reached. skraft commits the screenshots alone on the branch
  (`docs(evidence): screenshots of <components>`), under the story's `evidence/` folder, and links
  each by the repository's Items route at that commit. `skraft doctor` warns when the `azure-devops`
  extension of the Azure CLI is missing. That Azure Repos shows those images is not yet measured on
  a real organisation.

skraft checks each file with Git alone before it attaches or commits it: a symbolic link, a path
beyond one, or a file that is not a PNG is refused. Before that, a front end whose root is itself a
symbolic link has none of its files read, its manifest included. Screenshots are evidence, not a gate: a
failing e2e run does not stop the run.

## Troubleshooting

### `not published (consent): skraft-config.json sets publish.visuals to false`

Write `"visuals": true` under `publish` if the screenshots show no private data.

### `skraft-visuals/manifest.json is missing or is not an object with a screenshots list`

Check that the reporter is declared and that `commands.e2e` runs Playwright from the component's root.

### `no traced e2e run`

The software engineer did not run `gate('e2e', …)` for that front end: check that the component
declares `commands.e2e`, which puts it in the engineer's brief.

### `2 screenshots did not attach: …`

gh opened or updated the pull request but could not upload those files. Run `skraft publish` again
once gh can reach GitHub; the body still refers to them by their path.

## Next steps <!-- #next-steps -->

- [Publish a run's pull request](./publish-pull-request.md)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
