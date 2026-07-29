---
name: issue-refinement
description: Use when transforming raw issues or feature requests into well-structured user stories with acceptance criteria. Covers user story format, INVEST criteria, acceptance criteria patterns, story splitting techniques, DoR 8-item gate, and 8 antipatterns to detect.
---

# Issue Refinement

## Overview

Issue refinement transforms raw GitHub issues into implementable user stories with acceptance criteria. Applied at the DISCUSS phase, output feeds DISTILL (where Gherkin scenarios are produced) and DESIGN (where architecture is decided).

A story is the unit of work. A story is NOT a task, NOT a ticket, NOT a technical instruction. A story describes what a user needs and why.

---

## User Story Format

### Template

```
As a {specific persona},
I want {capability},
so that {concrete benefit}.
```

### Rules

| Part | Rule | Violation signal |
|---|---|---|
| Persona | Must be a named role, not "user" | "a user", "someone", "the system" |
| Capability | Observable behaviour, not implementation | "implement", "create", "call", "build" |
| Benefit | Concrete business value, not technical outcome | "the system works", "it is done" |

### Auto-Insurance Domain Examples

**Good:**
```
As a new driver applying for their first insurance policy,
I want to check my eligibility before submitting documents,
so that I know in advance whether my profile qualifies and can prepare accordingly.
```

```
As an underwriter reviewing a borderline application,
I want to see the full eligibility decision rationale,
so that I can confirm or override the automated result with a documented justification.
```

```
As a claims adjuster processing a collision claim,
I want to retrieve the policyholder's coverage details in one screen,
so that I can determine applicable coverage without switching between systems.
```

**Bad (anti-example):**
```
As a user, I want to implement the eligibility service.
```
This violates all three parts: persona is generic, capability is a technical instruction, and there is no stated benefit.

---

## INVEST Criteria

Every story must satisfy all 6 INVEST criteria before leaving DISCUSS.

### Independent

**Definition:** The story can be delivered without requiring another story to be completed first.

**How to check:** Ask "can the team start this story on day 1 of the sprint without waiting for another story?"

**Common violations:**
- Story B says "Continuing from Story A, the driver can now..."
- Story B reads data written by Story A with no fallback

**How to fix:** Split stories so each is self-contained, or reorder so dependencies resolve before dependents. If a dependency is unavoidable, list it explicitly and ensure the dependency story is in the same sprint.

---

### Negotiable

**Definition:** The story is not a fixed specification. It is a starting point for conversation. Implementation details are NOT prescribed.

**How to check:** Does the story contain "must use {framework}", "must call {endpoint}", "must store in {table}"? If yes, it violates Negotiable.

**Common violations:**
- "I want to call the POST /eligibility endpoint to submit my data"
- "I want the system to use Redis for session storage"

**How to fix:** Rewrite capability as observable behavior. Move implementation constraints to Technical Notes, not story body.

---

### Valuable

**Definition:** Every story delivers end-user or business value when shipped. Purely technical stories are not valuable.

**How to check:** Ask "would a non-technical stakeholder notice or care if this story was not delivered?" If no, the story is not Valuable.

**Common violations:**
- "As a developer, I want to refactor the eligibility module"
- "As a developer, I want to add unit tests to the repository layer"

**How to fix:** If technical work is genuinely needed, wrap it in a story that describes its user-visible consequence: "As a driver, I want my eligibility check to return a result within 2 seconds, so that I do not wait during the application process." The refactoring is the implementation, not the story.

---

### Estimable

**Definition:** The team can estimate the story. Estimation requires a clear scope with no major unknowns.

**How to check:** Ask "can a team of engineers agree on T-shirt sizing in 5 minutes?" If the discussion is open-ended, the story is not Estimable.

**Common violations:**
- Story has no technical notes → team cannot estimate unknowns
- Story scope is ambiguous → team disagrees on what is included

**How to fix:** Add Technical Notes section with known constraints and integrations. If unknowns remain after notes, add a spike story first.

---

### Small

**Definition:** Deliverable in 1-3 days by a single engineer, or 1-2 days pair-programming.

**How to check:** Is the effort estimate L or XL? Does the story have 6+ ACs? Does it touch multiple personas?

**Common violations:**
- "As a driver, I want to complete the entire insurance application process" → covers 8+ user actions
- Story with 10 ACs → split signal

**How to fix:** Apply a story splitting pattern (see references/splitting-patterns.md). XL stories MUST be split before marking ready.

