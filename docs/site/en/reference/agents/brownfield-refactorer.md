---
layout: doc
lang: en
title: "brownfield-refactorer"
description: "Drives a disciplined refactor (Mikado or Strangler Fig) of a brownfield component that already has a safety net, keeping it green at every commit. Standalone workflow."
persona: tech-lead
---

# brownfield-refactorer

> Picks a strategy with the human — Mikado (in-place restructuring) or Strangler Fig (incremental replacement behind a facade) — then drives the work leaf-by-leaf or slice-by-slice, safety net green at every commit.

## When to use

- Refactor or replace part of a brownfield codebase that already has a safety net (characterization/contract tests)
- "restructure/extract/decouple/change the ORM" → recommends Mikado
- "replace/rewrite/migrate" → recommends Strangler Fig
- Standalone workflow — invoked directly, not an orchestrator phase

## Entry contract

- A stated goal (what to modify, or what to replace)
- Confirmation that a safety net already exists for the target

## Exit contract

- Persisted plan artifact: `mikado-<slug>.md` or `strangler-<slug>.md`
- A sequence of green commits (one per completed leaf/slice)

## Invariants

- **Never picks the strategy for the human** — recommend, then let the human confirm (B10)
- **Never skips the safety-net check** — otherwise redirect to `brownfield-harness-builder`
- **Never lets a worker skip its revert/rollback discipline** — acceptance criteria carried verbatim in every packet
- **Never accumulates leaves/slices in one session** — one fresh `refactoring-worker` spawn per item (context isolation)

## Why this shape

The refactorer never does the refactor in one shot: it maintains the one artifact that survives the work (the graph or the slice plan), reloads it (B4) before every dispatch, and verifies the net stays green.

> « Refactoring (verb): to restructure software by applying a series of refactorings without changing its observable behavior. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

The loop reads the worker's terminal signal: `ADVANCE` (item done, continue), `EXPAND` (new items recorded, continue), `DONE` (goal reached), `BLOCKED` (human checkpoint).

## Allowed customisation

- Strategy recommendation thresholds (heavy coupling → Strangler to contain the blast radius)
- Slice granularity (default: one per endpoint)

## See also

- [mikado-method]({{ "/en/reference/skills/mikado-method" | relative_url }}) — In-place restructuring strategy
- [strangler-fig-method]({{ "/en/reference/skills/strangler-fig-method" | relative_url }}) — Incremental replacement strategy
- [refactoring-worker]({{ "/en/reference/workers/refactoring-worker" | relative_url }}) — Internal worker dispatched by this agent, one item per spawn
- [brownfield-harness-builder]({{ "/en/reference/agents/brownfield-harness-builder" | relative_url }}) — Precondition: builds the safety net
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
