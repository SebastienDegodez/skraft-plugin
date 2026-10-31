---
title: "Refine a backlog issue"
description: "Get the refinement proposal of a GitHub issue as a comment: from your editor with /skraft-refine (/skraft-backlog:skraft-refine in Copilot CLI), or on every new issue with the skraft-refine GitHub Agentic Workflow."
persona: tech-lead
---

# Refine a backlog issue

**Goal**: get on an issue a comment that says whether it is ready, its size, the defects of its
criteria and the proposed story — on demand, or automatically on every new issue.

## Prerequisites

- The `skraft-backlog` plugin installed
  ([Install skraft on a host](./install-on-a-host.mdx)).
- Write access to the repository's issues: `gh` signed in, or the GitHub MCP server.
- For the GitHub workflow: the `gh aw` extension (`gh extension install github/gh-aw`) and the
  right to write repository or organization secrets.

## Refine one issue from your editor

1. Open a session at the root of the repository, in Claude Code, Copilot CLI or VS Code.
2. Type the command with the issue number. The name depends on the host:

   | Host | Command |
   | --- | --- |
   | Claude Code | `/skraft-refine 42` |
   | Copilot CLI | `/skraft-backlog:skraft-refine 42` (measured on 1.0.105, in the SDK's command registry) |
   | VS Code | not measured yet |

   The agent runs on your model and credentials. It reads the issue and the PRD or BRD it links
   under `docs/`, has three planning lenses review its proposal, then posts **one** comment. Its
   working files are under `.copilot-tracking/skraft-refine/42/`.
3. Expected result: one line with the readiness (ready or needs refinement), the size and the
   comment's link. The comment ends with a visible marker
   `skraft-refine v=<version> hash=<fingerprint>`.

An issue a proposal already covers, for its title, its body and the plugin version, is skipped
with its reason. To refine it anyway, add `--force` after the number: `/skraft-refine 42 --force` in
Claude Code, `/skraft-backlog:skraft-refine 42 --force` in Copilot CLI.

## Start from the backlog with `/skraft backlog`

With the `skraft` plugin installed as well, `/skraft backlog [criteria…]` in Copilot tells you the next steps; it starts no agent and
develops nothing by itself. Each step waits for you:

1. Select `Skraft - Backlog Discoverer` as the chat's agent and give it the criteria. It triages and proposes a sprint.
2. Select `Skraft - Backlog Planner` to refine the issue you choose.
3. Once its stories are written, type `/skraft <slug> --from-artifacts` to develop the story.

Without `skraft-backlog`, the command says so and gives `copilot plugin install skraft-backlog@skraft`; the other `/skraft` routes still work.
When `.copilot-tracking/skraft-plans/backlog/` exists, `/skraft backlog …` resumes or starts that pipeline instead, and says that for the backlog steps you select `Skraft - Backlog Discoverer` as the chat's agent directly. Not verified by Vally.

## Refine every new issue with GitHub Actions

1. At the root of the repository, install the workflow at the plugin's version:

   ```console
   $ gh aw add SebastienDegodez/skraft-plugin/plugins/skraft-backlog@v2.0.0-alpha.19
   ```

   The command installs `skraft-refine.md`, its import `shared/apm.md` and
   `.github/workflows/shared/skraft-refine-marker.mjs`, creates the `skraft-refine` label and
   compiles the workflow.
2. Add the engine secret, `COPILOT_GITHUB_TOKEN`, to the repository or the organization.
3. Commit and push what the command wrote under `.github/workflows/`.

The workflow then starts on:

| Trigger | How |
|---|---|
| New issue | when it is opened |
| Label | add `skraft-refine`; to ask again, remove it and add it again |
| Comment | a comment whose first word is `/skraft-refine`, or `/skraft-refine --force` |
| By hand | Actions → skraft-refine → Run workflow, with `issue_number` and `force`; or `gh workflow run skraft-refine.lock.yml -f issue_number=42 -f force=true` |

Expected result: the run reacts 👀 to the issue or the comment, then posts the proposal; the
workflow's older proposals are hidden.

By default only users with write access or above start a gh-aw workflow: an issue opened by an
outside contributor is refined only once a maintainer adds the label or comments the command.

## Troubleshooting

| Situation | Action |
|---|---|
| Nothing happens on a comment | The first word must be `/skraft-refine`, on an issue (not a pull request). |
| `proposal … already covers this issue text with version …` | The issue has not changed since the last proposal: add `--force`. |
| `the issue is closed` | Reopen the issue, or do not refine it. |
| The workflow posts nothing after a label | The label must be exactly `skraft-refine`. |
| An issue already refined from the editor is skipped by the workflow | Expected: the comment carries the same marker. |

## See also

- [Turn a PRD into a GitHub backlog](./prd-to-backlog.md)
- [The backlog: from idea to ready story](../explanation/backlog.md) — why
  a comment and never a rewritten issue.
- [Gates: DISCUSS](../reference/gates.md#discuss) — INVEST, acceptance
  criteria and Definition of Ready.
