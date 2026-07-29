# Story Splitting Patterns

Six patterns for decomposing oversized user stories into independently deliverable units. Apply when effort estimate is L or XL, or when a story has more than 5 acceptance criteria.

---

## Pattern 1: By Workflow Step

### When to Apply

**Signal:** The story describes a multi-step user process where each step is sequential and could provide value independently.

Trigger phrases in story text: "then the driver can...", "after completing X, the user...", "the process includes: step 1... step 2...".

### How to Split

1. List every discrete user action in the story
2. Group actions that together produce a meaningful intermediate outcome
3. Write one story per group
4. Verify each resulting story is independently deliverable (happy path ships first)

### Example — Eligibility Domain

**Before (too large):**
```
As a driver,
I want to submit an insurance application,
so that I obtain my policy.
```
*Effort: XL (8+ ACs, spans 6 user actions)*

**After (split by workflow step):**

| Story | Title | Effort |
|---|---|---|
| STORY-01 | Driver enters personal details | S |
| STORY-02 | Driver declares vehicle information | S |
| STORY-03 | Driver receives eligibility decision | M |
| STORY-04 | Driver uploads required documents | M |
| STORY-05 | Driver completes payment | M |
| STORY-06 | Driver receives policy confirmation | S |

**Pitfall:** Don't split steps that have no independent business value. "Enter first name" alone cannot be shipped as a story. Group steps that together produce a meaningful result (e.g., "enter all personal details and proceed to vehicle step").

---

## Pattern 2: By Business Rule

### When to Apply

**Signal:** The story covers multiple distinct business rules that produce meaningfully different outcomes for the same action.

Trigger phrases: "if the driver has X then..., but if Y then...", "depending on the profile...", story has 3+ rule branches.

### How to Split

1. Identify each distinct business rule (condition → outcome pair)
2. Write one story per rule variant that produces a distinct user experience
3. The happy-path story ships first; rejection/special-case stories follow

### Example — Eligibility Domain

**Before (too large):**
```
As a driver,
I want to know if I am eligible for insurance,
so that I can proceed with or without an application.
```
*Covers: 0 accidents, 2+ accidents, suspended licence, under-age — 4 distinct outcomes*

**After (split by business rule):**

| Story | Title | Business Rule |
|---|---|---|
| STORY-03a | Eligible driver receives confirmation | 0-1 accidents, valid licence, age ≥18 |
| STORY-03b | Driver with excess accidents receives ineligibility notice | ≥2 at-fault accidents in 3 years |
| STORY-03c | Driver with suspended licence is immediately rejected | Licence status = suspended |
| STORY-03d | Under-age driver is immediately rejected | Age < 18 |

**Pitfall:** Don't create one story per row in a data table. If the same rule applies across multiple data values (eligible for 0, 1, 2 accidents with only the threshold changing), use a Scenario Outline in DISTILL, not a story split.

---

## Pattern 3: By Data Variation

### When to Apply

**Signal:** Domain examples differ only in one field and produce meaningfully different user experiences — not just different data values but different outcomes, flows, or messages.

Trigger: 4+ domain examples that diverge at a single decision point.

### How to Split

1. Identify the field that drives variation (age bracket, licence type, region, coverage tier)
2. Group variations that share the same outcome into one story
3. Write separate stories only when outcomes differ in ways the user experiences differently

### Example — Eligibility Domain

**Before (too large):**
```
As a driver,
I want the eligibility system to handle all age groups,
so that any driver can use the application.
```

**After (split by meaningful age-bracket variation):**

| Story | Title | Age Range | Outcome |
|---|---|---|---|
| STORY-05a | Under-age driver receives age restriction notice | < 18 | Rejected immediately |
| STORY-05b | Young driver receives high-risk notification | 18-24 | Eligible with surcharge notice |
| STORY-05c | Standard-age driver receives standard eligibility flow | 25-65 | Normal eligibility flow |
| STORY-05d | Senior driver receives enhanced review notice | 66+ | Eligible pending licence validity check |

**Pitfall:** If the business rule is the same and only data values differ (e.g., all ages 18+ follow the same logic), keep one story and use a Scenario Outline. Split only when the user experience is meaningfully different.

---

## Pattern 4: By Interface

### When to Apply

**Signal:** The same underlying business capability is accessed through multiple distinct entry points (web portal, mobile app, agent back-office, API direct call).

Trigger: Story mentions "both the driver and the agent can...", "from any channel...", "via the web or the app".

### How to Split

1. List every distinct interface (web, mobile, back-office, API)
2. Write one story per interface that has meaningfully different UX requirements or access patterns
3. If the behaviour is identical across interfaces, keep one story and note interfaces in Technical Notes

### Example — Eligibility Domain

**Before (spanning two interfaces):**
```
As a user,
I want to check eligibility,
so that I know if I qualify.
```

**After (split by interface):**

| Story | Title | Persona | Interface |
|---|---|---|---|
| STORY-03 | Driver checks own eligibility via web portal | First-time driver | Web portal (self-service) |
| STORY-07 | Agent checks client eligibility via back-office | Insurance agent | Back-office tool |

**Pitfall:** Don't split if the only difference is visual styling. Interface split is justified when the persona, permissions, or data access differ meaningfully.

---

## Pattern 5: By Acceptance Criteria

### When to Apply

**Signal:** A story has 6+ ACs, and each AC represents a distinct user scenario that could be shipped independently.

Trigger: Story AC list reads like a feature catalogue.

### How to Split

1. Group ACs by user scenario family (happy path, rejection scenarios, edge cases)
2. Each group becomes a story
3. Verify that the resulting stories are still independently deliverable

### Example — Eligibility Domain

**Before (8 ACs in one story):**
```
Story: Driver eligibility check
AC-01: Eligible driver — clean record
AC-02: Eligible driver — one old accident (>3 years)
AC-03: Not eligible — 2+ recent accidents
AC-04: Not eligible — suspended licence
AC-05: Not eligible — under 18
AC-06: Borderline — manual underwriter review triggered
AC-07: Certificate expiry at 30 days
AC-08: Eligibility re-check available after 6 months
```

**After (split by scenario family):**

| Story | ACs included |
|---|---|
| STORY-03: Standard eligibility decision | AC-01, AC-02, AC-03, AC-07 |
| STORY-04: Immediate rejection paths | AC-04, AC-05 |
| STORY-05: Borderline and review flow | AC-06, AC-08 |

**Pitfall:** Don't split ACs that together define a single coherent behaviour. A story with a success AC and its corresponding validation-error AC usually belongs together.

---

## Pattern 6: By Happy/Sad Path

### When to Apply

**Signal:** The story has a complex success flow AND complex error conditions, and the error handling requires separate design consideration.

Trigger: More than half of the story's ACs are error-handling cases.

### How to Split

1. Write the happy path as Story A (ship first)
2. Write the error handling cases as Story B (depends on Story A)
3. Mark Story B as `depends_on: Story A` in its Dependencies section

### Example — Eligibility Domain

**Before (mixed happy/sad):**
```
As a driver,
I want to complete an eligibility check (including all error cases),
so that I always receive meaningful feedback.
```

**After (split by path):**

| Story | Title | Path |
|---|---|---|
| STORY-03 | Driver receives eligibility confirmation | Happy path — eligible |
| STORY-04 | Driver receives structured rejection reason | Sad path — ineligible (depends on STORY-03) |

**Pitfall:** Don't defer ALL sad paths to a later sprint. Core rejection scenarios (missing required data, under-age, suspended licence) must ship in the same sprint as the happy path. Only complex edge cases (manual review, borderline decisions, re-check requests) can be deferred.
