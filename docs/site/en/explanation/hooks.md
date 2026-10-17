---
layout: doc
lang: en
title: "Guardrails: from hook to engine"
description: "Why SKRAFT V2 starts with zero hooks, what replaces each v1 guardrail, and under which condition a hook may come back."
sidebar_position: 18
persona: tech-lead
---

# Guardrails: from hook to engine

> In v1, hooks watched the agent on every tool call. In V2, the engine that spawns the agent
> checks what matters itself, before and after each step.

## What a guardrail was in v1

A **hook** is a program the host runs on an event: before a tool call, when a sub-agent
starts or stops, when a session opens. v1 used hooks to enforce its invariants: phase order
(G1), skills loaded (G2, G3), no direct write to `state.json` (G7), the orchestrator's write
scope (G8), completeness of an agent's brief (G9).

The idea was right: an invariant is only worth something if it is enforced mechanically.
What changed is where to enforce it.

## Why V2 starts with zero hooks

### A cost on every tool call

v1 declared five hook entries with no filter: every tool call started a `node` process, on
every host, for every agent. That cost was paid even when no invariant was at stake. V2 aims
at 0 ms of overhead per tool call.

### Behaviour that differs by host

A hook depends on what the host passes to it and on how the host honours its answer. Found in
v1:

- dispatch provenance never saw the calling agent's name;
- the G3 trace stayed inert under Claude Code;
- G8 blocked DELIVER under Copilot;
- G7 only parsed POSIX shell commands, not PowerShell.

The same pipeline therefore behaved differently depending on the tool. That is the opposite
of what SKRAFT promises.

### Checks the engine already makes

In V2, the engine composes each agent's brief itself, sets its outputs, and writes the
journal. It no longer needs to watch a model that would write state through the shell: state
is no longer a file the agent edits, it is a journal the engine re-reads and checks.

Result: `hooks/hooks.json` declares only the Claude Code mod module. No command hook ships.

## What replaces each guardrail

| v1 guardrail | In V2 | Available |
| --- | --- | --- |
| SessionStart (export of `SKRAFT_PLUGIN_ROOT`, log purge) | Removed: no environment variable is needed any more, the engine gives absolute paths. The purge is to become a `skraft housekeeping` command | Variable: yes. Purge: planned, not available yet |
| Dispatch provenance | Removed: it never had the caller's name. Only the driver spawns agents | Yes |
| G1 phase order, G9 brief completeness | In the engine, which computes the next step and composes the brief | Yes for RESEARCH; DESIGN, DISTILL, DELIVER in lot 3 |
| G2 skill injection | `skills:` header under Claude Code; elsewhere, absolute paths of the required skills in the brief | Lot 6 |
| G3 check on sub-agent stop, G3 trace | Removed; actual skill loading is measured by Vally evaluations | Yes |
| Dispatch log | Engine events in `events.jsonl` | Yes |
| G7 direct state write | Journal hash chain, checked on the next read | Yes |
| G8 write scope | Engine git diff after each step; the orchestrator has no edit tool | Lot 3 |

> **Coming next.** The write-scope check by git diff, step by step, is planned for lot 3.
> Until then, only RESEARCH runs through the engine.

## Prevent or detect

A hook **prevents**: it refuses the tool call before it happens. The engine **detects**: it
finds after the step that a file was edited by hand, that the output is missing, or (in
lot 3) that an agent wrote outside its scope, and it stops the run and says so.

This is a deliberate choice. Without hooks, an agent spawned by hand outside the engine is not
stopped while it works; the deviation is found afterwards, by the hash chain or the git diff.
In exchange, the check is the same on every host, is tested without a host, and costs tool
calls nothing.

## When a hook may come back

A hook comes back only if it meets all three conditions:

1. it guards an **irreversible** action the engine cannot detect afterwards;
2. its per-call cost is **measured**;
3. it works on Claude Code, Copilot CLI and VS Code, or documents its failure behaviour on
   each.

> **Coming next.** Measurement on real runs, which will tell whether a hook must come back,
> is planned for lot 10.

## What no guardrail covers

Neither a hook nor the engine detects a **factual error**: an invented business rule, an
endpoint that does not exist, wrong domain knowledge baked into a test. They check the
structure of the work (order, outputs, integrity, gates), not the truth of its content. That
remains the job of review and of business acceptance tests.

Wiegers (*Peer Reviews in Software*, 2002) ranks peer review among the most effective quality
practices: it, not a mechanical guardrail, catches this kind of error.

## Going further

- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — the engine, the drivers, depth 1.
- [State and recovery]({{ "/en/explanation/hve-core" | relative_url }}) — the hash chain that replaces G7.
- [Reference: tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}).
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }}).

## Sources

- Wiegers, K., *Peer Reviews in Software*, 2002.
