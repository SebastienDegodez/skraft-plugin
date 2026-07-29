# DoR Scoring — Per-Item Rubric

Per-item verification guide for the 8-item Definition of Ready gate (G7). Applied by the `backlog-planner-reviewer` to every story before a DISCUSS approval verdict is issued.

---

## Scoring Overview

The DoR gate is binary per story: a story either passes all 8 items or it does not leave DISCUSS. The rubric defines:
- **Pass condition**: what "done" looks like for each item
- **Partial pass**: when an item is partially satisfied (reduces severity, does not eliminate the finding)
- **Fail condition**: what causes the item to fail
- **Severity**: the minimum severity assigned when this item fails

**Aggregate rule:** If a story has 2 or more failing DoR items → minimum verdict is `rejected`, regardless of individual severities.

---

## Item 1 — Problem Statement

**Pass condition:** The story body starts with a user-facing story statement. The capability describes an observable behaviour, not a technical implementation task. The "I want" clause contains no verbs such as: implement, build, create a service, refactor, migrate, add a repository.

**Partial pass:** N/A — this item is binary.

**Fail condition:** Persona is a developer/engineer/architect role. Capability describes a technical implementation. Benefit is about code quality, coverage, or architecture.

**Severity:** BLOCKER — triggers `rejected` (also triggers AP-DISCUSS-01: Implement-X)

**Auto-insurance pass:**
```
As a first-time driver applying for liability coverage,
I want to receive an eligibility decision after submitting my profile,
so that I know whether my application will succeed before spending time on document upload.
```

**Auto-insurance fail:**
```
As a developer,
I want to implement the EligibilityRepository using JPA,
so that the team has a data access layer.
```
→ Item 1 fails: BLOCKER.

---

## Item 2 — Specific Persona

**Pass condition:** The persona is a named domain role with contextual specificity. It identifies who is performing the action and in what context, differentiating them from other roles who might perform the same action differently.

**Partial pass:** A domain role is named (e.g., "driver") but lacks context (e.g., "a driver" without age, experience, or application stage). Severity reduced to HIGH (from would-be BLOCKER for fully generic).

**Fail condition:** Persona is "the user", "a user", "someone", "a person", "anyone", "a customer" with no further qualification.

**Severity:** HIGH

**Auto-insurance pass:**
- "a first-time driver applying for personal liability coverage"
- "an underwriter reviewing a borderline eligibility application"
- "a claims adjuster processing a collision claim in the back-office tool"

**Auto-insurance partial pass:**
- "a driver" — domain role present, context absent → HIGH finding

**Auto-insurance fail:**
- "a user" → HIGH finding

---

## Item 3 — 3+ Domain Examples

**Pass condition:** At least 3 concrete examples exist. Each example includes: specific persona details (age, role, context), real values (numbers, dates, specific conditions), and the expected outcome.

**Partial pass:** 1-2 examples exist but fewer than 3, OR examples exist but use vague quantities instead of real values.

| Condition | Severity |
|---|---|
| 0 examples | BLOCKER (also triggers AP-DISCUSS-05: No Examples) |
| 1-2 examples | HIGH |
| 3+ examples but vague values (AP-DISCUSS-02: Generic Data) | HIGH |
| 3+ examples with real values | PASS |

**Auto-insurance pass:**
```
1. Sophie Martin, 29 years old, B licence (8 years), 0 accidents → eligible, 30-day certificate
2. Karim Benali, 21 years old, B licence (2 years), 2 at-fault accidents (last 3 years) → not eligible
3. Isabelle Dupont, 17 years old, provisional licence → rejected (age < 18)
```

**Auto-insurance fail (0 examples):**
```
Domain examples: (none)
```
→ BLOCKER.

**Auto-insurance fail (vague):**
```
1. A young driver with accidents → not eligible
2. An experienced driver → eligible
3. A very young driver → rejected
```
→ HIGH (also AP-DISCUSS-02).

---

## Item 4 — UAT Scenarios

**Pass condition:** At least 3 Given/When/Then scenarios exist that a non-technical stakeholder (product owner, business analyst) could use to validate the story during user acceptance testing.

**Partial pass:** 1-2 UAT scenarios exist, or scenarios exist but are written in a format that requires technical knowledge to validate.

| Condition | Severity |
|---|---|
| 0 UAT scenarios | HIGH |
| 1-2 UAT scenarios | HIGH |
| 3+ scenarios but contain technical terms | HIGH (also G4 violation) |
| 3+ G/W/T scenarios in domain language | PASS |

