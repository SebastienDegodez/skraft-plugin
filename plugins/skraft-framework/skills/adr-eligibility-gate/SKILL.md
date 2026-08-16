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

This skill operationalizes the "When NOT to write an ADR" section of the
`architecture-decisions` skill as a **pre-draft gate**. Load it when considering
whether a candidate architectural choice warrants an ADR, before writing any
ADR body.

**Core question:** Does this choice ratify a genuine open question with real
trade-offs, or does it re-declare project baseline / existing skill-enforced
convention?

**When to activate:**
- DESIGN phase begins for a story
- Architect considers documenting a choice
- Reviewer flags `ADR-INFLATION` (multiple ADRs for a story where 0-1 expected)
- User asks "should I write an ADR for X?" or "how many ADRs does this need?"

---

## The 5-Question Checklist

For each candidate choice, answer these questions in order. The FIRST `YES`
determines the verdict.

### Q1: Is this choice already enforced by a project skill or automated architecture test?

**Examples of baseline (NOT ADR-worthy):**
- "Pure domain service with no IO" → ADR-002 hexagonal baseline enforces this
- "CQS at method level" (one handler per command/query) → `clean-architecture-*` skill
- "Validation at the boundary, keep core pure" → hexagonal baseline + tactical DDD
- "Convention-based DI registration" → project skill baseline
- "Value Object + pure validator" → tactical DDD baseline

**If YES → `NOT ELIGIBLE — <cite skill or ADR that already enforces this>`**

---

### Q2: Is this choice a "good practice" or "avoid X antipattern" framing?

**Examples:**
- "No hardcoded phase names" → good practice, not a decision
- "Don't duplicate validation logic" → DRY principle, not a decision
- "Avoid magic strings" → coding standard, not a decision

**Good practices and antipattern avoidance are baseline expectations, not
architectural decisions.**

**If YES → `NOT ELIGIBLE — baseline good practice / antipattern avoidance`**

**Exception:** If the choice is framed as a **context-mapping relationship**
(e.g., "config as Published Language, guard as Conformist") rather than just
"no hardcoding", proceed to Q3.

---

### Q3: Does the choice add complexity beyond the project baseline?

Load `architecture-patterns` skill. Check whether the choice is one of:
- Establishing or changing a layer boundary
- Choosing an aggregate boundary
- **Adopting** a pattern that adds complexity: CQRS+Bus, Event Sourcing, Saga,
  Specification, ACL, Published Language, Conformist
- Establishing a bounded context boundary
- Affecting a cross-cutting concern (error handling strategy, validation approach)

**If NO → `NOT ELIGIBLE — no complexity addition beyond baseline`**

**If YES → proceed to Q4.**

---

### Q4: Was the question actually raised by a story, AC, or measurable force in the current batch?

**Silence = baseline default.** ADRs (whether `Accepted` or `Rejected`) ratify
questions that were **actually asked**. A `Rejected` ADR is legitimate ONLY when
a story or measurable force in the batch raised the question.

**Check:**
- Does an AC explicitly require evaluating this choice?
- Did the event model surface this as a decision point?
- Did a technical constraint (performance, security, integration) force the question?

**If NO → `NOT ELIGIBLE — unraised question; non-decision artefact (G14)`**

**If YES → proceed to Q5.**

---

### Q5: Does the choice have genuine trade-offs (not only upsides)?

Every ADR must demonstrate **trade-off analysis**. If the choice has only
benefits and no downsides, it is not a decision — it is a no-brainer that should
be baseline.

**Check the 5 Universal Forces** (from `architecture-decisions` skill):
- Simplicity
- Consistency
- Performance
- Evolvability
- Team capability

**If the choice scores high on ALL five → `NOT ELIGIBLE — no genuine trade-offs; should be baseline`**

**If the choice creates tension between at least two forces → `ELIGIBLE — genuine trade-off`**

---

## Output Format

For each candidate:

```
Candidate: <short description>
Verdict: ELIGIBLE | NOT ELIGIBLE
Reason: <1-line citation to Q1-Q5 + skill/ADR section>
```

**Example (US3 candidates):**

