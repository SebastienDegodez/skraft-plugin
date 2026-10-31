---
layout: doc
lang: en
title: "Review a pull request with skraft"
description: "Put someone else's pull request through skraft's DELIVER review, with no run: check out its head, start the review from Claude Code, Copilot CLI or a terminal, read the verdict, keep a comment, review again after a new push."
persona: reviewer
---

# Review a pull request with skraft

**Goal**: get, on a pull request skraft did not produce, the verdict of its DELIVER review
(lenses, refutation, computed verdict), and keep it in a comment if needed.

## Prerequisites

- The `skraft` plugin installed; `skraft` is the command that [`skraft install`]({{ "/en/how-to/install-on-a-host" | relative_url }}#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.
- On GitHub: `gh` installed and signed in to the repository's host (`gh auth status`). On Azure Repos: `az` with its `azure-devops` extension, signed in to the organization, or the Azure DevOps MCP server named `ado` connected in your host (Azure DevOps Services only). A tool of that server that you or the host refuse is never retried with `az`: the review says so and stops or leaves its comment unpublished.
- A clone of the repository, at whose root you run everything.

## 1. Check out the pull request

```sh
gh pr checkout 42
git fetch origin main
git status
```

On Azure Repos, check it out with `az repos pr checkout --id 42` instead of `gh pr checkout 42`.

The working copy must be on the pull request's head commit, Git must know its base commit
(`main` here), and nothing may stay uncommitted outside `.copilot-tracking/`.

The review workflow, `skraft-config.json` and the project rules (`AGENTS.md`, `CLAUDE.md`,
`CONTRIBUTING.md`, `.github/copilot-instructions.md`, the indexed ADRs) are read **at the base
commit**: a rule the pull request changes does not count.

## 2. Start the review

| Host | Command |
|---|---|
| Claude Code | `/skraft review 42`: the review runs in the background, the **Skraft** pane follows it |
| Copilot CLI | `/skraft review 42`, or ask to run the `skraft-review` workflow with `pr` set to `42` |
| VS Code, terminal | `skraft review --pr 42`, then the loop below |

**On the command line**, the review hands its lenses to the conducting agent, then waits:

```text
skraft review #42: dispatch — start these 3 agents, one after the other, save each final reply as it is to its reply file, then record
agent 1: test-integrity-lens on the session's model
  prompt: Your brief is the file <…>. Read it whole and do what it asks. Your last message is the reply it asks for.
  reply: <…>
…
then: skraft review --pr 42 --record
```

Have each agent started with its `prompt` (by your chat's agent, or by hand), save its final
reply as it is to the `reply` file, then run the `then:` command. Repeat while the output says
`dispatch`: the refuter is handed over the same way.

## 3. Read the verdict

```text
skraft review #42: NEEDS_REWORK, pass 1 — <summary>
  to address: <what sends the work back>
  details: <working copy>/.copilot-tracking/skraft-reviews/pr-42/reviews/verdict-1/verdict.yaml
```

| Status | Meaning |
|---|---|
| `APPROVED` | no blocking finding survives the refutation |
| `NEEDS_REWORK` | each `to address:` line is for the author |
| `BLOCKED` (`lens-inconclusive`) | a lens did not conclude: run the review again, or read its answer in `verdict.yaml` |
| `stopped`, `refused` | the review did not start or stopped; the code in brackets says why (Troubleshooting) |

`verdict.yaml` details each lens, the refuted findings and the notes.

## 4. Keep the verdict in a comment (optional)

| Host | Command |
|---|---|
| Claude Code | `/skraft review 42 --publish` |
| Copilot CLI | `/skraft review 42 --publish`, or the `skraft-review` workflow with `pr` set to `42` and `publish` to `true` |
| Terminal | `skraft review --pr 42 --publish` |

skraft keeps **one** comment, found by its marker `<sub>skraft-review pr=42</sub>` and rewritten on
every pass; never a GitHub review nor a change request. On Azure Repos the comment is a **thread**,
created with the status *Closed* so that a "comment resolution" branch policy does not wait on it; its first
comment is the one rewritten. Never a vote, never a reply. It asks your consent once per repository
(terminal, dialog, or Copilot's confirmation) and keeps it in your `~/.skraft/config.json`. A team
can decide for everyone with `publish.reviewComment` in the base branch's `skraft-config.json`
([skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}#publish)). Without
consent nothing is posted; `comment.md`, next to `verdict.yaml`, keeps the text.

## 5. Review again after a new push

```sh
gh pr checkout 42
```

Start the review again: it is the next pass (`verdict-2/`). A lens whose inputs did not move and
that found nothing is reused without running again.

## Troubleshooting

| Code | Action |
|---|---|
| `forge-unavailable` | Install `gh` and sign in (`gh auth login --hostname <host>`); on Azure Repos, install `az` and its extension and sign in (`az login`), or connect the `ado` MCP server; check that the working copy has a remote to the forge. |
| `pr-not-found`, `pr-unreadable` | Check the number, and that `gh repo set-default` names the right repository. On Azure Repos, the pull request must be in the project and repository the Git remote names. |
| `pr-not-checked-out` | `gh pr checkout <number>` (`az repos pr checkout --id <number>` on Azure Repos), then run again. |
| `pr-base-missing` | `git fetch origin <base>`, then run again. |
| `working-copy-dirty` | Commit or set aside the changes outside `.copilot-tracking/`. |
| `workflow-invalid` | The base's `.skraft/review.skraft.dot` removes a mandatory node: fix it on the base branch. |
| `pipeline-locked` | Another session reviews this pull request: wait until it finishes. |
| `journal-unverifiable` | The review started on another machine: `skraft journal adopt --pr <number>` in your terminal. |
| `not-recorded` | Handed-over agents have no reply: finish the loop, then `--record`. |

## See also

- [`skraft review`]({{ "/en/reference/cli" | relative_url }}) — the rules of each step, `--json`
  output.
- [`skraft-review` workflow]({{ "/en/reference/hosts" | relative_url }}#skraft-review)
- [Add a lens to a review]({{ "/en/how-to/customise-review" | relative_url }}) — the review
  follows `.skraft/review.skraft.dot` when it exists.
- [Gates: review]({{ "/en/reference/gates" | relative_url }}#review-run) — lenses, refutation,
  verdict.