---

### Testable

**Definition:** Acceptance criteria can be written that a non-technical stakeholder could validate.

**How to check:** Can you write a Given/When/Then scenario for this story without knowing how it is implemented?

**Common violations:**
- "The eligibility algorithm works correctly" → not a testable outcome
- "Performance is good" → not measurable without a threshold

**How to fix:** Add at least 3 concrete domain examples from which ACs can be derived. Each AC must be independently testable and observable.

---

## Story Splitting Patterns

When a story is too large (L/XL), use one of these patterns:

### 1. By Workflow Step
Split each sequential user action into a separate story.

**Signal:** Story describes a multi-step process ("the driver enters data, then confirms, then receives a result").

**Example:**
- Before: "As a driver, I want to submit an insurance application"
- After:
  - "As a driver, I want to enter my personal details" (Step 1)
  - "As a driver, I want to declare my vehicle information" (Step 2)
  - "As a driver, I want to receive my eligibility decision" (Step 3)

**Pitfall:** Don't split steps that have no independent value. "Enter first name" alone is not a deliverable story.

---

### 2. By Business Rule
One story per rule variant.

**Signal:** Story covers multiple distinct conditions: "if the driver has 0-1 accidents, they are eligible; if 2+, they are not; if suspended licence, they are rejected."

**Example:**
- Before: "As a driver, I want to know if I am eligible"
- After:
  - "As a driver with a clean record, I want to receive an eligibility confirmation"
  - "As a driver with 2+ accidents, I want to receive a clear ineligibility reason"
  - "As a driver with a suspended licence, I want to receive an immediate rejection"

**Pitfall:** Don't create one story per data row in an Examples table. Scenario Outlines handle parametrized cases within a single story.

---

### 3. By Data Variation
Parameterize the difference into a Scenario Outline; if each variation needs a separate story (different value, different outcome), split.

**Signal:** Domain examples differ only in one field and produce meaningfully different outcomes.

**Example:**
- Before: "As a driver, I want the system to handle different age groups"
- After:
  - "As a driver under 18, I want to receive an age-restriction notice"
  - "As a driver aged 18-25, I want to receive a high-risk premium notification"
  - "As a driver aged 25+, I want to receive standard eligibility processing"

**Pitfall:** If the business rule is the same and only data values differ, use a Scenario Outline instead of splitting.

---

### 4. By Interface
Different UX entry points become separate stories.

**Signal:** Story is accessed via multiple channels (web form, mobile app, API direct call, agent portal).

**Example:**
- Before: "As a driver, I want to check eligibility"
- After:
  - "As a driver using the web portal, I want to check my eligibility"
  - "As an insurance agent using the back-office tool, I want to check a driver's eligibility on their behalf"

**Pitfall:** If the business behaviour is identical across interfaces, keep one story and note the interface in Technical Notes.

---

### 5. By Acceptance Criteria
Each AC becomes a story when the story is too large.

**Signal:** Story has 6+ ACs and each AC represents a distinct user scenario.

**Example:**
- Before: Story with ACs for happy path, rejected-no-licence, rejected-too-young, rejected-suspended, expired-certificate, borderline-manual-review
- After: six focused stories, one per scenario family

**Pitfall:** Don't split ACs that together define a single coherent behaviour. The happy path and its direct rejection case often belong together.

---

### 6. By Happy/Sad Path
Positive flow first, then error handling as a separate story.

**Signal:** The story has a complex success path AND complex error conditions.

**Example:**
- Before: "As a driver, I want to complete eligibility check (including all error cases)"
- After:
  - "As a driver, I want to receive an eligibility confirmation when my profile qualifies" (happy path)
  - "As a driver, I want to receive a clear rejection reason when my profile does not qualify" (sad path)

**Pitfall:** Don't defer all error handling to "later". Error scenarios that affect the user journey must be planned in the same sprint as the happy path.

---

## Acceptance Criteria Patterns

### Given/When/Then (preferred for behavioural scenarios)

```
Given {precondition — state of the world}
When {trigger — one business action}
Then {observable outcome — visible to the user or system boundary}
```

Rules:
- ONE When per AC. Multiple Whens = multiple ACs.
- Then must be observable without looking at code.
- Given must be achievable in a test without production data.

**Example:**
```
Given a driver aged 22 with 1 accident in the last 2 years and a valid B licence
When the driver requests an eligibility check
Then the driver is declared eligible
And the eligibility certificate is valid for 30 days
```

