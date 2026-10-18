---
layout: doc
lang: en
title: "Resume or unblock a run"
description: "Resume an interrupted run without starting the finished agent again, answer the question a run waits on, switch the active pipeline and clear every refusal or blocking code of the engine."
persona: software-engineer
---

# Resume or unblock a run

**Goal**: start a stopped run again where it stopped, answer the question it waits on, or understand why the engine refuses to go on.

A **run** is one story's pass through the pipeline, identified by a kebab-case **slug** (`checkout`). Its state is recomputed from its journal, `.copilot-tracking/skraft-plans/<slug>/events.jsonl`. The **active pipeline** is the slug written in `.copilot-tracking/skraft-plans/.active-slug`; the engine never guesses it. Each worktree has its own.

## Prerequisites

- A run already started in this working copy.
- For the command line: `skraft` stands for `node "<plugin folder>/engine/drivers/cli/skraft.mjs"`, where `<plugin folder>` is the folder where the host installed the skraft plugin.

## 1. See where the run stands

```
skraft status
```

You see:

```
skraft checkout: blocked
RESEARCH  open
agent: solution-researcher (research, attempt 1)
…
```

The last line gives the reason for the block. `skraft status --json` gives the same view as JSON.

In Claude Code, `/skraft` (or `/skraft status`) gives the same information in another format: `skraft checkout — blocked`, `▶ RESEARCH`, then the reason, then the agent and `cost: $…`. See [the reference]({{ "/en/reference/cli" | relative_url }}).

## 2. Resume after an interruption

A resume reads the journal again and starts from the first unfinished step. An agent whose outputs are already filled is not started again. The base journaled at the first init is kept.

| Host | How to resume |
|---|---|
| Claude Code | `/skraft <slug>` with the active pipeline's slug, or ask the model to call `mcp__skraft__run_pipeline` **without** a slug. `/skraft` alone shows the state; it starts nothing. |
| GitHub Copilot CLI | Run the `skraft-pipeline` workflow without `slug`. |

Claude Code answers `skraft <slug> started — progress in the Skraft pane.` The "Skraft" pane shows the phases, the current agent and the progress log.

> **Coming next.** Resuming under VS Code is planned for lot 10.

## 3. Answer a question the run waits on

Some steps need a human: ratifying the ADRs DESIGN proposed, or fixing the machine when a step cannot run on it. The run then **waits**: it does nothing more until you answer, and starting it again asks the same question without starting an agent again.

