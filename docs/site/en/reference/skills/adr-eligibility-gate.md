---
layout: doc
lang: en
title: "adr-eligibility-gate"
description: "Use BEFORE drafting any ADR when a story enters DESIGN phase. Runs a baseline-vs-decision gate: determines whether a..."
persona: tech-lead
---

# adr-eligibility-gate

> A pre-draft gate that runs a **baseline-vs-decision** check on every candidate architectural choice — preventing ADR over-production by filtering out non-decisions before any draft is written.

## When to use

- DESIGN phase begins for a story and the architect considers documenting a choice
- A reviewer flags `ADR-INFLATION` (multiple ADRs for a story where 0–1 is expected)
- User asks "should I write an ADR for X?", "how many ADRs does this story need?", or "is this ADR-worthy?"
- "disambiguate baseline from decision" is requested

## Entry contract

- A candidate architectural choice (framed as a question or proposed decision)
- Access to the project skill baseline (`architecture-decisions`, `architecture-patterns`, `clean-architecture-*`)
- The current story or batch context (ACs, event model, technical constraints)

## Exit contract

For each candidate, a verdict in the standard output format:

```
Candidate: <short description>
Verdict: ELIGIBLE | NOT ELIGIBLE
Reason: <1-line citation to Q1–Q5 + skill/ADR section>
```

## Invariants

The gate runs the **5-Question Checklist** in order; the **first `YES` determines the verdict**:

| Question | If YES → verdict |
|---|---|
| **Q1** — Is this already enforced by a project skill or architecture test? | `NOT ELIGIBLE — <cite skill/ADR>` |
| **Q2** — Is this a "good practice" or "avoid antipattern" framing? | `NOT ELIGIBLE — baseline good practice / antipattern avoidance` |
| **Q3** — Does the choice add complexity beyond the project baseline? | proceed to Q4 (if YES) |
| **Q4** — Was the question actually raised by a story, AC, or measurable force? | `NOT ELIGIBLE — unraised question; non-decision artefact (G14)` (if NO) |
| **Q5** — Does the choice have genuine trade-offs (not only upsides)? | `NOT ELIGIBLE — no genuine trade-offs; should be baseline` (if NO) |

Only a choice that clears **all five questions** is `ELIGIBLE`.

**Anti-patterns detected:**

| Anti-pattern | Description | Gate catches it via |
|---|---|---|
| **ADR-INFLATION** | Multiple ADRs for baseline re-declarations | Q1 |
| **NON-DECISION** | ADR for a choice with no alternatives | Q5 |
| **BASELINE DRIFT** | Project baseline not reflected in ADR filters | Q1 + Q3 |
| **UNRAISED QUESTION** | ADR for a question nobody asked (G14) | Q4 |
| **GOOD-PRACTICE ADR** | ADR for "avoid X" or "always Y" framing | Q2 |

## Why this shape

Without a pre-draft gate, teams write ADRs for things they were never going to debate — baseline conventions, good practices, and unraised questions. The cost is not just wasted effort: ADR-INFLATION dilutes the signal of the records that matter, making the institutional memory harder to navigate.

> « Every pattern has a context, a problem, and a solution. Without the context, a pattern is a hammer looking for nails. »
> — Evans, E., *Domain-Driven Design*, 2003.

## Allowed customisation

- Q1 baseline list (extend as new project skills are added) (L1)
- Q3 complexity-adding pattern list (L1)
- Output format verbosity (L2)

## See also

- [architecture-decisions]({{ "/en/reference/skills/architecture-decisions" | relative_url }}) — Provides HOW to write the ADR body once the gate passes
- [architecture-patterns]({{ "/en/reference/skills/architecture-patterns" | relative_url }}) — Consulted by Q3 to assess complexity additions
- [architecture-review-criteria]({{ "/en/reference/skills/architecture-review-criteria" | relative_url }}) — Gate G14 (non-decision artefact) is caught by Q4