```
Candidate: Pure domain service with no IO
Verdict: NOT ELIGIBLE
Reason: Q1 YES — ADR-002 hexagonal baseline enforces purity

Candidate: Fail-closed posture for dispatch gate
Verdict: ELIGIBLE
Reason: Q1 NO, Q2 NO, Q3 YES (cross-cutting error strategy), Q4 YES (AC-04), Q5 YES (over-blocking vs silent drift)

Candidate: VO + validation at boundary
Verdict: NOT ELIGIBLE
Reason: Q1 YES — hexagonal baseline + tactical DDD enforce this

Candidate: No hardcoded phase names
Verdict: NOT ELIGIBLE (as framed)
Reason: Q2 YES — "no hardcoding" is a good practice, not a decision

Candidate (reframed): Config as Published Language, guard as Conformist
Verdict: ELIGIBLE
Reason: Q2 NO (context-mapping), Q3 YES (Published Language adoption), Q4 YES (event model), Q5 YES (coupling vs drift)
```

---

## Integration with `architecture-decisions` Skill

This gate does NOT replace `architecture-decisions` — it **precedes** it:

1. **Gate (this skill):** Determines IF an ADR is warranted.
2. **Template (architecture-decisions):** Provides HOW to write the ADR body if the gate passes.

**Load order:**
- `adr-eligibility-gate` → verdict per candidate
- If `ELIGIBLE` → load `architecture-decisions` for template + lifecycle

---

## Anti-patterns Detected by This Gate

| Anti-pattern | Description | Gate catches it via |
|---|---|---|
| **ADR-INFLATION** | Multiple ADRs for baseline re-declarations | Q1 |
| **NON-DECISION** | ADR for a choice with no alternatives | Q5 |
| **BASELINE DRIFT** | Project baseline not reflected in ADR filters | Q1 + Q3 |
| **UNRAISED QUESTION** | ADR for a question nobody asked (G14) | Q4 |
| **GOOD-PRACTICE ADR** | ADR for "avoid X" or "always Y" framing | Q2 |

---

## Real-World Calibration

Run this gate on **existing ADRs** to verify calibration:

| ADR | Expected Verdict | Actual Q-path |
|---|---|---|
| ADR-001 (Result type) | ELIGIBLE | Q1 NO, Q3 YES, Q4 YES (#47), Q5 YES |
| ADR-002 (Hexagonal) | ELIGIBLE | Q1 NO (first in project), Q3 YES, Q4 YES (#47), Q5 YES |
| ADR-003 (Config cascade) | ELIGIBLE | Q1 NO, Q3 YES, Q4 YES (#47), Q5 YES |
| ADR-004 (pure service, US3) | NOT ELIGIBLE | Q1 YES — ADR-002 baseline |
| ADR-005 (fail-closed, US3) | ELIGIBLE | Q1 NO, Q3 YES (cross-cutting), Q4 YES, Q5 YES |
| ADR-006 (VO + validation, US3) | NOT ELIGIBLE | Q1 YES — hexagonal + DDD baseline |
| ADR-007 (no hardcoding, US3) | NOT ELIGIBLE (as framed) / ELIGIBLE (reframed) | Q2 YES (good practice) / Q3 YES (Published Language) |

**If the gate yields unexpected verdicts on ADR-001..003, recalibrate Q1/Q3.**

---

## Dependencies

- `plugins/skraft-framework/skills/architecture-decisions/SKILL.md` (cites "When NOT to write an ADR")
- `plugins/skraft-framework/skills/architecture-patterns/SKILL.md` (cites baseline patterns for Q3)

---

## Evals

### Content evals

1. **Candidate:** "pure domain service with no IO"  
   **Expected:** `NOT ELIGIBLE — ADR-002 hexagonal baseline`

2. **Candidate:** "fail-closed posture for a security gate"  
   **Expected:** `ELIGIBLE — Q3 YES (cross-cutting concern), Q5 YES`

3. **Candidate:** "no hardcoded phase names"  
   **Expected:** `NOT ELIGIBLE — Q2 YES (good practice)`

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

**v1.0** — 2026-06-28 — Initial release (genesis output, US3 case study)
