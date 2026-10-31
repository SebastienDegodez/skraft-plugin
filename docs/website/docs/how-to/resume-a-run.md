---
title: "Resume or unblock a run"
description: "Resume an interrupted run without starting an agent that already finished, switch the active pipeline, and lift the most common refusals and blocks."
persona: software-engineer
---

# Resume or unblock a run

**Goal**: start a stopped run again where it stopped, or lift what keeps it from going on.

## Prerequisites

- A run already started in this working copy (a slug, its journal
  `.copilot-tracking/skraft-plans/<slug>/events.jsonl`).
- For the command line, `skraft` is the command that [`skraft install`](./install-on-a-host.mdx#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it. Run it from the root of the working copy.

## 1. See where the run stands

```console
$ skraft status
```

```console
skraft checkout: blocked
RESEARCH  closed
DESIGN  open
agent: solution-architect (design, attempt 1)
solution-architect stopped without finishing: …
```

The last line gives the reason. In Claude Code, `/skraft` shows the same view in the **Skraft**
pane. When the status is `waiting`, the run waits for an answer:
[Answer a run's question](./answer-a-question.mdx).

## 2. Resume the run

Resuming reads the journal again and starts from the first unfinished step; an agent whose outputs
are already filled is not started again, and the journaled base stays.

| Host | Resume the active pipeline |
|---|---|
| Claude Code | `/skraft <slug>` with the active pipeline's slug (`/skraft` alone shows the state and starts nothing) |
| Copilot CLI | `/skraft <slug>` with the active pipeline's slug (`/skraft` alone shows the state and starts nothing), or ask `skraft:skraft-orchestrator` to resume: it starts the `skraft-pipeline` workflow with no `slug`; a paused workflow is resumed from `/workflows` |
| VS Code, Copilot SDK | `node "<plugin folder>/engine/drivers/copilot-sdk/skraft-run.mjs"` with no slug |
| VS Code, no SDK | ask the orchestrator agent to resume: it runs `skraft next`, or `skraft record` when agent replies are waiting |

Claude Code answers `skraft <slug> started — progress in the Skraft pane.`; `skraft status` then
shows the resumed phase.

## 3. Switch the active pipeline

The engine never switches slugs on its own. Run an explicit init:

```console
$ skraft init card-payment
```

Answer: `card-payment is the active pipeline`. The command line starts no agent: resume or start
the run from the host next (step 2). In Claude Code, `/skraft card-payment` does both at once.

## Troubleshooting

The code shows in the Claude Code mod's final notification
(`skraft checkout: blocked (missing-outputs) — …`), in the Copilot workflow's result and in
`skraft gate --json`.

| Code | Action |
|---|---|
| `agent-failed` | Resume: the same attempt runs again. |
| `agent-unavailable` | Install or enable the plugin, accept the agent's start, then resume; the attempt is not used up. |
| `pipeline-locked` | Another session drives the run: let it finish. A lease not renewed for 2 minutes is taken over by the next resume. |
| `journal-changed` | Another terminal writes to the same journal: wait until it stops, then resume. |
| `journal-tampered` | `events.jsonl` was edited by hand: restore the file (Git, a backup) or start a new slug. Do not repair the line. |
| `journal-unverifiable` | The run comes from another machine: `skraft journal adopt`, then resume. |
| `no-active-pipeline`, `not-initialised` | `skraft init <slug>` or `/skraft <slug>`. |
| `config-invalid` | Fix every listed error ([Configure the components](./configure-components.md)), then resume. |
| `base-unresolved` | Write `baseBranch` in `skraft-config.json` or pass `--base <ref>` at the first init. |
| `missing-outputs`, `loop-ceiling`, `environment`, `stopped` | Final for this slug: read the reason in the journal, fix the cause, start a new slug. |

Every code, its message and its action:
[Statuses and codes](../reference/run-journal.md#statuses-and-codes).

## See also

- [Answer a run's question](./answer-a-question.mdx)
- [Hosts](../reference/hosts.md#at-a-glance) — start, answer and follow on
  each host.
- [Tracking folder and journal](../reference/run-journal.md)
- [State and resume](../explanation/event-journal.md) — why the journal is chained.
