---
title: "Tracking folder and journal"
description: "The tracking folder, .active-slug, the signed hash-chained events.jsonl, the questions a run asks, statuses and codes."
persona: software-engineer
---

# Tracking folder and journal

Everything a run knows sits in one repository folder and one hash-chained journal; the engine recomputes the state from the journal on every read and stores nothing else. Why a journal rather than a state file: [The event journal](../explanation/event-journal.md), which also covers the chain, the signature and resuming in depth.

## Layout <!-- #layout -->

The tracking folder lives in the working copy that starts the run. A **slug** (kebab-case) names one pipeline and one folder.

```
.copilot-tracking/skraft-plans/
├── .active-slug                      the active pipeline of the working copy
└── <slug>/
    ├── .lock                         lease of the session that drives the run
    ├── events.jsonl                  hash-chained, signed journal
    ├── run-report.md, qa-report.md, WORKFLOW.md, pull-request.md, issue-progress.md
    ├── plans/<date>/                 the story's issue, DISCUSS stories
    ├── research/<date>/<slug>-research.md
    ├── details/<date>/               DESIGN, DISTILL and PUBLISH documents (test plan, impl plan, prose)
    ├── changes/<date>/change-log.md  DELIVER change log
    ├── results/                      what an agent wrote for one attempt, loop briefs and replies
    ├── reviews/<node>-<visit>/       what the lenses of a review pass read, and verdict.yaml
    ├── logs/                         what commands printed; logs/runs/<step>-<visit>-<attempt>/ holds the traced runs
    ├── visuals/<component>/          the last e2e run of each front end
    └── .tmp/                         the agents' temporary files
```

