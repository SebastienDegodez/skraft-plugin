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

## Skill structure

Four files, not one:

- `SKILL.md` — the loop, the minimal graph skeleton, the validation gate
- `references/graph-format.md` — full annotated spec (markers, `requires:` edges, golden-master gate), loaded on demand
- `references/worked-example.md` — a full traced cycle, loaded on demand
- `scripts/validate-mikado.sh` — a deterministic 8-pass Bash validator, **inspired by** the validator in [chaabani-anis/mikado-method](https://github.com/chaabani-anis/mikado-method) (MIT License) but **re-implemented** to parse SKRAFT's own Mermaid `graph TD` format — not that project's rail-notation text format; this is not a verbatim copy

## Precondition

A green safety net must exist ([characterize-with-contracts]({{ "/en/reference/skills/characterize-with-contracts" | relative_url }}) / [brownfield-harness-builder]({{ "/en/reference/agents/brownfield-harness-builder" | relative_url }})). Weak coverage produces false leaves; a CONCERNS/FAIL gate → strengthen the harness first.

## The four primitives (apply exactly)

1. **Goal** — one concrete, business-value-framed sentence agreed with the human (reject vague goals)
2. **Naive experiment** — isolated worktree, attempt the most obvious way, run build + full suite; this is a SENSOR, never a draft
3. **Visualize** — every failure is a prerequisite → graph node with an edge toward the goal; cite `file:line` + error
4. **Undo** — discard the worktree entirely; never `git stash`, never keep "almost working" code; the revert is free

## Exit contract

- Persisted graph: `.copilot-tracking/skraft-plans/{projectSlug}/refactoring/{YYYY-MM-DD}/mikado-<slug>.md`, Mermaid `graph TD`, nodes marked `[ ]`/`[x]` (pending/done), `observed` vs `anticipated` classes
- Dotted `-.requires.->` edges for prerequisites shared across multiple parents — the graph is a true DAG, not just a tree
- A mandatory golden-master gate: either a node whose label mentions "Golden Master", or an explicit Mermaid comment `%% no-golden-master: <reason>`
- Leaves implemented one at a time on the real branch, green commit after each
- Terminal signals to `brownfield-refactorer`: `ADVANCE` / `EXPAND` / `DONE` / `BLOCKED`

## Mandatory validation (8 passes)

```bash
bash plugins/skills/mikado-method/scripts/validate-mikado.sh <path-to-graph.md>
```

Run before every leaf commit and after every graph-update commit. Exit 0 required to proceed — never advance on an unvalidated graph.

1. **Parse** — nodes, edges, classes
2. **Traceability** — every non-goal node carries `discovered:` + `error:`, unless `anticipated`
3. **`requires:` reference validation** — every edge must resolve to a defined node
4. **Cycle detection** — across tree and `requires:` edges
5. **Tree-direction ancestry via git** — the child's `discovered:` commit must be ancestor-or-equal of the parent's, message matching the `refactor(mikado-graph): <what>` prefix; gated by `--no-git` for fixtures
6. **Orphan detection** (warning only)
7. **Golden-master gate** — a "Golden Master" node or `%% no-golden-master: <reason>`
8. **True-leaf enumeration** — ready for the next dispatch

## Invariants

- **A leaf = prerequisite with no unimplemented children** — never start a parent before its children
- **The graph is the artifact** — reload at every re-grounding boundary, never recall
- **observed vs anticipated** — confirm a hypothesis with a real attempt before treating it as a prerequisite
- **`requires:` = DAG, not tree** — a prerequisite shared by two parents is a cross-link, never duplicated
- **Golden-master gate before the first leaf** — a "Golden Master" node or an explicit `no-golden-master` declaration, otherwise the validator blocks
- **One `refactoring-worker` spawn per leaf** — signals `ADVANCE`/`EXPAND`/`DONE`/`BLOCKED`

## Why this shape

The graph survives between iterations; the failed experiment's code is always thrown away. Mikado only works with a safety net — without tests, nothing breaks because nothing is checked, not because nothing depends on it.

> « The main thing that distinguishes legacy code from non-legacy code is tests, or rather a lack of tests. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Allowed customisation

- Graph node classes (`observed` / `anticipated`)
- Granularity of leaves dispatched to the worker

## See also

- [characterize-with-contracts]({{ "/en/reference/skills/characterize-with-contracts" | relative_url }}) — Precondition: the green safety net
- [strangler-fig-method]({{ "/en/reference/skills/strangler-fig-method" | relative_url }}) — Alternative strategy (replacement rather than restructuring)
- [brownfield-refactorer]({{ "/en/reference/agents/brownfield-refactorer" | relative_url }}) — Agent that loads this skill and drives the loop
- [refactoring-worker]({{ "/en/reference/workers/refactoring-worker" | relative_url }}) — Implements each leaf in a fresh context
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
