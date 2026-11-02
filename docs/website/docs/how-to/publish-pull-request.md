---
title: "Publish a run's pull request"
description: "Consent, set up gh, let the run open its pull request or publish it with skraft publish, and follow its issue."
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
forge, starting with `Refs #<issue>` (`Closes #<issue>` when it targets the default branch).

:::note[Screenshot pending a real run]
A capture of the pull request the run opened on GitHub comes after a real run.
:::

### What the description holds

The description starts with `Refs #<issue>`. What changes, Why, Decisions applied and Out of scope
show under their headings; the other sections (Tests, Quality gates, Review, Screenshots, Run
summary, AI disclosure) are folded in a `<details>` block. Quality gates stays open when a gate
failed, Review when a finding waits on a human.

Past the forge's limit, the folded sections go to a comment of the pull request titled
`skraft · run details` (`skraft · détails du run` for a French story). If that comment cannot be
kept, the pull request is still published, `pull-request.md` holds the whole description, and
`skraft publish` keeps the details once the cause is fixed.

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

## On Azure DevOps <!-- #azure-devops -->

With `forge` set to `azure-devops` in `skraft-config.json`, or a remote on `dev.azure.com`,
`ssh.dev.azure.com` or `*.visualstudio.com`, the run publishes with `az repos` instead of `gh`.

1. Install the Azure CLI, then `az extension add --name azure-devops`.
2. Sign in once: `az login`, or `az devops login --organization <organization URL>` with a
   personal access token.

The pull request is linked to the story's work item; a work item Azure DevOps refuses to link does
not keep the pull request from opening. Only Azure DevOps Services is reached, and under Windows
`az` must come from the Azure CLI installer (MSI or winget). `skraft doctor` reports the forge on
its `forge` line; the rest is in [Forge](../reference/skraft-config.md#azure-devops-through-az).

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

Every message: [`skraft publish`](../reference/cli.md).

## Next steps <!-- #next-steps -->

- [Attach a front end's screenshots](./attach-screenshots.md)
- [Phases — PUBLISH](../reference/phases.md#publish)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
- [Tracking folder and journal](../reference/run-journal.md) —
  `pull-request.md`, `issue-progress.md`, `qa-report.md`.
