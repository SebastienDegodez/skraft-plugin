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

Result: no command hook ships. `hooks/hooks.json` holds one line,
`{ "modules": ["./skraft-mod.tsx"] }`: it declares the **Claude Code mod module**, the code that
gives Claude Code the `/skraft` command, the `run_pipeline` tool and the Skraft pane. That module
runs nothing on a tool call; it drives the engine, as the Copilot workflow does under Copilot.

## What replaces each guardrail

| v1 guardrail | In V2 |
| --- | --- |
| SessionStart (export of `SKRAFT_PLUGIN_ROOT`, log purge) | Removed: no environment variable is needed, the engine gives absolute paths in each brief. Nothing replaces the purge yet |
| Dispatch provenance | Removed: it never had the caller's name. Only the driver spawns agents, and no agent spawns another |
| G1 phase order | The engine computes the next step from the workflow graph and the journal; an agent starts only when the run reaches its node |
| G9 brief completeness | The engine composes the brief itself, with the absolute path of every input and output |
| G2 skill injection | The brief lists the skills the agent reads before it starts, by absolute path, on every host |
| G3 check on sub-agent stop, G3 trace | Removed; actual skill loading is measured by Vally evaluations |
| Dispatch log | Engine events in `events.jsonl` |
| G4 / G5 artifacts, verdict, commit | Expected outputs pre-created then checked; the review verdict computed by the engine; commit convention and TDD red commits checked after each step |
| G7 direct state write | Journal hash chain and signature, checked on every read; a hand edit stops the run |
| G8 write scope | Engine git diff after each step, compared with what the agent may write. Under Claude Code the orchestrator has no edit tool; under VS Code it writes only the reply files the agent loop lists |

Two more checks have no v1 equivalent: the **session lease**, which refuses a second session
on a run another one drives, and the **locked and mandatory nodes** of the workflow, which a
repository copy cannot drop silently.

## Prevent or detect

A hook **prevents**: it refuses the tool call before it happens. The engine **detects**: it
finds after the step that a file was edited by hand, that an output is missing, that an agent
wrote outside its scope or committed a red test that passes, and it refuses the step or stops
the run and says so.

This is a deliberate choice. Without hooks, an agent spawned by hand outside the engine is not
stopped while it works; the deviation is found afterwards, by the journal or the git diff.
In exchange, the check is the same on every host, is tested without a host, and costs tool
calls nothing.

## When a hook may come back

A hook comes back only if it meets all three conditions:

1. it guards an **irreversible** action the engine cannot detect afterwards;
2. its per-call cost is **measured**;
3. it works on Claude Code, Copilot CLI and VS Code, or documents its failure behaviour on
   each.

No hook has met these conditions so far.

## What no guardrail covers

Neither a hook nor the engine detects a **factual error**: an invented business rule, an
endpoint that does not exist, wrong domain knowledge baked into a test. They check the
structure of the work (order, outputs, integrity, gates), not the truth of its content. That
remains the job of review and of business acceptance tests.

Wiegers (*Peer Reviews in Software*, 2002) ranks peer review among the most effective quality
practices: it, not a mechanical guardrail, catches this kind of error.

## Going further

- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — the engine, the drivers, depth 1.
- [State and recovery]({{ "/en/explanation/hve-core" | relative_url }}) — the signed hash chain that replaces G7.
- [Reference: tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}).
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }}).

## Sources

- Wiegers, K., *Peer Reviews in Software*, 2002.
