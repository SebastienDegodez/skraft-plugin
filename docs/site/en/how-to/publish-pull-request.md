---
layout: doc
lang: en
title: "Publish a run's pull request"
description: "Consent to publishing, set up gh and the remote, let the run open its pull request or publish it with skraft publish, follow the run on its issue and attach a front end's screenshots."
persona: software-engineer
---

# Publish a run's pull request

**Goal**: a completed run pushes its branch and opens (or updates) its pull request, with its
description rendered from the journal.

## Prerequisites

- A repository with a GitHub, GitHub Enterprise or Azure DevOps remote (`origin`, else the first remote).
- `gh` installed (`az`, the Azure CLI, on Azure DevOps: see [On Azure DevOps](#azure-devops)); Git and ssh able to push without asking for a password.
- Work on a branch of your own, not on the base branch.
- `skraft` stands for `node "<plugin folder>/engine/drivers/cli/skraft.mjs"`.

## 1. Sign `gh` in to the remote's forge

```text
gh auth login --hostname github.com
```

Replace `github.com` with your GitHub Enterprise host if needed. skraft runs `gh` with
`--repo <host>/<owner>/<repo>` from the remote's URL. When the host has a GitHub MCP server connected, the engine goes through it first for the issue and the pull request and falls back to `gh` otherwise ([GitHub MCP server first]({{ "/en/reference/skraft-config" | relative_url }}#github-mcp-server-first-gh-as-fallback)); the run's journal says which way served each operation.

## 2. Give the consent

At the repository's first run, the `publish-consent` question (header `Pull request`) asks whether
skraft may push the branch, open or update its pull request, and keep one comment up to date on
the story's issue. Answer `ACCEPTED`
([Answer a run's question]({{ "/en/how-to/answer-a-question" | relative_url }})). The answer is
written in `skraft-config.json`:

```json
{
  "publish": {
    "pullRequest": true,
    "questionVersions": { "pullRequest": 2 },
    "draft": false
  }
}
```

- `draft`: without it, the pull request is opened as a draft; `false` opens it ready for review.
- A run started with `--from-artifacts` does not ask the question: write the two keys
  `pullRequest` and `questionVersions` by hand.
- Commit `skraft-config.json` so the team shares the answer.

## 3. Let the run publish

At the end of the run, the PUBLISH phase has `pr-writer` write the summary, then the `publish`
node pushes the branch (never forced, never the base nor the default branch) and opens the pull
request, on the run's base (`baseBranch`, `--base`, else `main`). A pull request already open for
the branch is updated.

Result: the notification `skraft <slug>: done — PUBLISH closed`, and the pull request on the
forge, starting with `Refs #<issue>` (`Closes #<issue>` when it targets the default branch). A body past what the forge takes (60,000 characters on GitHub, 4,000 on Azure DevOps) has its longest sections cut with a mark; `pull-request.md` keeps it whole.

## 4. Publish later with `skraft publish`

Without consent, a remote, `gh` or its sign-in, the run completes locally and keeps the
description in `.copilot-tracking/skraft-plans/<slug>/pull-request.md`. Fix the cause, then:

```text
skraft publish
```

```text
pull request #128 opened as a draft: https://github.com/acme/shop/pull/128
```

Typed by you, the command is the consent for that one publication, even with
`"pullRequest": false`; the setting does not change.

## 5. Follow the run on its issue

Start the run with the issue's number: `/skraft checkout #42 Pay by card`,
`skraft init checkout --issue 42`, or the Copilot workflow's `issue` argument. With the consent of
step 2, the run keeps one comment on the issue, rewritten at each closed phase, review sent back
and end of run. Its last body stays in `.copilot-tracking/skraft-plans/<slug>/issue-progress.md`.

## 6. Attach a front end's screenshots

For a `react` component, or any component with `commands.e2e`, the `visuals` node runs
`commands.e2e` after the DELIVER review and attaches the screenshots to the pull request.

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

## On Azure DevOps {#azure-devops}

With `forge` set to `azure-devops` in `skraft-config.json`, or a remote on `dev.azure.com`,
`ssh.dev.azure.com` or `*.visualstudio.com`, the run publishes with `az repos` instead of `gh`,
using the organization, project and repository the remote's URL names.

1. Install the Azure CLI, then `az extension add --name azure-devops`.
2. Sign in once: `az login`, or `az devops login --organization <organization URL>` with a
   personal access token.

The body goes through a file (`--description=@<file>`), the pull request is linked to the story's
work item (`--work-items`) and its body opens with `AB#<work item>`. A work item Azure DevOps
refuses to link does not keep the pull request from opening: it opens without the link, and the
run's reason says so. Under Windows, `az` runs only from the Azure CLI installer (MSI or winget):
skraft starts its Python itself, so that no shell reads the title, and refuses any other `az.cmd`
or `az.bat` (pip, scoop). skraft does not read Azure DevOps work items or review its pull requests
yet ([Forge]({{ "/en/reference/skraft-config" | relative_url }}#forge)). `skraft doctor` reports
the forge a run uses on its `forge` line.

## Troubleshooting

| Message | Action |
|---|---|
| `<slug> has not completed; skraft publish opens the pull request of a completed run` | Finish or resume the run first. |
| `pull request not opened: skraft-config.json sets publish.pullRequest to false; …` | `skraft publish`, or answer `ACCEPTED` at the next run after removing the key. |
| `pull request not opened: gh, the GitHub CLI, is not installed; …` | Install `gh`, `gh auth login`, then `skraft publish`. |
| `pull request not opened: az, the Azure CLI, is not installed; …` or `the azure-devops extension of the Azure CLI is not installed; run az extension add --name azure-devops` | Install `az` and the extension, sign in, then `skraft publish`. |
| `HEAD is on <branch>, the branch the pull request would merge into` | Switch to a working branch, then `skraft publish`. |
| `HEAD is detached, on no branch to push` | `git switch -c <branch>`, then `skraft publish`. |
| The push fails on a password or a passphrase | Set up an ssh agent or a credential manager: git never prompts during a run. |
| `not published (consent): skraft-config.json sets publish.visuals to false` | Write `"visuals": true` under `publish` if the screenshots show no private data. |
| `skraft-visuals/manifest.json is missing or is not an object with a screenshots list` | Check that the reporter is declared and that `commands.e2e` runs Playwright from the component's root. |

Every message: [`skraft publish`]({{ "/en/reference/cli" | relative_url }}).

## See also

- [Phases — PUBLISH]({{ "/en/reference/phases" | relative_url }}#publish)
- [skraft-config.json — `publish`]({{ "/en/reference/skraft-config" | relative_url }}#publish)
- [Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}) —
  `pull-request.md`, `issue-progress.md`, `qa-report.md`.
