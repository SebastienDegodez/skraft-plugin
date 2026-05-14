# Definition of Ready — 8-Item Gate

A story does NOT leave the DISCUSS phase unless ALL 8 items pass. A single failing item keeps the story in DISCUSS.

---

## Item 1 — Problem Statement

**Definition:** The story articulates a concrete user problem or need. It does NOT describe a technical implementation task.

**Pass condition:** The story body starts with "As a {persona}, I want {observable capability}, so that {business benefit}." The benefit is user-visible or business-visible.

**Fail example:**
```
As a developer, I want to implement the EligibilityRepository interface.
```

**How to fix:** Identify the user behind the technical task. Ask "who benefits from this implementation and what do they experience?" Rewrite from that perspective.

**Auto-insurance domain pass example:**
```
As a first-time driver,
I want to receive an immediate eligibility decision after profile submission,
so that I can decide whether to continue the application without waiting for an agent.
```

---

## Item 2 — Specific Persona

**Definition:** The persona is a named role with specific context, not a generic placeholder.

**Pass condition:** The persona is a specific role in the domain (driver, underwriter, claims adjuster, insurance agent, policyholder). The context differentiates this persona from others who perform the same action differently.

**Fail examples:**
- "As a user..."
- "As someone who..."
- "As a person who needs insurance..."
- "As a customer..."

**How to fix:** Identify the role. If multiple roles could perform this action with different outcomes, split by interface or persona (see splitting-patterns.md Pattern 4).

**Auto-insurance domain pass examples:**
- "As a first-time driver applying for liability coverage..."
- "As an underwriter reviewing a borderline eligibility case..."
- "As a claims adjuster processing a collision claim..."
- "As a policyholder renewing their annual policy..."

---

## Item 3 — 3+ Domain Examples

**Definition:** At least three concrete, specific examples from the domain, using real values. Examples represent the range of inputs and corresponding outcomes.

**Pass condition:** Each example includes: specific persona details (age, role, context), real values (accident count, licence type, dates, coverage type), and the expected outcome.

**Fail example:**
```
Domain examples:
- A driver with a clean record → eligible
- A driver with accidents → not eligible
```

**How to fix:** Replace vague descriptions with real values. Pull examples from product specifications, edge case discussions, or domain expert interviews.

**Auto-insurance domain pass example:**
```
Domain examples:
1. Sophie Martin, 29 years old, B licence valid 8 years, 0 accidents — expects eligibility
   confirmation valid for 30 days
2. Karim Benali, 21 years old, B licence valid 2 years, 2 at-fault accidents in last 3 years —
   expects ineligibility notice: "accident threshold exceeded"
3. Isabelle Dupont, 17 years old, provisional licence — expects immediate rejection:
   "below minimum age (minimum: 18)"
```

---

## Item 4 — UAT Scenarios

**Definition:** Given/When/Then scenarios that a non-technical stakeholder (product owner, business analyst, domain expert) could validate during user acceptance testing.

**Pass condition:** At least 3 G/W/T scenarios exist, each derived from a domain example (traceability to Item 3). The Given sets up real domain state. The When is one business action. The Then is a user-observable outcome.

**Fail example:**
```
UAT: The system returns a result.
```

**How to fix:** Convert each domain example into a G/W/T scenario. The Given = the example's context. The When = the user's action. The Then = the expected outcome from the example.

**Auto-insurance domain pass example:**
```
Given a driver aged 29 with 0 accidents in the last 5 years and a valid B licence
When the driver submits their profile for an eligibility check
Then the driver receives a confirmation valid for 30 days
And the driver can proceed to the document upload step
```

---

## Item 5 — AC Derived from UAT

**Definition:** Every acceptance criterion traces back to a UAT scenario. No AC is invented without a corresponding domain example or UAT scenario.

**Pass condition:** For each AC, there is an identifiable UAT scenario from which it was derived. ACs without traceability are fabrications and must be removed or added as new UAT scenarios first.

**Fail example:**
```
AC-04: The system logs all eligibility decisions.
(no corresponding UAT scenario, no domain example)
```

**How to fix:** Either (a) add a UAT scenario and domain example that motivates this AC, or (b) move the requirement to Technical Notes as a non-functional constraint. Logging requirements rarely belong in story ACs.