---

### Bullet-list format (acceptable for non-behavioural constraints)

Use for constraints, performance thresholds, and accessibility requirements that do not map to a user action.

```
AC-04: Eligibility response time
- The eligibility result is returned within 2 seconds for 95% of requests
- The response time is measured from API request receipt to API response sent
- Performance is tested under a load of 100 concurrent requests
```

---

### Table format (for parametrized conditions)

Use when the same logic applies to multiple data combinations.

```
AC-05: Eligibility by accident count

| Accidents in last 3 years | Minimum age | Outcome         |
|---------------------------|-------------|-----------------|
| 0                         | 18          | eligible        |
| 1                         | 18          | eligible        |
| 2                         | 21          | eligible        |
| 2                         | 18          | not eligible    |
| 3+                        | any         | not eligible    |
```

---

## Definition of Ready — 8-Item Hard Gate

A story does NOT leave DISCUSS unless ALL 8 items pass. Any failing item → story stays in DISCUSS.

| Item | Name | Pass condition |
|---|---|---|
| 1 | Problem statement | Story articulates a concrete user problem. "Implement X" is an automatic failure. |
| 2 | Specific persona | Named persona with a role. "User", "someone", "person" are failures. |
| 3 | 3+ domain examples | At least 3 concrete examples with real values (real ages, real accident counts, real policy types). |
| 4 | UAT scenarios | Given/When/Then scenarios that a non-technical user could validate. |
| 5 | AC derived from UAT | Each AC traces back to a UAT scenario. AC without a UAT source is a fabrication. |
| 6 | Right-sized | Deliverable in 1-3 days solo, or 1-2 days pair. XL estimate → split first. |
| 7 | Technical notes | Known constraints, integrations (e.g., calls eligibility-service v2 API), performance requirements. |
| 8 | Dependencies | Inter-story dependencies listed. Confirmed that dependency stories are in the same sprint or already done. "None" is a valid value if no dependencies exist. |

Full checklist template: [dor-checklist.md](references/dor-checklist.md)

---

## 8 Antipatterns to Detect

### AP-DISCUSS-01 — Implement-X 🚨 CRITICAL

**Problem:** Story describes a technical solution instead of a user need. When this reaches DELIVER, engineers implement a solution nobody validated, often solving the wrong problem.

**Detection trigger:** Story starts with "As a developer/engineer/architect" OR capability contains "implement", "create service", "build repository", "add endpoint", "refactor".

**Before (bad):**
```
As a developer,
I want to implement the eligibility repository,
so that the team has a data access layer.
```

**After (fixed):**
```
As a driver,
I want to submit my eligibility check request,
so that I receive an immediate decision without calling an agent.
```

---

### AP-DISCUSS-02 — Generic Data ⚠️ HIGH

**Problem:** Domain examples use vague quantities. Engineers make assumptions. Test data is arbitrary. The business rule is never validated against real edge cases.

**Detection trigger:** Examples contain "some accidents", "a few years", "enough premium", "recent history", "standard profile".

**Before (bad):**
```
Domain examples:
- A driver with some accidents
- An older driver
- A driver with a good record
```

**After (fixed):**
```
Domain examples:
- A driver aged 24 with 2 accidents in the last 3 years and a valid B licence
- A driver aged 67 with 0 accidents in the last 5 years and a C1 licence
- A driver aged 19 with 0 accidents and a provisional licence issued 6 months ago
```

---

### AP-DISCUSS-03 — Technical AC ⚠️ HIGH

**Problem:** AC references implementation. Engineers are constrained to a specific implementation before design decisions are made. DESIGN phase is bypassed.

**Detection trigger:** AC contains HTTP codes, class names, method names, framework terms, database terms, or JSON/XML/HTTP verbs.

**Before (bad):**
```
AC-01: The eligibility service returns HTTP 200 with a JSON body containing `eligible: true`.
```

**After (fixed):**
```
AC-01:
Given a driver with a clean record aged 25
When the driver requests an eligibility check
Then the driver receives an eligibility confirmation valid for 30 days
```

---

### AP-DISCUSS-04 — Giant Stories 🚨 CRITICAL

**Problem:** Story spans multiple features, multiple user journeys, or multiple sprints. It cannot be estimated, tested, or completed in 1-3 days. DELIVER phase stalls.

**Detection trigger:** Story has 8+ ACs, OR touches 3+ distinct user actions, OR covers an entire feature ("complete the application process", "manage the policy lifecycle").

