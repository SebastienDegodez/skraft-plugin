<!-- markdownlint-disable-file -->
---
adr: 10
title: The SKRAFT pipeline runs as code, driven by host adapters; the dispatch guards move into the use case
status: Proposed
chosen: one host-neutral use case (RunPipeline) driven by a Claude Code mod and a Copilot dynamic workflow
decision: >
  We will run the engineering pipeline as an application use case, RunPipeline, behind driven ports,
  composed by a Claude Code mod and a GitHub Copilot dynamic workflow; the orchestrator agent becomes a
  launcher, the dispatch-order (G1) and handoff (G9) checks run in the use case before every dispatch,
  and the PreToolUse G1/G9 and PostToolUse G6 hooks are removed.
supersedes: ADR-004
date: 2026-10-06
ratified_by: null
---

# ADR-010 — The SKRAFT pipeline runs as code, driven by host adapters

**Date:** 2026-10-06
**Status:** Proposed
**Deciders:** to be ratified by the maintainer

## Context

The pipeline was carried by a 29 KB prose agent, `skraft-orchestrator`. Every run spent
reasoning tokens re-reading its protocol, calling `state.mjs` one subcommand at a time, and
pasting handoff blocks. Settings hooks policed that prose from outside: G1 refused a phase
agent dispatched out of order, G9 refused a dispatch whose prompt dropped a recorded input,
G6 reminded the orchestrator, after each agent returned, what to record next. ADR-004 made
G1 a fail-closed `PreToolUse(Agent)` hook because nothing else stood between the prose and a
wrong dispatch.

Both hosts now let code drive agents. Claude Code mods (`$.agent.spawn`, `$.ui.ask`, `$.fs`,
`$.process.run`, `$.state`) run plugin modules inside the session; GitHub Copilot dynamic
workflows (`ctx.agent`, `ctx.pause`) run a durable, resumable script. A deterministic
sequence no longer needs a language model to execute it.

## Decision

1. **One use case, every host.** `RunPipeline` (`src/application/pipeline/`) sequences the
   phases, dispatches specialists and reviewers, reads verdicts from review files, runs the
   retries, checkpoints and ADR ratification, verifies the quality-gate evidence and runs the
   structural scan in process, recovers `state.json`, closes phases by hand
   (`CloseManually`), and renders and publishes the reports. Decisions live in pure domain
   policies; IO goes through driven ports (ADR-002). The hosts only compose: the Claude Code
   mod (`hooks/skraft-mod.mjs`) and the Copilot extension
   (`com.github.copilot/extensions/skraft-pipeline/extension.mjs`).
2. **G1 and G9 move into the use case.** Before every dispatch, RunPipeline evaluates the
   dispatch order (`evaluateDispatch`) and, on the composed prompt, the handoff
   (`evaluateHandoff`), on the state it wrote itself. A refusal stops the run `blocked`;
   nothing is sent. The checks stay fail-closed, as ADR-004 required, without a hook.
3. **The hooks that policed the prose are removed**: `PreToolUse` G1 and G9, `PostToolUse`
   G6 (and its `Task` alias). Provenance, G7/G8, G2/G3 and housekeeping stay: they watch
   what agents do, which no code path sees.
4. **Only the host's MCP calls are delegated.** Report publication keeps its protocol in
   code (prepare, decide, record); reading and writing remote comments goes through a
   `ReportTransport` port, implemented by a general-purpose agent of the host that answers
   one JSON object.
5. **The orchestrator agent becomes a launcher**; its prose and the `state.mjs` /
   `report.mjs` paths only it used are marked obsolete, kept for manual repair.

## Consequences

**Positive**
- The sequence costs no reasoning tokens; the language model works only inside the phase
  agents.
- One implementation for two hosts, unit-tested with in-memory doubles and an integration
  test per host.
- Guards that were advisory around prose are invariants of the code that dispatches.

**Negative**
- Copilot dynamic workflows and extensions are in public preview; the mod runtime has no
  rename or delete on files (the state writer backs up on each phase change and checks a
  read-back instead of renaming).
- A user who dispatches phase agents by hand, outside RunPipeline, is no longer stopped by
  G1/G9; provenance and G7/G8 still apply.

**Supersedes** ADR-004: the deny-by-default dispatch gate survives, but as a check of the
use case, not as a `PreToolUse(Agent)` hook.
