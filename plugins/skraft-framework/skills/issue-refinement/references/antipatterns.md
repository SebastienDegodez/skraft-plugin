# Story Antipatterns — Detection Guide

Eight antipatterns to detect during DISCUSS phase. Each entry includes the problem it causes in downstream phases, the detection trigger to scan for, and a before/after correction using the MonAssurance eligibility domain.

---

## AP-DISCUSS-01 — Implement-X

**Severity:** 🚨 CRITICAL — auto-reject

**Problem downstream:** When this story reaches DELIVER, engineers implement a technical solution that was never validated by the business. The wrong abstraction gets built. DISTILL cannot write business-language Gherkin for a technical story. The story leaks into implementation before DESIGN has run.

**Detection trigger:** Any of the following in the story body:
- Persona is "developer", "engineer", "architect", "tech lead", "backend", "DevOps"
- Capability verb is "implement", "create a service", "build a repository", "add an endpoint", "refactor", "migrate", "create a handler"
- Benefit is "the codebase is clean", "coverage reaches X%", "the team has a data access layer"

**Before (bad):**
```
As a developer,
I want to implement the EligibilityRepository interface using JPA,
so that the team has a data access layer for eligibility decisions.
```

**After (fixed):**
```
As a first-time driver,
I want to receive an eligibility decision immediately after submitting my profile,
so that I know whether to continue my application before uploading documents.
```

The repository implementation is now an engineering decision made at DESIGN/DELIVER, not a DISCUSS story.

---

## AP-DISCUSS-02 — Generic Data

**Severity:** ⚠️ HIGH — changes_requested

**Problem downstream:** Engineers and testers make arbitrary assumptions about data values. Test data is invented rather than domain-driven. The business rule is never validated against real edge cases. Boundary conditions are missed.

**Detection trigger:** Domain examples section contains:
- "some accidents", "a few years", "enough premium", "recent history"
- "a driver with a good record", "an experienced driver", "a standard profile"
- Relative quantities without thresholds: "older driver", "multiple claims"

**Before (bad):**
```
Domain examples:
1. A driver with a clean record → eligible
2. A driver with some accidents → not eligible
3. An older driver → depends on record
```

**After (fixed):**
```
Domain examples:
1. Sophie Martin, 29 years old, B licence (valid 8 years), 0 at-fault accidents
   in the last 5 years → eligible, certificate valid 30 days
2. Karim Benali, 21 years old, B licence (valid 2 years), 2 at-fault accidents
   in the last 3 years → not eligible: "accident threshold exceeded"
3. Marguerite Leblanc, 68 years old, B licence (valid 45 years), 0 accidents,
   licence expires in 14 months → eligible pending licence renewal notice
```

---

## AP-DISCUSS-03 — Technical AC

**Severity:** ⚠️ HIGH — changes_requested

**Problem downstream:** DISTILL cannot write business-language Gherkin — the ACs already prescribe implementation. DESIGN phase is bypassed (architecture decisions embedded in ACs). DELIVER engineers are constrained to a specific implementation before any design review.

**Detection trigger:** AC contains any of:
- HTTP status codes: `200`, `201`, `422`, `404`, `500`
- HTTP verbs: `POST`, `GET`, `PUT`, `DELETE`, `PATCH`
- Class/method names: `EligibilityService`, `DriverRepository`, `.Check()`, `.Save()`
- Framework terms: `Controller`, `Handler`, `UseCase`, `DTO`, `DI`, `IoC`
- Database terms: `SELECT`, `INSERT`, `JOIN`, `column`, `table`, `record`
- Serialisation terms: `JSON`, `XML`, `YAML`, `schema`, `payload`

**Before (bad):**
```
AC-01: The EligibilityService.Check() method is called with a DriverProfileDTO.
       The service returns HTTP 200 with body { "eligible": true, "certificateValidDays": 30 }.
```

**After (fixed):**
```
AC-01:
Given a driver aged 29 with 0 accidents in the last 5 years and a valid B licence
When the driver submits their profile for an eligibility check
Then the driver receives an eligibility confirmation
And the confirmation is valid for 30 days
```

---

## AP-DISCUSS-04 — Giant Stories

**Severity:** 🚨 CRITICAL — auto-reject

**Problem downstream:** Story cannot be estimated reliably. Sprint planning is invalid. DELIVER stalls when the story cannot be completed in one sprint. DISTILL produces an unmanageably large Gherkin feature file. Code review becomes impossible.

**Detection trigger:** Any of the following:
- Effort estimate is XL (> 3 days)
- Story has 8+ acceptance criteria
- Story body mentions 3+ distinct user actions ("the driver enters... then confirms... then receives... then downloads...")
- Story scope covers an entire feature or user journey: "complete the application process", "manage the policy lifecycle", "handle all eligibility scenarios"

**Before (bad):**
```
As a driver,
I want to complete the entire insurance application process,
so that I obtain my policy.

ACs: (12 acceptance criteria covering personal details, vehicle info, eligibility,
documents, payment, confirmation, certificate download, policy PDF, renewal notice,
cancellation, claims declaration, and broker referral)
```