**Traceability check:**
Write a trace table:

| AC | Source UAT scenario | Source domain example |
|---|---|---|
| AC-01 (eligible confirmation) | UAT-1 | Example 1 (Sophie Martin) |
| AC-02 (ineligibility notice) | UAT-2 | Example 2 (Karim Benali) |
| AC-03 (under-age rejection) | UAT-3 | Example 3 (Isabelle Dupont) |

---

## Item 6 — Right-Sized

**Definition:** The story is deliverable in 1-3 days by a single engineer, or 1-2 days pair-programming.

**Pass condition:** Effort estimate is XS, S, or M. L is acceptable if all ACs are tight and scope is locked. XL is always a hard failure.

**Fail condition:** Estimate is XL. Or estimate is L but the team cannot agree on what is in scope.

**How to fix:** Apply a splitting pattern (see splitting-patterns.md). Split until the largest piece is L or smaller. An XL story must be split before DoR can be claimed.

**Sizing reference:**

| Size | Duration | AC count (guideline) |
|---|---|---|
| XS | < 2 hours | 1 |
| S | 2-4 hours | 2 |
| M | 1 day | 3-4 |
| L | 2-3 days | 4-5 |
| XL | > 3 days | 6+ → **split required** |

---

## Item 7 — Technical Notes

**Definition:** Known technical constraints, integration requirements, performance thresholds, and data format considerations are documented.

**Pass condition:** Technical Notes section is present and contains at least one of: an integration dependency (name and version), a performance requirement, a data constraint, or an explicit "None identified" statement (acceptable when the story has no technical concerns).

**Fail condition:** Technical Notes section is absent or empty. A story touching an external API with no integration note fails this item.

**How to fix:** Before finalising the story, ask the team:
- Does this story call an external service? → Document service name and version
- Is there a performance threshold? → Document it with a metric (e.g., "P95 < 2s")
- Are there data format constraints? → Document expected formats
- Does this story have no technical notes? → Write "None identified" explicitly

**Auto-insurance domain pass example:**
```
Technical Notes:
- Calls eligibility-service v2 REST API. Contract documented at [Confluence link].
- Response must be returned within 2 seconds (P95) under 100 concurrent users.
- Eligibility certificate validity: 30 days (configurable — confirm with business owner).
- The check is stateless; results are NOT persisted to the database at this stage.
```

---

## Item 8 — Dependencies

**Definition:** Inter-story dependencies are identified, listed, and confirmed as resolvable within the sprint plan.

**Pass condition:** Dependencies section lists all other stories this story depends on, with reason. "None" is a valid value when the story is fully independent. Each listed dependency is either already done or scheduled in the same sprint with appropriate sequencing.

**Fail condition:**
- Story references another story's output without listing it as a dependency
- A listed dependency is not in the sprint and no delivery plan exists
- Dependencies section is missing entirely

**How to fix:** For each piece of data or functionality this story consumes, trace back to the story that produces it. List it in Dependencies with the reason.

**Auto-insurance domain pass example:**
```
Dependencies:
- STORY-01 (Driver Profile Form) — produces the driver profile data submitted in this story's When step
- STORY-02 (Licence Validation) — confirms licence validity required by AC-01 and AC-03
Sequencing: STORY-01 and STORY-02 must complete before STORY-03 begins.
```

---

## Ready / Not-Ready Decision Table

Apply after evaluating all 8 items:

| Items missing | Verdict | Action |
|---|---|---|
| 0 items failing | ✅ **READY** — mark `status/ready`, assign to milestone, label `effort/{size}` | Proceed to sprint planning |
| 1 item failing | ⚠️ **CONDITIONAL** — stays in DISCUSS. Assign to author for fix. | Fix the failing item, re-validate |
| 2-3 items failing | ❌ **NOT READY** — stays in DISCUSS. Escalate if items are design-dependent. | Author must fix; flag blockers to product owner |
| 4+ items failing | 🚨 **REJECT** — story is not sufficiently defined. | Restart story from scratch with product owner |

**Hard rule:** If ANY item fails → story stays in DISCUSS. No exceptions. A story with a missing dependency that cannot be resolved in the sprint must be deferred to the next sprint planning session.