**Before (bad):**
```
As a driver,
I want to complete the entire insurance application process,
so that I obtain my policy.
```

**After (fixed):** Split by workflow step into 4-6 focused stories (personal details, vehicle declaration, eligibility check, document upload, payment, policy issuance).

---

### AP-DISCUSS-05 — No Examples 🚨 CRITICAL

**Problem:** Story has zero concrete domain examples. ACs are written in the abstract. When a bug appears, nobody can tell whether the expected behaviour was ever specified.

**Detection trigger:** "Domain Examples" section is missing, empty, or contains only generic descriptions.

**Before (bad):**
```
Domain examples: (none)
```

**After (fixed):**
```
Domain examples:
1. Sophie Martin, 29 years old, 0 accidents in 5 years, B licence, Peugeot 208 → eligible
2. Karim Benali, 21 years old, 2 accidents in 3 years, B licence, Golf GTI → not eligible
3. Isabelle Dupont, 45 years old, 1 accident 4 years ago, B licence, Renault Clio → eligible
```

---

### AP-DISCUSS-06 — Tests After Code ⚠️ HIGH

**Problem:** AC assumes an existing implementation. ACs cannot be used to write tests before code exists. TDD is broken.

**Detection trigger:** AC starts with "Given the {ServiceName} is running", "Given the {ClassName} returns...", "Given the database contains...".

**Before (bad):**
```
Given the EligibilityService has been deployed
And the driver database contains profile ID 42
When the service is called with profile ID 42
Then it returns eligible
```

**After (fixed):**
```
Given a driver aged 28 with 0 accidents and a valid B licence
When the driver requests an eligibility check
Then the driver receives an eligibility confirmation
```

---

### AP-DISCUSS-07 — Vague Persona ⚠️ HIGH

**Problem:** "The user" could be anyone. Engineers pick the wrong use case, build the wrong UI, or serve the wrong persona's needs.

**Detection trigger:** Persona is "the user", "a user", "someone", "a person", "a customer", "anyone".

**Before (bad):**
```
As a user,
I want to see my eligibility status...
```

**After (fixed):**
```
As a first-time driver applying for liability coverage,
I want to see my eligibility status immediately after submission...
```

---

### AP-DISCUSS-08 — Missing Dependencies ⚠️ HIGH

**Problem:** Story B depends on Story A's output but does not list it. Sprint planning is invalid. Story B may be scheduled before Story A. DELIVER stalls mid-sprint.

**Detection trigger:** Story references data or functionality without listing the producing story in Dependencies. "The driver's eligibility result" in a payment story with no dependency on the eligibility story.

**Before (bad):**
```
Dependencies: none
[Story body references the eligibility certificate number produced by Story A]
```

**After (fixed):**
```
Dependencies:
- STORY-03 (Eligibility Check) — produces the eligibility certificate number used in AC-02
```

---

## Effort Estimation

### T-Shirt Sizes

| Size | Duration | AC count (guideline) | When to use |
|---|---|---|---|
| XS | < 2 hours | 1 AC | Minor UI change, configuration update, copy change |
| S | 2-4 hours | 2 ACs | Simple read-only feature, straightforward business rule |
| M | 1 day | 3-4 ACs | Standard feature with happy path + 1-2 edge cases |
| L | 2-3 days | 4-5 ACs | Complex business rule, integration, or multi-step flow |
| XL | > 3 days | 6+ ACs | **Must split before continuing** |

### Estimation Heuristics

- **Unknowns**: +1 size if a critical technical decision is unresolved
- **Integration**: +1 size if the story calls an external service for the first time
- **Existing code**: -1 size if the pattern already exists in the codebase (extend, don't invent)
- **Pair programming**: divide solo estimate by 1.5 (not by 2 — ramp-up cost)

### AC Count as Split Signal

If a story has more than 5 ACs during DISCUSS, it is almost certainly too large. Apply a splitting pattern before finalising the effort estimate.

---

## References

- [story-template.md](references/story-template.md) — blank template + filled example
- [splitting-patterns.md](references/splitting-patterns.md) — 6 splitting patterns with before/after examples
- [invest-checklist.md](references/invest-checklist.md) — per-criterion checklist
- [dor-checklist.md](references/dor-checklist.md) — 8-item DoR gate
- [antipatterns.md](references/antipatterns.md) — detection guide with before/after examples