**After (fixed):** Split by workflow step into focused stories. See splitting-patterns.md Pattern 1 for the full split.

---

## AP-DISCUSS-05 — No Examples

**Severity:** 🚨 CRITICAL — auto-reject

**Problem downstream:** ACs are written in the abstract without concrete grounding. When a regression occurs, nobody can determine what the expected behaviour was. DISTILL cannot write meaningful Gherkin Examples tables. The business never validates the rule because no real scenario was presented.

**Detection trigger:**
- Domain Examples section is absent from the story
- Domain Examples section is present but empty
- Domain Examples section contains only generic descriptions (falls into AP-DISCUSS-02 territory)
- Story body has zero numbers, names, or specific values

**Before (bad):**
```
## Story: STORY-03 — Eligibility Check

As a driver,
I want to check my eligibility,
so that I know if I can apply.

Domain Examples: (none)

AC-01: The driver receives an eligibility result.
```

**After (fixed):**
```
Domain Examples:
1. Sophie Martin, 29 years old, B licence, 0 accidents → eligible, 30-day certificate
2. Karim Benali, 21 years old, B licence, 2 accidents in 3 years → not eligible
3. Isabelle Dupont, 17 years old, provisional licence → rejected (age < 18)

AC-01 (derived from Example 1):
Given a driver aged 29 with 0 accidents and a valid B licence
When the driver requests an eligibility check
Then the driver receives an eligibility confirmation valid for 30 days
```

---

## AP-DISCUSS-06 — Tests After Code

**Severity:** ⚠️ HIGH — changes_requested

**Problem downstream:** ACs presuppose an existing implementation. Outside-In TDD is broken — you cannot write a test before code if the AC assumes the code already runs. The DISTILL phase produces Gherkin that has no meaning without the implementation being present first.

**Detection trigger:** Given step references:
- A running service: "Given the EligibilityService is running", "Given the API is deployed"
- A database state from a previous run: "Given the database contains profile ID 42"
- An existing object: "Given the DriverRepository has been instantiated with..."
- Infrastructure state: "Given the message queue is empty", "Given the Redis cache is populated"

**Before (bad):**
```
AC-01:
Given the EligibilityService has been deployed and the database contains
the driver profile with ID 42
When the service endpoint is called with profileId=42
Then the service returns HTTP 200 with eligible=true
```

**After (fixed):**
```
AC-01:
Given a driver aged 29 with 0 accidents in the last 5 years and a valid B licence
When the driver requests an eligibility check
Then the driver receives an eligibility confirmation
```

The Given now describes a domain state (what kind of driver) rather than an infrastructure state (what service is running).

---

## AP-DISCUSS-07 — Vague Persona

**Severity:** ⚠️ HIGH — changes_requested

**Problem downstream:** Engineers pick the wrong use case, build the wrong UI, or optimise for the wrong workflow. Multiple personas may use the same capability differently — without specificity, the wrong one is served. DISTILL cannot write targeted Gherkin.

**Detection trigger:** Persona is any of:
- "the user", "a user", "users"
- "someone", "a person", "a human"
- "a customer" (without role context)
- "the system" (an actor, not a persona)
- "anyone who needs to..."

**Before (bad):**
```
As a user,
I want to see my eligibility status,
so that I know if I can proceed.
```

**After (fixed):**
```
As a first-time driver who has just submitted their personal details,
I want to see my eligibility status immediately,
so that I can decide whether to continue uploading documents or contact an agent.
```

If multiple user roles perform this action differently, split by persona: one story for the driver (self-service portal), one for the agent (back-office tool).

---

## AP-DISCUSS-08 — Missing Dependencies

**Severity:** ⚠️ HIGH — changes_requested

**Problem downstream:** Sprint planning is invalid. Story B may be scheduled before Story A, causing a mid-sprint blocker. DELIVER stalls when engineers discover the dependency during implementation. In the worst case, Story B ships with a stub that never gets replaced.

**Detection trigger:**
- Story body references data produced by another story (e.g., "the eligibility certificate number", "the validated driver profile")
- Story body uses output values from a previous step without listing the producer story
- Dependencies section is missing entirely
- Dependencies section says "None" but story references another story's data

**Before (bad):**
```
## Story: STORY-05 — Payment Processing

As a driver who has passed the eligibility check,
I want to complete payment for my insurance policy,
so that my coverage is activated.

AC-01:
Given the driver's eligibility certificate number is displayed on the payment page
When the driver completes payment
Then the policy is activated with reference to the eligibility certificate number

Dependencies: None
```

**After (fixed):**
```
Dependencies:
- STORY-03 (Eligibility Check) — produces the eligibility certificate number
  referenced in AC-01. STORY-03 must complete before STORY-05 begins.
- STORY-04 (Document Upload) — confirms required documents are on file.
  STORY-04 must complete before payment is processed.
Sequencing: STORY-03 → STORY-04 → STORY-05
```
