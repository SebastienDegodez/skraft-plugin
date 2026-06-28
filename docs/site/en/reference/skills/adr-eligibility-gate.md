---
layout: doc
lang: en
title: "adr-eligibility-gate"
description: "Use BEFORE drafting any ADR when a story enters DESIGN phase, or when reviewing an ADR set that feels inflated."
persona: tech-lead
---

# adr-eligibility-gate

> Pre-draft gate that runs a baseline-vs-decision check on each candidate architectural choice and emits an `ELIGIBLE` or `NOT ELIGIBLE` verdict before any ADR body is written.

## When to use

- DESIGN phase begins for a story and the team considers documenting architectural choices
- Architect evaluates whether a candidate choice warrants an ADR before writing any body
- Reviewer flags `ADR-INFLATION` (multiple ADRs for a story where 0–1 is expected)
- Question is raised: "should I write an ADR for X?", "how many ADRs does this story need?", or "disambiguate baseline from decision"

## Entry contract

- One or more candidate architectural choices to evaluate
- Current architectural context (DESIGN phase artefacts, stories, acceptance criteria)
- Access to `architecture-patterns` skill (required for Q3 evaluation)
- Reference to active project skills and existing ADRs (for Q1 baseline check)

## Exit contract

For each candidate, the gate emits a structured verdict:

```
Candidate: <short description>
Verdict: ELIGIBLE | NOT ELIGIBLE
Reason: <1-line citation to Q1-Q5 + skill/ADR section>
```

`ELIGIBLE` candidates proceed to `architecture-decisions` for template and lifecycle. `NOT ELIGIBLE` candidates are dropped — no ADR body is written.

## Invariants

**Core question:** Does this choice ratify a genuine open question with real trade-offs, or does it re-declare project baseline / existing skill-enforced convention?

### 5-Question Checklist

Answer in order. Stop at the first question that yields a verdict.

| # | Question | Verdict if YES | Verdict if NO |
|---|---|---|---|
| Q1 | Already enforced by a project skill or automated architecture test? | NOT ELIGIBLE — cite the skill or ADR | → Q2 |
| Q2 | Framed as "good practice" or "avoid X antipattern"? *(Exception: context-mapping relationship → Q3)* | NOT ELIGIBLE — baseline good practice / antipattern avoidance | → Q3 |
| Q3 | Adds complexity beyond the project baseline? *(load `architecture-patterns` — layer boundary, aggregate boundary, CQRS+Bus, Event Sourcing, Saga, Specification, ACL, Published Language, Conformist, bounded context boundary, or cross-cutting concern)* | → Q4 | NOT ELIGIBLE — no complexity addition beyond baseline |
| Q4 | Raised by a story, AC, or measurable force in the current batch? *(Silence = baseline default)* | → Q5 | NOT ELIGIBLE — unraised question; non-decision artefact (G14) |
| Q5 | Creates tension between at least two of the 5 Universal Forces? *(Simplicity, Consistency, Performance, Evolvability, Team capability)* | ELIGIBLE — genuine trade-off | NOT ELIGIBLE — no genuine trade-offs; should be baseline |

### Anti-patterns detected

| Anti-pattern | Description | Gate catches it via |
|---|---|---|
| **ADR-INFLATION** | Multiple ADRs for baseline re-declarations | Q1 |
| **NON-DECISION** | ADR for a choice with no alternatives | Q5 |
| **BASELINE DRIFT** | Project baseline not reflected in ADR filters | Q1 + Q3 |
| **UNRAISED QUESTION** | ADR for a question nobody asked (G14) | Q4 |
| **GOOD-PRACTICE ADR** | ADR for "avoid X" or "always Y" framing | Q2 |

### Load order

`adr-eligibility-gate` → verdict per candidate → if `ELIGIBLE` → load `architecture-decisions` for template and lifecycle.

## Why this shape

Every structural choice carries an option cost: documenting a non-decision is waste; omitting a real decision is drift. The gate front-loads the question "is there a genuine trade-off?" before any prose is written, keeping the ADR set lean and each record meaningful.

> « Leave as many options open as possible for as long as possible. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Allowed customisation

- Additional baseline references to check in Q1 (e.g., project-specific ADRs added to the known-enforced list) (L1)
- Extra forces to evaluate in Q5 beyond the 5 Universal Forces (L2)
- Recalibration of Q1/Q3 thresholds by running the gate on existing ADRs (L1)

## See also

- [architecture-decisions]({{ "/en/reference/skills/architecture-decisions" | relative_url }}) — Template and lifecycle for ADRs that pass this gate
- [architecture-patterns]({{ "/en/reference/skills/architecture-patterns" | relative_url }}) — Pattern catalogue consulted at Q3
- [architecture-review-criteria]({{ "/en/reference/skills/architecture-review-criteria" | relative_url }}) — Gate G14 guards against unraised-question ADRs
- [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }}) — Agent that runs this gate in DESIGN phase
