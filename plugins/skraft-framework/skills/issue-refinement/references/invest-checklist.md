# INVEST Criteria Checklist

Per-criterion verification guide for user stories at the DISCUSS phase. Apply to every story before marking it ready for DESIGN.

---

## I — Independent

**Definition:** The story can be delivered without waiting for any other story to be completed first.

**Verification question:** "Can the team start and finish this story without another story being done first?"

**Pass condition:** No other story in the sprint must be completed before this one can start. If a dependency exists, it is either: (a) from a previous sprint (already done), or (b) listed in Dependencies and scheduled to complete before this story begins.

**Fail examples:**

| Violation | Story text signal |
|---|---|
| Implicit prerequisite | "The driver has already provided their personal details (from Story A)..." |
| Shared state dependency | "This story reads the eligibility certificate created by Story B..." |
| Sequential coupling | "Continuing from the previous step..." |

**Fix guidance:**
- Split the story so it is self-contained, OR
- Reorder: make Story A block Story B explicitly (list in Dependencies), OR
- Extract the shared prerequisite into an independent story that ships first and is marked as a dependency

**Auto-insurance example (fail):**
```
As a driver,
I want to review the eligibility certificate issued in the previous step...
```
→ Fails: depends on an unsplit "previous step" story.

**Auto-insurance example (pass):**
```
As a driver who has completed an eligibility check,
I want to download my eligibility certificate,
so that I can present it during document upload.
Dependencies: STORY-03 (Eligibility Check)
```
→ Passes: dependency is explicit and listed.

---

## N — Negotiable

**Definition:** The story is a conversation starter, not a fixed specification. Implementation details are open to discussion.

**Verification question:** "Does this story lock the team into a specific technology, architecture, or implementation approach?"

**Pass condition:** The story describes WHAT the user needs, not HOW it is built. Implementation choices are deferred to DESIGN.

**Fail examples:**

| Violation | Story text signal |
|---|---|
| Prescribed technology | "I want the system to use Redis for caching the eligibility result" |
| Prescribed architecture | "I want the team to implement a CQRS command handler for this" |
| Prescribed API contract | "I want the POST /api/eligibility endpoint to return..." |

**Fix guidance:**
- Move all implementation prescriptions to Technical Notes (as constraints to inform DESIGN, not mandates)
- Rewrite the capability as observable user behaviour
- Reserve "how" for DESIGN phase artefacts (contracts, ADRs)

**Auto-insurance example (fail):**
```
I want to call the EligibilityService.Check() method with a DriverProfileDTO...
```
→ Fails: prescribes a specific class and method signature.

**Auto-insurance example (pass):**
```
I want to receive an eligibility decision for my submitted profile...
```
→ Passes: describes desired outcome, implementation is open.

---

## V — Valuable

**Definition:** Delivering this story alone creates observable value for a user or the business.

**Verification question:** "Would a non-technical stakeholder notice or care if this story was never shipped?"

**Pass condition:** The story produces a user-visible or business-visible outcome when delivered in isolation.

**Fail examples:**

| Violation | Story text signal |
|---|---|
| Pure infrastructure | "As a developer, I want to refactor the eligibility module" |
| Enabling story with no direct value | "I want to add a database migration for the new column" |
| Internal-only value | "I want to improve logging in the claims service" |

**Fix guidance:**
- Wrap technical work in its user-visible consequence: "As a driver, I want my eligibility check to complete within 2 seconds" (the performance work is now tied to user value)
- If the work is genuinely infrastructure with no user-visible outcome, escalate to DESIGN for an architectural story (not a DISCUSS story)

**Auto-insurance example (fail):**
```
As a developer,
I want to add unit tests for the EligibilityRepository,
so that coverage reaches 80%.
```
→ Fails: no user value. This is a technical task, not a story.

**Auto-insurance example (pass):**
```
As a driver,
I want to receive an eligibility decision within 2 seconds,
so that I can complete my application during a single session.
Technical Notes: Performance testing confirms P95 < 2s under 100 concurrent users.
```
→ Passes: user-visible performance outcome drives the implementation work.

---

## E — Estimable

**Definition:** The team can agree on a T-shirt size estimate without open-ended discussion.