`results/`, `reviews/`, `logs/` and `.tmp/` are never documents of a phase: no lens gets them. The documents each phase writes are listed in [Phases](./phases.md). Lenses write no file: they return findings, and the engine writes `reviews/<node>-<visit>/verdict.yaml` (`status` `APPROVED`, `NEEDS_REWORK` or `BLOCKED`, the findings that count, the refutations, the lenses reused) beside a `snapshot.json` the next pass compares with ([incremental re-review](./gates.md#incremental)).

## Durable documentation <!-- #durable-docs -->

Some documents belong to the repository, not to the run. The phase writes them under `docs/` on the story's branch: the pull request shows them and the next runs read them again.

| Document | Phase | Path |
| --- | --- | --- |
| context map, tactical design | DESIGN | `docs/architecture/context-map.md`, `docs/architecture/{bounded-context}.md` |
| event model | DESIGN | `docs/domain/event-model/{bounded-context}.md` |
| ADRs, decision index, supersession registry | DESIGN | `docs/adr/` |
| Gherkin scenarios, not executable | DISTILL | `{features folder}/{bounded-context}/{feature}.feature` |

The research document, the consistency matrix, the supersession plan, the test plan, the impl plan, the change log, the pull request prose, the journal and the reports stay in the tracking folder. RESEARCH and DESIGN read `docs/` first and complete a file rather than rewrite it (instructions to the agents, not checks). The engine checks the consistency matrix's `docs-relied-on:` line (at least one existing file of `docs/adr`, `docs/architecture`, `docs/domain/event-model` or `docs/features`, or a `.feature`) and the write scope of each phase. `cold-reader` reads neither the ADRs nor these files. `events.jsonl` lines are only appended; a published ADR is never edited, a new ADR supersedes it.

## `.active-slug` <!-- #active-slug -->

The slug and a line break, written by `skraft init <slug>`. Blanks are trimmed; content that is not kebab-case means no active pipeline. Every command that acts on a run reads it and the engine never guesses a slug. It is per working copy, so a Git worktree has its own.

## `events.jsonl` <!-- #events-jsonl -->

One JSON object per line. Every event carries `type`, `at` (ISO-8601 UTC) and `prev`, the lowercase hex SHA-256 of the previous line (`null` on the first). Each line ends with `sig`, the HMAC of the line without that field under the run's key; the first line names the key by `keyId`, kept in `~/.skraft/journal-keys/<keyId>.key` on the machine that started the run.

- **Chain check.** Each time it opens the journal, the engine checks every line. The first break gives `journal-tampered`: `journal tampered: events.jsonl line N <detail>; restore the file or start a new slug` (not JSON, does not open the chain, does not chain to line N-1, names no signing key, is not signed, does not carry the signature of the run's key).
- **Without the key** on this machine, or with no home folder, or for a journal written before signing: `journal-unverifiable`. `skraft journal adopt` writes a `journal.adopted` line (`keyId`, `previousKeyId`, `unverified`) naming a new key; earlier lines stay unverified.
- **Concurrent writes.** Before each append the engine reads the journal again; if another write arrived, it stops with `journal-changed`.

| `type` | Written by | Main fields |
| --- | --- | --- |
| `run.started` | init | `slug`, `story`, `workflow`, `base` (`{ component, root, repository, ref, source, sha }` each) |
| `step.started` | the pipeline, before an agent | `step`, `phase`, `agent`, `attempt`, `outputs`, `missing`, `assignment`, `host`; `sentBy` when sent back |
| `step.recorded` | the pipeline, after the agent | `step`, `attempt`, `outcome`, `missing`, `failures`, `durationMs`, `cost`, `model`, `documents`; on the DISTILL and DELIVER nodes the scenarios and their oracles |
| `question.asked`, `question.answered` | the pipeline, `skraft decide` | `key`, `kind`, `text`, `options`; `answer`, `reason`, `by` (`host`, `decide`, `host-confirmed`, `cli-tty`) |
| `phase.closed`, `run.finished`, `run.stopped` | the pipeline | `phase`; `status`, `code`, `reason` |
| `review.lens`, `review.refuted`, `review.noted`, `review.cost` | a review node | `lens`, `verdict`, `findings`, `fingerprint`; the refuter's verdict per finding |
| `commits.checked` | after an attempt that made commits | `commits`, each `{ repository, sha, subject, kind, verdict }` |
| `evidence.checked` | after a DELIVER attempt | `runs`, each `{ run, gate, cwd, log, sha256 }`; for a trace that does not read through its signatures, `runs: []` and `invalid` (`unsigned-line`, `no-key`, `wrong-signature`); `red: true` for the designer's red run ([Quality evidence](#gate-evidence)) |
| `visuals.recorded` | `playwright-visuals` | each front end's screenshots |
| `publish.requested`, `pull-request.opened`, `pull-request.updated`, `pull-request.details-kept`, `pull-request.details-skipped` | `skraft publish`, the `publish` node | `number`, `url`, `bodyHash`, `part` |
| `issue.commented`, `issue.comment-skipped` | the run | `issue`, `kind`, `url` or `reason` |
| `lease.reclaimed`, `journal.adopted` | the pipeline, `skraft journal adopt` | `renewed`, `gapMs`; `keyId`, `unverified` |

The `verdict` of a commit is exactly one of `ok`, `not-conventional`, `issue-reference-missing`, `issue-closed`, `issue-not-in-story`, `outside-tdd`, `green-without-red`, `green-without-test`, `test-apart`, `no-component`, `oracle-split`, `oracle-component`, `oracle-without-test`, `code-in-oracle`, `test-in-scenario`, `refactor-in-scenario`, `green-split`, `oracle-touched` ([Commits](./gates.md#commits)).

## Questions to a human <!-- #human-questions -->

A question is journaled when asked and when answered. With no answer the run waits and a new start asks the same question with the same key.

| Question | Asked when | Answers |
| --- | --- | --- |
| `adr-ratification` | an ADR is `Proposed` | `RATIFIED` sets each to `Accepted` and commits alone; `REJECTED` runs DESIGN again |
| `scenario-review` | the DISTILL review approved | `APPROVED` starts DELIVER; `REVISE` runs DISTILL again with the corrections |
| `environment` | a step cannot run on this machine ([below](#environment-question)) | `RETRY` or `ABORT` |
| `blocked` | an agent is blocked or refused the same way twice, a loop reached its `max_visits`, a lens answered `inconclusive` | an instruction runs the node again on a new pass; `STOP` ends the run |
| `review-ceiling` | a review loop reached its ceiling with only medium and low findings | `ACCEPT`, an instruction, or `STOP` |

### The `environment` question <!-- #environment-question -->

It names the node, the reason, the cause (`environment`: a program, a service, a permission or a Git hook the machine lacks or refuses, or `config`), the log and the path of `run-report.md`. It sends nothing back to an agent and uses no attempt; `RETRY` runs the step again where it stopped.

## Unpublished ADRs <!-- #unpublished-adrs -->

An ADR is published when the run's base holds the file. After each attempt, an unpublished ADR the attempt changed must be `Proposed`, carry no `amended_by`, `amended_in_place` or `superseded_by`, no history section, no version or pin, no code file, no acceptance-criterion or ticket identifier and no other ADR, hold a one-sentence `decision`, and not supersede or amend another unpublished ADR. A published ADR changes only its status and replacement lines, following its lifecycle. A breach fails the attempt with `adr-lifecycle` and one line per breach.

## Research document <!-- #research-document -->

`research/<date>/<slug>-research.md`, written from the plugin's template before the attempt. It is filled when it exists, differs from the template and holds no `{{…}}`. Not filled: the next attempt, up to `max_attempts` (3), then the `blocked` question.

## Quality evidence <!-- #gate-evidence -->

The engine runs no gate and refuses no attempt for one. The software engineer runs each gate through [`skraft_repl`](./repl.md), which writes a signed trace `logs/runs/<step>-<visit>-<attempt>/runs.jsonl` and one log per run. The engine journals `evidence.checked` (the runs of the attempt whose trace reads through its signatures, never their output; else none, with the code of what broke the trace) and hands the trace, or that code, to the DELIVER review; its `quality-gates` lens judges it ([Gates](./gates.md)). The pull request table, the issue comment and `qa-report.md` read the journaled runs.

## Logs <!-- #logs -->

What a command printed goes to a file of `logs/`; the journal, an outcome and a question name the file and never copy what it holds. `logs/commit-<node>.log` holds what Git printed when it refused a commit the engine made. Agents send their command output to `<run>/logs/` and their temporary files to `<run>/.tmp/`.

## Run report <!-- #run-report -->

The engine rewrites `run-report.md` from the journal after each step: the status line, the steps table (visits, attempts, retries, time, cost, outcome), then, each only when it has rows, `## Waiting on`, `## Commits`, `## Refusals`, `## Incidents`, `## Agents`, `## Human answers`, `## Accepted findings`, `## Forge writes` and `## Pre-checks`. [`skraft report`](./cli.md) prints it.

## Statuses and codes <!-- #statuses-and-codes -->

The commands, the mod and the workflow return a **status** (`refused`: nothing was done; `blocked`: the run cannot move on; `waiting`: a human's answer is needed; `done`) and, when they stop, a **code**.

| Status | Code | When |
| --- | --- | --- |
| `refused` | `invalid-slug`, `invalid-base`, `invalid-args` | the slug is not kebab-case, `--base` is not a git ref, the arguments are unknown |
| `refused` | `config-invalid`, `configuration-incomplete`, `bdd-unbound` | `skraft-config.json` is invalid, a consent is unanswered, a `bdd` runner reads a folder that does not exist |
| `refused` | `forge-unreachable`, `base-unresolved`, `source-control-unavailable` | the forge, the merge base or Git cannot be reached |
| `refused` | `no-active-pipeline`, `slug-mismatch`, `not-initialised` | no valid `.active-slug`, another slug asked, no journal |
| `refused` | `pipeline-locked`, `lock-unavailable`, `journal-unverifiable` | another session drives the run, `.lock` cannot be written, the signature cannot be verified |
| `blocked` | `lock-lost`, `journal-tampered`, `journal-changed` | the lease was taken, the chain is broken, another run wrote meanwhile |
| `blocked` | `missing-outputs`, `invalid-result`, `design-records`, `research-records` | outputs missing, result unreadable, DESIGN or research records failed, and a human answered `STOP` |
| `blocked` | `scenarios` | the `## Scenarios` table of the test plan cannot be read ([rules](./phases.md#scenarios)) |
| `blocked` | `write-scope`, `uncommitted`, `adr-lifecycle`, `pull-request-prose` | the attempt wrote outside its scope, left files uncommitted, broke the ADR rules, or the prose is refused |
| `blocked` | `commit-convention`, `tdd` | a commit verdict above is not `ok` |
| `blocked` | `agent-blocked`, `agent-unavailable`, `agent-failed`, `interrupted` | the agent answered `blocked`, cannot start, stopped, or a person pressed Ctrl-C |
| `blocked` | `review-rejected`, `lens-inconclusive`, `loop-ceiling` | the review has no `NEEDS_REWORK` edge, a lens was inconclusive, an edge passed its `max_visits` |
| `blocked` | `node-retired`, `workflow-changed`, `workflow-invalid`, `environment` | a node the engine retired, a changed workflow, an invalid one, a human answered `ABORT` |
| `waiting` | the question's kind | a question has no answer: `skraft decide <key> <answer>` |
| `done` | — | the last phase is closed |

An agent refused the same way on two attempts in a row, or on its last attempt, asks the `blocked` question; after `STOP` the run keeps the code of the last refusal.

`skraft status` adds `idle` (no active pipeline), `tampered` (the chain is broken), `running` and `waiting`; a `step.started` written after a `run.finished` reopens the run.

## See also <!-- #see-also -->

[Phases](./phases.md), [Hosts](./hosts.md), [Resume or unblock a run](../how-to/resume-a-run.mdx), [Run the gates](../how-to/run-gates.md), [The skraft command line](./cli.md), [skraft-config.json](./skraft-config.md), [The event journal](../explanation/event-journal.md), [glossary](./glossary.md).
