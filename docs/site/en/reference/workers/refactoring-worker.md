---
layout: doc
lang: en
title: "refactoring-worker"
description: "[Internal worker — dispatched by brownfield-refactorer only] Drives a single Mikado leaf or Strangler slice to a terminal state in a fresh, isolated context."
persona: brownfield-refactorer
---

# refactoring-worker

> Internal worker dispatched by `brownfield-refactorer`: handles exactly ONE item — one Mikado leaf or one Strangler slice — per invocation, in a fresh context with no memory of prior items.

## When active

Dispatched by `brownfield-refactorer` to drive a single refactor item to a terminal state. Not user-invocable directly.

It does not decide strategy, does not maintain the graph/plan across invocations, and does not proceed to a second item.

## Inputs

**Required:**
- Full current graph/slice-plan artifact content
- The specific leaf/slice to implement, verbatim
- Acceptance criteria (from `mikado-method` or `strangler-fig-method`), verbatim

## Output

Structured terminal signal returned to the orchestrator — no commit on `EXPAND`/`BLOCKED`:

```json
{
  "signal": "ADVANCE | EXPAND | DONE | BLOCKED",
  "item": "<leaf id or slice id>",
  "committed": true,
  "new_items": [],
  "notes": "<one line>"
}
```

## Workflow

**Mikado leaf:** isolated worktree while still experimental → attempt the leaf → run the safety net (characterization + contract) + full regression (S7) → new failures beyond scope = `EXPAND` (record prerequisites, discard the attempt) → green = commit on the real branch + `ADVANCE` (or `DONE` if last leaf).

**Strangler slice:** implement the NEW version → replay the characterization tests NEW vs OLD (contract equivalence) → full harness green → equivalent = cut the facade over + commit + `ADVANCE` (or `DONE` once OLD is unreachable); unflagged difference / slice too large = `EXPAND` or `BLOCKED`.

## Invariants

- **Scope strictly to the assigned item** — nothing else changes, even a spotted improvement
- **Undiscovered prerequisites → STOP** — report `EXPAND` with the sub-items, never force it
- **Never fabricates a pass** — "the safety net passes" comes from an actual tool-run (S7), never from recall
- **Never skips the revert (Mikado) or the cutover gate (Strangler)** — the loaded skill's discipline, verbatim
- **Exactly one terminal signal per invocation**

## Why this shape

One fresh spawn per item is the context-isolation discipline the reconciliation loop depends on: no drift between items, and reverting a failed experiment is free.

> « Refactoring changes the program in small steps, so if you make a mistake, it is easy to find where the bug is. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

## See also

- [brownfield-refactorer]({{ "/en/reference/agents/brownfield-refactorer" | relative_url }}) — Agent that dispatches this worker and maintains the artifact
- [mikado-method]({{ "/en/reference/skills/mikado-method" | relative_url }}) — Leaf contract (naive experiment, revert)
- [strangler-fig-method]({{ "/en/reference/skills/strangler-fig-method" | relative_url }}) — Slice contract (equivalence, cutover)
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
