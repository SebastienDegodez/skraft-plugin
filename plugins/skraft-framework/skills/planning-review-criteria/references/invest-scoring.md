# INVEST Scoring Rubric

Per-criterion scoring guide used by the `backlog-planner-reviewer` when evaluating G1 (INVEST compliance). Applied to every story in the sprint.

---

## Scoring Overview

Each INVEST criterion is evaluated independently. A story must pass ALL 6 criteria to achieve a G1 pass. Failing one criterion produces a HIGH finding for that criterion. Failing multiple criteria on the same story produces multiple HIGH findings — they stack toward `changes_requested`.

Exception: when a story violates **Small** by being XL (not just L), the finding is escalated to BLOCKER because an XL story cannot be refined into a valid implementation plan.

---

## I — Independent

**Pass condition:** The story can be started and completed without waiting for another story. Any prerequisite from another story is explicitly listed in `Dependencies` and confirmed to be in the same sprint or already done.

**Fail conditions:**

| # | Failure mode | Severity |
|---|---|---|
| I-1 | Story body references another story's output without listing it in Dependencies | HIGH |
| I-2 | Story says "continuing from the previous step" or "building on Story X" | HIGH |
| I-3 | A listed dependency is not in the sprint and has no "already done" confirmation | HIGH |

**Remediation:** Add the missing dependency to the Dependencies section and confirm its sprint placement. If the story cannot start without an un-schedulable dependency, move it to the next milestone.

**Auto-insurance example (fail — I-1):**
```
Story: STORY-05 — Payment Processing
AC-01: Given the driver's eligibility certificate number is displayed...
Dependencies: None
```
→ Story references eligibility certificate from STORY-03, not listed. I-1 violation.

**Auto-insurance example (pass):**
```
Dependencies:
- STORY-03 (Eligibility Check) — produces eligibility certificate number used in AC-01
```
→ I passes.

---

## N — Negotiable

**Pass condition:** The story body describes observable user behaviour only. Implementation decisions are absent from the story statement and ACs. Technical constraints appear only in the Technical Notes section.

**Fail conditions:**

| # | Failure mode | Severity |
|---|---|---|
| N-1 | Story capability or ACs prescribe a specific class, method, or API endpoint | HIGH |
| N-2 | Story prescribes a technology (framework, library, database) | HIGH |
| N-3 | Story prescribes an architectural pattern (CQRS, event sourcing, REST) | HIGH |

**Remediation:** Move all implementation prescriptions from story body and ACs to Technical Notes. Rewrite capability as an observable outcome.

**Auto-insurance example (fail — N-1):**
```
I want the EligibilityService.Check(DriverProfileDTO) to be invoked via the
application's IoC container and return an EligibilityResultDTO.
```
→ Prescribes class names, method signature, IoC container.

**Auto-insurance example (pass):**
```
I want to receive an eligibility decision immediately after submitting my profile.
Technical Notes: Integrates with eligibility-service v2 API (details at DESIGN phase).
```
→ N passes.

---

## V — Valuable

**Pass condition:** Delivering this story alone — without any other story — creates observable value for a user or the business.

**Fail conditions:**

| # | Failure mode | Severity |
|---|---|---|
| V-1 | Story persona is a developer, engineer, or technical role | HIGH |
| V-2 | Story benefit is entirely internal (code quality, coverage %, refactoring outcome) | HIGH |
| V-3 | Story is an enabler with no standalone user-visible value | HIGH |

**Remediation:** Wrap technical necessity in its user-visible consequence. If no user-visible consequence exists, remove from DISCUSS and handle as a technical task tracked outside the user story pipeline.

**Auto-insurance example (fail — V-2):**
```
As a developer,
I want to add unit tests for EligibilityRepository,
so that code coverage reaches 80%.
```
→ No user-visible value. V fails.

**Auto-insurance example (pass):**
```
As a first-time driver,
I want to receive an eligibility decision within 2 seconds,
so that I can complete my application in one sitting.
```
→ User-visible performance outcome. V passes.

---

## E — Estimable

**Pass condition:** A team can agree on a T-shirt size for the story in 5 minutes with confidence. ACs are written. Technical Notes cover known constraints. No major unknowns remain unaddressed.

