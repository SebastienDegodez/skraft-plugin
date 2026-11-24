---
name: adr-eligibility-gate
description: >
  Use when deciding WHETHER a candidate architectural choice deserves an
  architecture decision record, before any record is drafted: a story enters
  DESIGN with a list of candidate choices, a reviewer flags ADR inflation, or
  someone asks "should I write an ADR for X?", "how many ADRs does this story
  need?", "is this ADR-worthy?", "this feels like too many ADRs", "disambiguate
  baseline from decision". Runs a baseline-vs-decision gate over each candidate
  and returns ELIGIBLE or NOT ELIGIBLE with the baseline, convention or
  architecture test that already covers it. Do NOT use when the decision is
  already settled and the user asks for the record to be written, when the
  request is about the ADR template, status transitions, superseding or
  lifecycle, or when the question is which pattern to adopt — those belong to
  architecture-decisions and architecture-patterns.
---

# ADR Eligibility Gate

## Overview

A pre-draft gate: load it before writing any ADR body. A whole project carries only a handful of ADRs, so the gate refuses by default.

**Posture:** every candidate is `NOT ELIGIBLE` until the gate proves otherwise. Zero eligible is the normal outcome of a story: zero ADRs, each choice written in place in the design artefact it belongs to.

**When to activate:**
- DESIGN phase begins for a story
- Architect considers documenting a choice
- Reviewer flags `ADR-INFLATION`
- User asks "should I write an ADR for X?" or "how many ADRs does this need?"

---

## Candidates that may pass

CQRS with a dispatch bus; Event Sourcing; a saga or process manager; an aggregate crossing an existing boundary; a bounded-context split or merge, or a physical isolation or coupling mechanism between contexts that departs from the baseline; a cross-cutting strategy change (errors, validation, transaction boundary). Each still answers every question below.

## Never an ADR

- the project baseline: CQS method-level separation, layer boundaries, convention-based DI, the repository pattern and where an interface lives (Domain or Application: `clean-architecture-<stack>` decides it), anything a skill or an architecture test enforces;
- anything `AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/architecture/` or an `Accepted` ADR already decides, tested or not — a supersession the stories force excepted;
- the bounded contexts and their relationships (ACL, Conformist, Published Language, Open Host Service, Shared Kernel): they go in the context map;
- a choice confined to one bounded context — an aggregate, value object, domain event or gateway, a translation inside its gateway, a mapping, a local type: it goes in the diagrams and contracts;
- a choice argued from a future need ("identical today", "may diverge", "in case"): no story raised it;
- the event model's Command/Query classification.

**Silence is baseline:** a pattern no story or measurable force raised gets no ADR, neither `Accepted` nor `Rejected`. A `Rejected` ADR records a raised question the team declined.

---

## The 5-Question Checklist

Answer in order; the first answer that points to `NOT ELIGIBLE` decides. `ELIGIBLE` only when all five point to it.

| Q | Question | Points to NOT ELIGIBLE when |
|---|---|---|
| Q1 | Is it in the Never-an-ADR list? | YES — cite the item and the skill, document or ADR that settles it |
| Q2 | Is it framed as a good practice or "avoid X" (no hardcoding, DRY, no magic strings)? | YES |
| Q3 | Is it one of the candidates that may pass, adding complexity beyond the baseline? | NO |
| Q4 | Did a story, an acceptance criterion or a measurable force of this batch raise the question? | NO — unraised question (G14) |
| Q5 | Does it trade at least two of the 5 Universal Forces of `architecture-decisions` against each other? | NO — no genuine trade-off |

## Output Format

One row per candidate, in the consistency matrix:

```
| Candidate | Verdict | Deciding question | Citation | Written in |
|---|---|---|---|---|
| Pure domain service with no IO | NOT ELIGIBLE | Q1 — baseline layering | clean-architecture-<stack> | diagrams |
| Repository interface in Domain | NOT ELIGIBLE | Q1 — where an interface lives | clean-architecture-<stack> | contracts |
| ACL between Eligibility and Policy | NOT ELIGIBLE | Q1 — context relationship | context-map.md | context-map.md |
| Separate read model "in case load grows" | NOT ELIGIBLE | Q1 — future need | — | — |
| Fail-closed posture for the dispatch gate | ELIGIBLE | Q1–Q5 pass: cross-cutting error strategy, AC-04, over-blocking vs silent drift | AC-04 | ADR |
```

---

## Integration with `architecture-decisions`

This gate decides IF an ADR is warranted; `architecture-decisions` gives HOW to write one. For an `ELIGIBLE` candidate, write its ranked priorities before any option and judge every option against them.

## Anti-patterns Detected by This Gate

| Anti-pattern | Description | Gate catches it via |
|---|---|---|
| **ADR-INFLATION** | ADRs re-declaring baseline or already-decided choices | Q1 |
| **GOOD-PRACTICE ADR** | ADR for an "avoid X" or "always Y" framing | Q2 |
| **BASELINE DRIFT** | A choice with no complexity beyond the baseline | Q3 |
| **UNRAISED QUESTION** | ADR for a question nobody asked (G14) | Q4 |
| **NON-DECISION** | ADR for a choice with no real alternative | Q5 |

---

## Dependencies

- the `architecture-decisions` skill (5 Universal Forces, ADR template)
- the `architecture-patterns` skill (baseline patterns for Q3)

---

## Evals

### Content evals

1. **Candidate:** "pure domain service with no IO"  
   **Expected:** `NOT ELIGIBLE — Q1 (baseline layering)`

2. **Candidate:** "fail-closed posture for a security gate", raised by an acceptance criterion  
   **Expected:** `ELIGIBLE — Q3 (cross-cutting concern), Q5 (trade-off)`

3. **Candidate:** "no hardcoded phase names"  
   **Expected:** `NOT ELIGIBLE — Q2 (good practice)`

4. **Candidate:** "Command/Query classification of the new triggers"  
   **Expected:** `NOT ELIGIBLE — Q1 (event model classification)`

### Trigger evals

**Should-trigger (8):**
- "should I write an ADR for this choice?"
- "how many ADRs does story X need?"
- "is this ADR-worthy?"
- "ADR-INFLATION detected in DESIGN review"
- "disambiguate baseline from decision"
- "this feels like too many ADRs"
- "evaluate candidate architectural choice"
- "before drafting ADR"

**Should-not-trigger (8):**
- "how do I write an ADR?" → `architecture-decisions`
- "what's the ADR template?" → `architecture-decisions`
- "list existing ADRs" → grep / index read
- "ratify ADR-005" → human gate
- "event modeling for story X" → `architecture-patterns`
- "which DDD pattern should I use?" → `architecture-patterns`
- "write the ADR body" → `architecture-decisions`
- "supersede ADR-001" → `architecture-decisions` lifecycle

---

## Version

**v2.0** — 2026-11-25 — Refusal by default; Never-an-ADR list; context relationships, single-context choices and Command/Query classification are no longer eligible.
