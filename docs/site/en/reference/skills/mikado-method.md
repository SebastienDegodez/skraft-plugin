---
layout: doc
lang: en
title: "mikado-method"
description: "Refactor code IN PLACE via the Mikado loop: attempt naively, capture what breaks as prerequisites, revert, implement bottom-up from the leaves."
persona: tech-lead
---

# mikado-method

> A discipline for restructuring code whose true dependency graph is not knowable in advance: try it, let the compiler and tests reveal the dependencies, revert, then build the prerequisites bottom-up.

## When to use

- In-place change likely to break in hard-to-predict ways
- Loaded internally by [brownfield-refactorer]({{ "/en/reference/agents/brownfield-refactorer" | relative_url }}) when the human chooses in-place restructuring over Strangler Fig

## Precondition

A green safety net must exist ([characterize-with-contracts]({{ "/en/reference/skills/characterize-with-contracts" | relative_url }}) / [brownfield-harness-builder]({{ "/en/reference/agents/brownfield-harness-builder" | relative_url }})). Weak coverage produces false leaves; a CONCERNS/FAIL gate → strengthen the harness first.

## The four primitives (apply exactly)

1. **Goal** — one concrete, business-value-framed sentence agreed with the human (reject vague goals)
2. **Naive experiment** — isolated worktree, attempt the most obvious way, run build + full suite; this is a SENSOR, never a draft
3. **Visualize** — every failure is a prerequisite → graph node with an edge toward the goal; cite `file:line` + error
4. **Undo** — discard the worktree entirely; never `git stash`, never keep "almost working" code; the revert is free

## Exit contract

- Persisted Mermaid `graph TD`: `mikado-<slug>.md` (`observed` vs `anticipated` nodes)
- Leaves implemented one at a time on the real branch, green commit after each

## Invariants

- **A leaf = prerequisite with no unimplemented children** — never start a parent before its children
- **The graph is the artifact** — reload at every re-grounding boundary, never recall
- **observed vs anticipated** — confirm a hypothesis with a real attempt before treating it as a prerequisite
- **One `refactoring-worker` spawn per leaf** — signals `ADVANCE`/`EXPAND`/`DONE`/`BLOCKED`

## Why this shape

The graph survives between iterations; the failed experiment's code is always thrown away. Mikado only works with a safety net — without tests, nothing breaks because nothing is checked, not because nothing depends on it.

> « The main thing that distinguishes legacy code from non-legacy code is tests, or rather a lack of tests. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Allowed customisation

- Graph node classes (`observed` / `anticipated`)
- Granularity of leaves dispatched to the worker

## See also

- [brownfield-refactorer]({{ "/en/reference/agents/brownfield-refactorer" | relative_url }}) — Agent that loads this skill and drives the loop
- [refactoring-worker]({{ "/en/reference/workers/refactoring-worker" | relative_url }}) — Implements each leaf in a fresh context
- [strangler-fig-method]({{ "/en/reference/skills/strangler-fig-method" | relative_url }}) — Alternative strategy (replacement rather than restructuring)
- [characterize-with-contracts]({{ "/en/reference/skills/characterize-with-contracts" | relative_url }}) — Precondition: the green safety net
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