**Fail conditions:**

| # | Failure mode | Severity |
|---|---|---|
| E-1 | No ACs written — scope is undefined | HIGH |
| E-2 | Major technical unknown (external integration, new infrastructure) with no Technical Notes | HIGH |
| E-3 | Team cannot converge on a T-shirt size in 5 minutes during review | HIGH |

**Remediation:** Write ACs before estimating. Add a spike story for major unknowns. Add Technical Notes with known integration constraints.

**Auto-insurance example (fail — E-2):**
```
Technical Notes: (none)
[Story integrates with an external insurance bureau API for the first time]
```
→ Unknown integration, no notes. E fails.

**Auto-insurance example (pass):**
```
Technical Notes: Calls eligibility-service v2 REST API.
Contract: [Confluence link]. Response SLA: P95 < 2s.
Estimate: M (1 day) — pattern exists from STORY-02.
```
→ E passes.

---

## S — Small

**Pass condition:** Story effort is XS, S, or M. L is acceptable if ACs are tight and scope is well-defined. XL is always a failure.

**Fail conditions:**

| # | Failure mode | Severity |
|---|---|---|
| S-1 | Effort estimate is XL (> 3 days) | BLOCKER |
| S-2 | Story has 6+ ACs without a split plan | HIGH |
| S-3 | Story touches 3+ distinct user actions in a single sprint-able unit | HIGH |

**Remediation for S-1 (BLOCKER):** Story MUST be split before DoR can be claimed. Apply splitting pattern from issue-refinement skill. XL stories cannot be approved.

**Remediation for S-2 and S-3 (HIGH):** Apply splitting pattern. Group ACs by scenario family. Verify each resulting story is M or smaller.

**Auto-insurance example (fail — S-1):**
```
Story: Insurance Application End-to-End
Effort: XL
ACs: 12 (covering: personal details, vehicle, eligibility, documents, payment, confirmation)
```
→ XL estimate. S-1 BLOCKER. Must split.

**Auto-insurance example (pass):**
```
Story: STORY-03 — Driver Eligibility Check
Effort: M (1 day)
ACs: 3 (eligible, ineligible, under-age)
```
→ S passes.

---

## T — Testable

**Pass condition:** At least 3 ACs in Given/When/Then or bullet-list format, derived from domain examples. A product owner can validate each AC during a demo without looking at code.

**Fail conditions:**

| # | Failure mode | Severity |
|---|---|---|
| T-1 | Fewer than 3 ACs | HIGH |
| T-2 | AC describes code quality, not user outcome ("the code is clean") | HIGH |
| T-3 | AC uses unmeasurable qualifiers without thresholds ("fast", "correct", "properly") | HIGH |
| T-4 | AC references system internals (service names, HTTP codes) | HIGH (also G3 violation) |

**Remediation:** Add domain examples first. Derive one G/W/T AC per example. Replace vague qualifiers with measurable thresholds.

**Auto-insurance example (fail — T-3):**
```
AC-01: The eligibility check returns a fast response when the driver submits their profile.
```
→ "Fast" is not measurable. T-3 violation.

**Auto-insurance example (pass):**
```
AC-01:
Given a driver aged 29 with 0 accidents and a valid B licence
When the driver submits their profile
Then the driver receives an eligibility confirmation within 2 seconds
```
→ T passes.

---

## INVEST Summary Scoring Table

| Criterion | Auto-fail trigger | Severity | Common fix |
|---|---|---|---|
| Independent | Implicit dependency not listed | HIGH | Add to Dependencies section |
| Negotiable | Class/method/API names in story body | HIGH | Move to Technical Notes |
| Valuable | Developer persona, no user outcome | HIGH | Reframe as user consequence |
| Estimable | No ACs, unknown integration | HIGH | Write ACs; add spike story |
| Small (L+) | XL estimate | BLOCKER | Split (mandatory) |
| Small (tight) | 6+ ACs, 3+ user actions | HIGH | Apply splitting pattern |
| Testable | < 3 ACs, vague outcomes | HIGH | Add examples first; derive ACs |