**Auto-insurance pass:**
```
Given a driver aged 29 with 0 accidents and a valid B licence
When the driver submits their eligibility check request
Then the driver receives a confirmation valid for 30 days
And the driver can proceed to document upload
```

**Auto-insurance fail:**
```
Given the EligibilityService.Check() method is called
When profileId=42 is submitted
Then the method returns eligible=true
```
→ HIGH: technical implementation, not UAT scenario.

---

## Item 5 — AC Derived from UAT

**Pass condition:** A trace table exists (explicit or verifiable) showing each AC maps to at least one UAT scenario and domain example. No AC exists without a traceable source.

**Partial pass:** ACs exist and match UAT scenarios in content, but no explicit trace table is provided. Reviewer can verify the link manually.

**Fail condition:** ACs exist that cannot be traced to any domain example or UAT scenario.

| Condition | Severity |
|---|---|
| ACs with no traceable source | HIGH |
| Implicit trace (manual verification possible) | Pass with note |
| Explicit trace table | PASS |

**Auto-insurance fail:**
```
AC-04: The system logs all eligibility decisions to the audit trail.
(no corresponding UAT scenario, no domain example)
```
→ HIGH: fabricated AC with no user-facing motivation.

---

## Item 6 — Right-Sized

**Pass condition:** Effort estimate is XS, S, or M. L is acceptable when ACs are tight (4-5 ACs, clear scope, no major unknowns).

**Partial pass:** Estimate is L with loose ACs or unclear scope.

| Condition | Severity |
|---|---|
| Estimate is XL | BLOCKER (story must be split) |
| Estimate is L with 6+ ACs | HIGH |
| Estimate is L with loose scope | HIGH |
| Estimate is L with tight ACs (4-5) | PASS with note |
| Estimate is M or smaller | PASS |

**Note:** An XL estimate is always a BLOCKER. The story cannot proceed to DESIGN until split.

---

## Item 7 — Technical Notes

**Pass condition:** Technical Notes section is present and contains at least one of: an integration dependency with service name and version, a performance requirement with a threshold, a data constraint, or an explicit "None identified" statement.

**Partial pass:** Technical Notes section exists but is vague ("will need to call an external API" without service name or version).

| Condition | Severity |
|---|---|
| Technical Notes section absent | HIGH (if integration exists); LOW (if no integration) |
| Technical Notes vague (no specifics) | HIGH |
| "None identified" (explicit) | PASS |
| Specific notes with service name, version, threshold | PASS |

**Auto-insurance pass:**
```
Technical Notes:
- Calls eligibility-service v2 REST API (contract: [Confluence link])
- P95 response time < 2 seconds under 100 concurrent requests
- Eligibility result is stateless — not persisted at this stage
```

**Auto-insurance fail:**
```
Technical Notes: Will call the eligibility API.
```
→ HIGH: integration mentioned but no specifics.

---

## Item 8 — Dependencies

**Pass condition:** Dependencies section is present and lists all inter-story dependencies with reason. "None" is a valid and explicit value when the story is fully independent.

**Fail condition:** Dependencies section is absent. Story body references another story's output without a corresponding entry in Dependencies.

| Condition | Severity |
|---|---|
| Dependencies section absent | HIGH |
| Story references another story's output, no Dependencies entry | HIGH (also AP-DISCUSS-08) |
| Dependency listed but not in sprint (no "already done" confirmation) | HIGH |
| "None" (explicit, verified) | PASS |
| All dependencies listed with reason and sprint confirmation | PASS |

**Auto-insurance pass:**
```
Dependencies:
- STORY-01 (Driver Profile Form) — produces the driver profile submitted in this story's When step
- STORY-02 (Licence Validation) — confirms licence validity required by AC-01 and AC-03
Both stories are in the v0.2-eligibility sprint.
```

---

## Decision Table

Summary of per-item severities and their aggregate verdict impact:

| Items failing | Aggregate condition | Minimum verdict |
|---|---|---|
| 0 | All 8 items pass | Eligible for `approved` (subject to other lenses) |
| 1 item — BLOCKER severity | Item 1 (Implement-X), Item 3 (No Examples), Item 6 (XL) | `rejected` |
| 2+ items — any severity | Multiple items missing | `rejected` |
| 1 item — HIGH severity | Any single HIGH-severity item | `changes_requested` |

**Hard rule:** A story that fails ANY DoR item cannot be marked `status/ready`. It stays in DISCUSS until all 8 items pass.
