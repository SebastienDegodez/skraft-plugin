---
layout: doc
lang: en
title: "State and recovery"
persona: tech-lead
description: "Why SKRAFT V2 replaces state.json with a chained event journal from which state is recomputed, and how that gives exact resume and detects deviations."
---

# State and recovery

> The engine does not write a state; it writes facts. State is recomputed on every read, and
> resume starts from the last recorded fact.

## The problem: a state anyone can write

In v1, the pipeline state lived in `.copilot-tracking/skraft-plans/<slug>/state.json`:
current phase, verdicts, retry counters. It was a snapshot, rewritten on each transition.

A snapshot has three weaknesses:

- it does not say **how** the pipeline got there;
- a hand edit, or one made by an agent through the shell, cannot be told apart from a
  legitimate write; v1 needed a hook (G7) to forbid it, and that hook only parsed POSIX
  commands;
- two runs writing at the same time overwrite each other without knowing it.

## An event journal instead

V2 replaces `state.json` with `events.jsonl`, in the same tracking folder. It is an **event
journal**: one JSON object per line, one event per fact. The run starts (`run.started`), a
step starts (`step.started`), its result is recorded (`step.recorded`), a phase closes
(`phase.closed`), the run stops or finishes (`run.stopped`, `run.finished`), a gate runs
(`gate.ran`). Each event carries its type and its time.

The engine writes each fact to the journal before deciding what comes next. It never edits a
line already written: it appends.

> « At its heart is the notion that you can use a different model to update information than the model you use to read information. »
> — Fowler, M., *Bliki: CQRS*, 2011.

## State is recomputed on read

The journal is the write model. The state (current phase, attempt, missing outputs, run
status) is the read model: the engine recomputes it on every read by replaying the events.
No state file can therefore drift from the journal.

`skraft status` and the "Skraft" pane of the Claude Code mod read this same recomputed view.
Full views, Copilot Canvas included, are planned for lot 8.

## Exact resume, without replaying a finished agent

An interrupted run (host closed, machine off, agent stopped) resumes where it stopped: the
engine re-reads the journal and recomputes the next step. Nothing is replayed "just in case".

- A started step whose output is already filled is recorded without spawning the agent again.
- A started step whose output is missing spawns the agent again, in the same attempt.
- An agent the host could not spawn (`agent-unavailable`) does not consume its attempt: the
  resume spawns it again.
- The git comparison base is journaled when the slug first starts; a resume keeps that one.

> **Coming next.** Questions to the human, with exact resume after the answer, are planned
> for lot 5. `skraft migrate`, which will convert an in-progress v1 `state.json` into a
> journal, is planned for lot 11.

## A hash chain to detect an edit

Each journal line carries in `prev` the SHA-256 hash of the previous line (`null` for the
first). Editing, deleting or inserting a line breaks the chain.

On the next read, the engine sees it and stops on `journal-tampered`, naming the faulty line:
restore the file or start a new slug. The engine repairs nothing and guesses nothing. This
check replaces the G7 hook, with no per-tool-call cost and in the same way on every host.

## A second run writing at the same time

If another run writes to the same journal while this one runs, the engine notices when it
appends its own fact and stops on `journal-changed`. Two runs cannot overwrite each other
silently; run again once the other run stops.

## `.active-slug`: never guessed

`.copilot-tracking/skraft-plans/.active-slug` names the active pipeline of the working copy.
It is mandatory. Without it, the engine refuses (`no-active-pipeline`) instead of picking the
latest folder. You switch pipelines by an explicit start: `/skraft <slug>`, `skraft init <slug>`
or the workflow with a `slug` make that slug active before starting anything. A call naming a
slug other than the active one without that init would be refused (`slug-mismatch`); it is an
internal safeguard that no current command triggers. Neither the engine nor an agent picks a slug on the
developer's behalf.

## One pipeline per worktree

Each git worktree has its own `.copilot-tracking/`, so its own `.active-slug` and its own
journals. Two stories progress in parallel in two worktrees without sharing state.

## Going further

- [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }}).
- [Reference: tracking folder, events.jsonl, codes]({{ "/en/reference/run-journal" | relative_url }}).
- [Guardrails: from hook to engine]({{ "/en/explanation/hooks" | relative_url }}).
- [Architecture]({{ "/en/explanation/architecture" | relative_url }}).

## Sources

- Fowler, M., *Bliki: CQRS*, 2011.
