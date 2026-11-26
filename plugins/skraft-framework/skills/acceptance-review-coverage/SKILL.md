---
name: acceptance-review-coverage
description: "Use when reviewing DISTILL artefacts as the coverage-lens, or self-checking them before the review: gates G1, G2. Checks that every acceptance criterion and business rule of a DISTILL story has its own scenario, edge and error cases included."
---

# Coverage lens — gates

Gates G1, G2 of the DISTILL review, the gates the `coverage-lens` judges by. A finding's `gate` names one row below.


| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| AC–Scenario bijection | G1 | Every acceptance criterion of `ac-draft-{story}.md` has its own scenario, no scenario holds two criteria, no scenario lacks a source criterion (its `@AC-<n>` tag); every input and expected value of a scenario equals its criterion's. | Each AC one scenario of its own, no merged scenario, no orphan scenario, no value its AC does not state. | BLOCKER |
| Edge case representation | G2 | Boundary conditions and negative cases from the domain examples in the story are represented, each as an `Examples` row of the scenario of the criterion it belongs to, or as the scenario of a criterion of its own. Only the story and its acceptance criteria give examples: a Gherkin mapping, an example or a variant a DESIGN document writes (event model, tactical design) is none, and a variant an earlier rule of the story already decides (a precedence) adds no boundary. A technical input case (a value of the wrong type, `NaN`, infinity, `null`/`undefined`, a number written as text) is no business rule: it is never asked for as a scenario, and belongs in the test plan as an inner-loop unit case citing its DESIGN decision. | ≥1 edge case or boundary condition per business rule, an `Examples` row of its criterion's scenario or a criterion's own scenario; every technical input case DESIGN decides is in the test plan. | HIGH |

**Checking G1:**
1. List all ACs from `ac-draft-{story}.md`
2. List all scenarios from `*.feature` with their `@AC-<n>` tag
3. Flag any AC with no scenario of its own, any scenario carrying two `@AC` tags or the cases of two ACs (merged), and any scenario whose tag names no AC (orphan)
4. Flag any input or expected value of a scenario that its AC does not state
