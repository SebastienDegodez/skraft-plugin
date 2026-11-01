---
title: "Publish a run's pull request"
description: "Consent, set up gh, let the run open its pull request or publish it with skraft publish, follow its issue, attach a front end's screenshots."
persona: software-engineer
---

# Publish a run's pull request

Have a completed run push its branch and open (or update) its pull request, with its description
rendered from the journal.

## Prerequisites

- A repository with a GitHub, GitHub Enterprise or Azure DevOps remote (`origin`, else the first remote).
- `gh` installed (`az`, the Azure CLI, on Azure DevOps: see [On Azure DevOps](#azure-devops)); Git and ssh able to push without asking for a password.
- Work on a branch of your own, not on the base branch.
- `skraft` is the command that [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.

## 1. Sign `gh` in to the remote's forge

```console
$ gh auth login --hostname github.com
```

Replace `github.com` with your GitHub Enterprise host if needed. skraft runs `gh` with
`--repo <host>/<owner>/<repo>` from the remote's URL. The engine reads the issue and opens the pull request through `gh` only, never through an MCP server ([GitHub through gh](../reference/skraft-config.md#github-through-gh)). With the consent given, a forge `gh` cannot reach stops the run at its start, before the first agent, with an environment question: fix it (`gh auth login`), then answer RETRY.

## 2. Give the consent

At the repository's first run, the `publish-consent` question (header `Pull request`) asks whether
skraft may push the branch, open or update its pull request, and keep one comment up to date on
the story's issue. Answer `ACCEPTED`
([Answer a run's question](./answer-a-question.mdx)). The answer is
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
forge, starting with `Refs #<issue>` (`Closes #<issue>` when it targets the default branch). A body past what the forge takes (60,000 characters on GitHub, 4,000 on Azure DevOps) keeps what decides and sends the folded sections to a kept comment; `pull-request.md` keeps the description whole.

:::note[Screenshot pending a real run]
A capture of the pull request the run opened on GitHub comes after a real run.
:::

### What the description holds

The description starts with `Refs #<issue>`; `Closes #<issue>` only when the pull request targets the default branch. What changes, Why, Decisions applied and Out of scope show under their headings. Consistency matrix (right under Decisions applied), Tests, RED evidence, Quality gates, Review, Screenshots, Run summary and AI disclosure are folded in a `<details>` block whose summary counts what it holds; Quality gates stays open when a gate failed, Review when a finding waits on a human.

- **Tests** shows the test plan DISTILL wrote (`details/<date>/test-plan-<slug>.md`); **Consistency matrix** the matrices DESIGN wrote (`details/<date>/consistency-matrix-<story>.md`, all those of the latest attempt that wrote any). A file the tracking folder does not hold, or holds empty, is said so in a fixed text.
- These files are agent-written, so they are made inert before they enter the description: fenced code blocks are shown as written; everywhere else, code spans included, HTML comments and tags are dropped, `#` to `###` headings are lowered to level 4, and each closing keyword with its reference, each `@mention` and each bare `#12` goes in a code span. Only a fence opened at column 0 is a code block; a code block left open is dropped with what follows it.
- Below the forge's limit everything stays in the description, on GitHub up to 60,000 characters and on Azure DevOps up to 4,000, and no comment is written. Past it, the description keeps what decides (What changes, Why, Decisions applied, Out of scope, and every section open on a failed gate or a finding for a human) and ends with a fixed line that points to the comments. The other sections go to a comment of the pull request titled `skraft · run details` (`skraft · détails du run` for a French story: the engine tells French from English by the title and body of the issue or work item it kept, English when it cannot tell). Sections are never split across comments: when one comment is not enough (60,000 characters on GitHub, 140,000 on Azure DevOps, not measured), the details go to parts titled `skraft · run details 1/2`, `2/2`, and a part no longer needed is emptied, never deleted. Each part is rewritten in place on the next publication, and written only when its text changed. A section longer than a part is cut with a mark; what decides is cut the same way only when it alone is past the description's limit.
- On GitHub the comment is an issue comment of the pull request. On Azure DevOps it is a thread of the pull request, posted `Closed` so that a branch policy on comment resolution is not blocked, through `az devops invoke`.
- A comment is found again by the marker that opens it, never by a marker quoted further in: a reply that quotes the marker is not rewritten.
- When the comment cannot be kept, the pull request is still published: the run says so, `pull-request.md` holds the whole description, and `skraft publish` keeps the details once the cause is fixed.
- A part whose text did not change is not written again, and skraft does not ask the forge whether its comment is still there: a comment deleted by hand is posted again at the next change of the details.

## 4. Publish later with `skraft publish`

Without consent, a remote, `gh` or its sign-in, the run completes locally and keeps the
description in `.copilot-tracking/skraft-plans/<slug>/pull-request.md`. Fix the cause, then:

```console
$ skraft publish
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

## On Azure DevOps <!-- #azure-devops -->

With `forge` set to `azure-devops` in `skraft-config.json`, or a remote on `dev.azure.com`,
`ssh.dev.azure.com` or `*.visualstudio.com`, the run publishes with `az repos` instead of `gh`,
using the organization, project and repository the remote's URL names.

1. Install the Azure CLI, then `az extension add --name azure-devops`.
2. Sign in once: `az login`, or `az devops login --organization <organization URL>` with a
   personal access token.

The body goes through a file (`--description=@<file>`), the pull request is linked to the story's
work item (`--work-items`) and its body opens with `Fixes #<work item>` toward the default
branch, which completes the work item when the pull request merges, `#<work item>` otherwise.
Only Azure DevOps Services is reached: `az` does not manage Azure DevOps Server. A work item
Azure DevOps refuses to link does not keep the pull request from opening: it opens without the link, and the
run's reason says so. Under Windows, `az` runs only from the Azure CLI installer (MSI or winget):
skraft starts its Python itself, so that no shell reads the title, and refuses any other `az.cmd`
or `az.bat` (pip, scoop). The run reads the story from its Azure Boards work item and keeps its
progress in one comment on it, through `az` only ([Forge](../reference/skraft-config.md#azure-devops-through-az));
skraft does not review its pull requests yet. `skraft doctor` reports
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

Every message: [`skraft publish`](../reference/cli.md).

## Next steps <!-- #next-steps -->

- [Phases — PUBLISH](../reference/phases.md#publish)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
- [Tracking folder and journal](../reference/run-journal.md) —
  `pull-request.md`, `issue-progress.md`, `qa-report.md`.
