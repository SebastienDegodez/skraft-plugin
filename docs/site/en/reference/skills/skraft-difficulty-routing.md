---
layout: doc
lang: en
title: "skraft-difficulty-routing"
description: "Use at DISCOVER exit to evaluate 3-axis routing (entry point, depth tier, difficulty tier), validate immutable invari..."
persona: tech-lead
---

# skraft-difficulty-routing

> Evaluates three orthogonal axes at the DISCOVER phase exit (entry point, depth tier, difficulty tier) and persists the decision to `state.json` before transitioning to DISCUSS.

## When to use

- At the DISCOVER phase exit, once per pipeline run
- Before any transition to DISCUSS
- Invoked by the SKRAFT orchestrator after DISCOVER artifact validation

## Entry contract

- Validated DISCOVER artifacts
- Explicit user preferences (if a non-`comprehensive` `depthTier` was requested)
- `state.json` existing or creatable at the plan root

## Exit contract

- `state.json::entryPoint` — active phases for this run
- `state.json::userPreferences.depthTier` — strictness level (`basic`, `standard`, `comprehensive`, `custom`)
- `state.json::difficulty` — DELIVER execution model (`simple`, `medium`, `medium-hard`, `challenging`)
- Routing summary displayed to the user (emoji checklist ✅ / 🛡️)
- `state.json::depthTierOverrides` appended if `depthTier != comprehensive`

## Invariants

- **TDD mandatory** — at minimum Red-Green, without exception for any tier
- **Clean Architecture boundaries** — Domain depends on neither Application nor Infrastructure
- **Test integrity** — no test deleted or disabled to pass GREEN
- **`state.json` schema compliance** — every turn produces a valid document
- **`comprehensive` by default** — any reduction requires explicit decision with rationale
- **`custom` forbids invalid combinations** — orchestrator refuses and requests correction before proceeding
- **Single evaluation** — difficulty is assessed at DISCOVER exit and never re-evaluated mid-pipeline

## Why this shape

Explicit routing prevents silent quality-level drift between runs. Persisting the decision in `state.json` makes it auditable and consultable by all pipeline agents.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

Immutable invariants guarantee that no `custom` configuration can remove TDD or violate architectural boundaries — the pipeline's trustworthiness rests on this guarantee.

## Allowed customisation

- `depthTier` choice (`basic`, `standard`, `custom`) with rationale (L1)
- `customDepth` per gate when `depthTier: custom` (L2)
- Phase bypass via `entryPoint` if required artifacts already exist (L2)

## See also

- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — Double-loop TDD cycle (`comprehensive` tier)
- [mutation-testing]({{ "/en/reference/skills/mutation-testing" | relative_url }}) — Mutation thresholds by `depthTier`
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that consumes the difficulty