**Verification question:** "Can a team of three engineers agree on XS/S/M/L in under 5 minutes?"

**Pass condition:** Scope is clear, acceptance criteria are written, known technical constraints are noted. Unknowns are bounded.

**Fail examples:**

| Violation | Story text signal |
|---|---|
| Scope ambiguity | No AC written; story body is a single vague sentence |
| Unknown integration | "We will need to call the legacy COBOL system" (no further detail) |
| Missing technical notes | Story touches external API with no version, contract, or constraint noted |

**Fix guidance:**
- Write ACs first — estimation is impossible without ACs
- Add a spike story for major technical unknowns before estimating
- Add Technical Notes with known integration constraints

**Auto-insurance example (fail):**
```
Story: Driver gets insurance
(No ACs, no technical notes, no domain examples)
```
→ Fails: estimation is impossible.

**Auto-insurance example (pass):**
```
3 ACs written, domain examples with real values, technical notes: "calls eligibility-service v2 REST API — contract available in Confluence".
Estimate: M (1 day) — pattern already exists from STORY-02.
```
→ Passes: team has enough information to converge on M.

---

## S — Small

**Definition:** Deliverable in 1-3 days by a single engineer, or 1-2 days pair-programming.

**Verification question:** "Can one engineer complete, test, and demo this story in a 3-day window?"

**Pass condition:** Effort is XS, S, or M. L is acceptable if ACs are tight and the team accepts the risk. XL is always a split signal.

**Fail examples:**

| Violation | Signal |
|---|---|
| XL estimate | Effort > 3 days, team cannot reduce scope |
| 6+ ACs | More ACs than can be implemented and tested in 1-3 days |
| Multiple personas | Story serves 3 different user roles with distinct flows |

**Fix guidance:**
Apply one of the 6 splitting patterns (see splitting-patterns.md):
- By workflow step (most common for large stories)
- By business rule (most common when many edge cases exist)
- By acceptance criteria (when each AC is independently deliverable)

**Auto-insurance example (fail):**
```
Story: Insurance application end-to-end
Effort: XL (estimate: 2 weeks)
ACs: 12
```
→ Fails: must split before continuing.

**Auto-insurance example (pass):**
```
Story: Driver eligibility check
Effort: M (1 day)
ACs: 3 (happy path, rejection, under-age rejection)
```
→ Passes.

---

## T — Testable

**Definition:** Acceptance criteria can be written that a non-technical stakeholder could validate.

**Verification question:** "Can a product owner validate this story without looking at the code?"

**Pass condition:** At least 3 Given/When/Then acceptance criteria exist, derived from domain examples. Each AC describes an observable outcome.

**Fail examples:**

| Violation | Signal |
|---|---|
| No ACs | "The eligibility system works correctly" |
| Unmeasurable AC | "Performance is acceptable" (no threshold) |
| Untestable AC | "The code is clean and maintainable" |

**Fix guidance:**
- Add concrete domain examples first — ACs emerge naturally from them
- Replace vague ACs with measurable thresholds: "within 2 seconds" not "fast"
- Remove ACs about code quality — these belong in the team's Definition of Done, not the story

**Auto-insurance example (fail):**
```
AC-01: The eligibility check works correctly for all driver profiles.
```
→ Fails: "correctly" is not verifiable by a stakeholder.

**Auto-insurance example (pass):**
```
AC-01:
Given a driver aged 29 with 0 accidents and a valid B licence
When the driver submits their eligibility check request
Then the driver receives a confirmation valid for 30 days
```
→ Passes: a product owner can validate this with a demo.

---

## Summary Checklist

| Criterion | Verification question | Common fix |
|---|---|---|
| Independent | Can this start without another story being done? | List dependencies explicitly; split if implicit |
| Negotiable | Does this prescribe implementation? | Move HOW to Technical Notes; keep WHAT in story body |
| Valuable | Would a stakeholder notice if this was never shipped? | Reframe technical work as user-visible outcomes |
| Estimable | Can the team size this in 5 minutes? | Write ACs first; add spike for unknown integrations |
| Small | Is this deliverable in 1-3 days? | Apply splitting pattern for L/XL estimates |
| Testable | Can a product owner validate this without code? | Add concrete G/W/T ACs from domain examples |