```
skraft checkout: waiting
…
question: adr-ratification (adr)
answer: skraft decide adr-1 RATIFIED|REJECTED (--reason <text> with REJECTED)
Ratify the Proposed ADRs docs/adr/adr-001-card-provider.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

| Host | How to answer |
|---|---|
| Claude Code | Pick an option in the dialog. For `REJECTED`, type the reason under Other in the second dialog. Dialog closed: `/skraft decide [<key>] <answer> [reason…]`, which records the answer and resumes the run. |
| GitHub Copilot CLI | The workflow logs `Waiting for you — <question>` and pauses. Have the model call the `skraft_decide` tool with the key, the answer and, for `REJECTED`, the reason; then resume the paused run (`/workflows`). |
| Command line | `skraft decide [<key>] <answer> [--reason <text>]`, then resume the run from the host (section 2). |

```
skraft decide adr-1 REJECTED --reason "use the provider we already pay for"
```

- `RATIFIED`: the engine sets each Proposed ADR to `Accepted`, commits them alone (`docs(adr): ratify ADR-001`), and the run goes on to DISTILL.
- `REJECTED`: the architect runs DESIGN again with your reason. The `REJECTED` edge allows 3 passes back to DESIGN; a fourth rejection stops the run on `loop-ceiling`.
- `environment-<n>` (`<node> cannot run on this machine: <reason>. Fix it, then RETRY; or ABORT the run.`): fix the machine (install the program, start Docker, repair Git), then answer `RETRY`: the same step is checked or run again; its agent starts again only if its outputs or result were still missing. The same failure asks a new question (`environment-2`). `ABORT` ends the run, blocked.

A refused answer records nothing: `no-question` (wrong key; the message names the one waiting), `already-answered`, `invalid-answer` (an answer that is not an option, or `REJECTED` with no reason).

## 4. Switch the active pipeline

The engine never moves from one slug to another on its own. To work on another slug, run an explicit init:

```
skraft init card-payment
```

Answer: `card-payment is the active pipeline`. The command line starts no agent: the slug only becomes the active pipeline. Then resume or start the run from the host (section 2).

In Claude Code, `/skraft card-payment` does both at once: it makes the slug active and starts the run, which resumes when the slug already has a journal and starts otherwise. Answer: `skraft card-payment started — progress in the Skraft pane.`

## 5. Clear a refusal or a block

A **refusal** (`refused`): the engine did nothing. A **block** (`blocked`): the run stopped and the journal says so. The code shows in the Claude Code mod's closing notification (`skraft checkout: blocked (missing-outputs) — …`), in the Copilot workflow's result and log, and in the `code` field of `skraft gate --json`. `skraft status` does not show it: it gives the status and the reason.

| Symptom | Code | Action |
|---|---|---|
| `journal tampered: events.jsonl line N …; restore the file or start a new slug` | `journal-tampered` | The journal was edited by hand: the hash chain breaks at line N. Restore the file (from Git or a backup, for instance) or start a new slug. Do not try to repair the line. |
| `<slug>: another run wrote events.jsonl meanwhile; run again once it stops` | `journal-changed` | Another run (another terminal, another session) writes to the same journal. Wait for it to stop, then resume. |
| The host could not start the agent (plugin missing or disabled, start refused) | `agent-unavailable` | Install or enable the skraft plugin, allow the agent to start, then resume. The attempt is not used up: the resume starts the same agent again. |
| `<agent> stopped without finishing: …` | `agent-failed` | The agent stopped without filling its outputs. Resume: the engine starts the same attempt again. |
| `aborted by a human: <question>` | `environment` | Someone answered `ABORT` to an environment question. Fix the machine, then start a new slug. |
| `<from> -> <to> was already taken N times, its max_visits` | `loop-ceiling` | A loop (DESIGN rejected, gates failed) ran its maximum number of times. Read the reasons in the journal, then start a new slug. |
| `<agent> left required outputs missing after 2 attempts: <paths>` | `missing-outputs` | The agent was started once more with the list of missing files, with no result. A resume gives the same block. Read the paths given, then start a new slug. |
| `… has no merge base with <ref>; set baseBranch in skraft-config.json or pass --base <ref>` | `base-unresolved` | A repository has no merge base with the ref. Write `baseBranch` (global or on the component) or pass `--base <ref>` to the init. |
| `<error>; the components of skraft-config.json need Git for their base` | `source-control-unavailable` | Git does not run while the config lists components. Install Git or put it on the PATH. |
| `no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug` | `no-active-pipeline` | No active pipeline. Start one: `skraft init <slug>` or `/skraft <slug>`. |
| `the active pipeline of this working copy is <a>, not <b>; switch with an explicit init` | `slug-mismatch` | Internal safeguard: no current command triggers it, since `/skraft <slug>`, `skraft init <slug>` and the workflow with a `slug` run the init before running and so switch pipelines. If you see it, run an explicit init of the slug you want. |
| `<slug> has no journal (events.jsonl); start it with an explicit init` | `not-initialised` | The active pipeline has no journal. Run an explicit init. |
| `skraft-config.json is invalid: <every error>` | `config-invalid` | Fix each listed error (see [Configure the components]({{ "/en/how-to/configure-components" | relative_url }})), then run again. |
| `slug must be kebab-case, got "Checkout_V2"` | `invalid-slug` | Pick a slug in lower case with dashes: `checkout-v2`. |
| `--base must be a git ref, got "…"` | `invalid-base` | Pass a Git ref with no space that does not start with `-`. |
| `skraft-config.json lists no component; run skraft init to detect them` | `no-components` | `skraft gate` has nothing to run. Run `skraft init` to detect the components. |

In Claude Code, a refused init shows as: `skraft <slug>: not started — <reason>`.

## See also

- [Journal reference]({{ "/en/reference/run-journal" | relative_url }}) — the tracking folder, the events and every code.
- [State and resume]({{ "/en/explanation/hve-core" | relative_url }}) — why the journal is chained.
- [Command-line reference]({{ "/en/reference/cli" | relative_url }})
