# Antipattern Severity Table

Maps each of the 8 DISCUSS antipatterns to their verdict impact and provides the detection checklist used by the `backlog-planner-reviewer` during G8 evaluation.

---

## Severity Table

| ID | Antipattern | Severity | Lens | Gate | Verdict Impact |
|---|---|---|---|---|---|
| AP-DISCUSS-01 | Implement-X | CRITICAL | dor-compliance | G8 | `rejected` |
| AP-DISCUSS-05 | No Examples | CRITICAL | dor-compliance | G8 | `rejected` |
| AP-DISCUSS-04 | Giant Stories | CRITICAL | invest | G8 / G1-S | `rejected` |
| AP-DISCUSS-03 | Technical AC | HIGH | ac-quality | G8 / G3 | `changes_requested` |
| AP-DISCUSS-02 | Generic Data | HIGH | dor-compliance | G8 / G7 | `changes_requested` |
| AP-DISCUSS-06 | Tests After Code | HIGH | ac-quality | G8 / G4 | `changes_requested` |
| AP-DISCUSS-07 | Vague Persona | HIGH | dor-compliance | G8 / G7 | `changes_requested` |
| AP-DISCUSS-08 | Missing Dependencies | HIGH | planning-coherence | G8 / G2 | `changes_requested` |

**CRITICAL**: Any CRITICAL antipattern found on any story in the sprint → minimum verdict is `rejected`.
**HIGH**: Any HIGH antipattern found with no CRITICAL antipatterns → minimum verdict is `changes_requested`.

---

## Detection Checklist

Apply to every story and every AC. Flag at the first match.

---

### AP-DISCUSS-01 — Implement-X (CRITICAL)

**What to scan:** Story statement (As a / I want / So that)

| Check | Pattern to look for | Flag if found |
|---|---|---|
| AP-01-A | Persona role contains: "developer", "engineer", "architect", "tech lead", "devops", "backend" | ✅ FLAG |
| AP-01-B | Capability verb is: "implement", "build a service", "create a repository", "add an endpoint", "refactor", "migrate", "add unit tests" | ✅ FLAG |
| AP-01-C | Benefit describes: "the code is clean", "coverage reaches X%", "the team has a data access layer", "the codebase is maintainable" | ✅ FLAG |

**Verdict trigger:** Any single match → G8 CRITICAL → `rejected`

---

### AP-DISCUSS-05 — No Examples (CRITICAL)

**What to scan:** Domain Examples section

| Check | Condition | Flag if found |
|---|---|---|
| AP-05-A | Domain Examples section is absent from the story | ✅ FLAG |
| AP-05-B | Domain Examples section is present but empty (no examples) | ✅ FLAG |
| AP-05-C | Domain Examples section has 1-2 entries with zero real values (generic descriptions only) | ✅ FLAG |

**Note:** AP-05-C may be downgraded to HIGH (AP-DISCUSS-02: Generic Data) if some real values are present. If ALL examples have zero real values, it remains CRITICAL.

**Verdict trigger:** AP-05-A or AP-05-B → G8 CRITICAL → `rejected`; AP-05-C with zero real values → G8 CRITICAL → `rejected`

---

### AP-DISCUSS-04 — Giant Stories (CRITICAL)

**What to scan:** Effort estimate, AC count, story body scope

| Check | Condition | Flag if found |
|---|---|---|
| AP-04-A | Effort estimate is XL (> 3 days) with no split plan documented | ✅ FLAG |
| AP-04-B | Story has 8 or more acceptance criteria | ✅ FLAG |
| AP-04-C | Story body covers 3+ distinct user actions ("the driver enters... then confirms... then receives... then downloads...") | ✅ FLAG |
| AP-04-D | Story scope covers an entire feature or user journey: "complete the application", "manage the policy lifecycle", "handle all eligibility scenarios" | ✅ FLAG |

**Verdict trigger:** Any single match → G8 CRITICAL → `rejected`

---

### AP-DISCUSS-03 — Technical AC (HIGH)

**What to scan:** Every acceptance criterion in every `ac-draft-{story}.md`

| Check | Pattern to look for | Flag if found |
|---|---|---|
| AP-03-A | HTTP status codes: `200`, `201`, `202`, `400`, `401`, `403`, `404`, `422`, `500` | ✅ FLAG |
| AP-03-B | HTTP verbs in step text: `POST`, `GET`, `PUT`, `DELETE`, `PATCH`, `OPTIONS` | ✅ FLAG |
| AP-03-C | Class or method names (PascalCase identifiers not in domain vocabulary): `EligibilityService`, `DriverRepository`, `.Check()`, `DTO`, `Handler` | ✅ FLAG |
| AP-03-D | Framework or infrastructure terms: `Controller`, `UseCase`, `Repository`, `DI container`, `IoC`, `middleware`, `pipeline` | ✅ FLAG |
| AP-03-E | Database/serialisation terms in step text: `SELECT`, `INSERT`, `JSON`, `XML`, `YAML`, `schema`, `payload`, `null`, `undefined` | ✅ FLAG |

**Verdict trigger:** Any match → G8 HIGH → `changes_requested`

---

### AP-DISCUSS-02 — Generic Data (HIGH)

**What to scan:** Domain Examples section

| Check | Pattern to look for | Flag if found |
|---|---|---|
| AP-02-A | Vague quantities: "some accidents", "a few years", "enough premium", "recent history", "several claims" | ✅ FLAG |
| AP-02-B | Relative descriptors without thresholds: "older driver", "experienced driver", "new driver" (without age), "high-risk profile" (without criteria) | ✅ FLAG |
| AP-02-C | Generic outcomes: "will be eligible", "gets rejected" without stated reason | ✅ FLAG |
| AP-02-D | Examples with no real values at all (no numbers, no names, no specific conditions) | ✅ FLAG |

**Verdict trigger:** Any match → G8 HIGH → `changes_requested`

---

### AP-DISCUSS-06 — Tests After Code (HIGH)

**What to scan:** Given steps in all acceptance criteria

| Check | Pattern to look for | Flag if found |
|---|---|---|
| AP-06-A | "Given the {ServiceName} is running" or "Given the {ServiceName} has been deployed" | ✅ FLAG |
| AP-06-B | "Given the {ServiceName} returns..." or "Given the API is available" | ✅ FLAG |
| AP-06-C | "Given the database contains profile/record/row ID..." | ✅ FLAG |
| AP-06-D | "Given the message queue is empty/populated" | ✅ FLAG |
| AP-06-E | "Given the cache has been invalidated" or "Given the cache contains..." | ✅ FLAG |
| AP-06-F | Given step references infrastructure state instead of domain state | ✅ FLAG |

**Verdict trigger:** Any match → G8 HIGH → `changes_requested`

---

### AP-DISCUSS-07 — Vague Persona (HIGH)

**What to scan:** Persona in "As a..." clause

| Check | Pattern to look for | Flag if found |
|---|---|---|
| AP-07-A | "As a user" | ✅ FLAG |
| AP-07-B | "As a person", "as someone", "as an individual" | ✅ FLAG |
| AP-07-C | "As a customer" without role context (not "as a new customer applying for...") | ✅ FLAG |
| AP-07-D | "As anyone who...", "as a human who..." | ✅ FLAG |
| AP-07-E | "As the system" (actor, not a human persona) | ✅ FLAG |

**Partial detection:** "As a driver" — domain role present, context absent. Flag as HIGH with recommendation to add context (age, experience, application stage).

**Verdict trigger:** Any match → G8 HIGH → `changes_requested`

---

### AP-DISCUSS-08 — Missing Dependencies (HIGH)

**What to scan:** Story body + ACs vs Dependencies section

| Check | Method | Flag if found |
|---|---|---|
| AP-08-A | Story body references data produced by another story (e.g., "the eligibility certificate number", "the validated driver profile") — check if a corresponding entry exists in Dependencies | ✅ FLAG if not listed |
| AP-08-B | AC Given step uses state or data that would require another story to have run (e.g., "Given the driver's eligibility certificate is valid") — check Dependencies | ✅ FLAG if source story not listed |
| AP-08-C | Dependencies section is entirely absent | ✅ FLAG |
| AP-08-D | A dependency is listed but not confirmed as being in the sprint or already done | ✅ FLAG |

**Verdict trigger:** Any match → G8 HIGH → `changes_requested`

---

## Quick-Scan Checklist

Use this as a 60-second scan before running the full G8 analysis:

```
□ Story persona: "developer" / "engineer" / "architect" → AP-01 CRITICAL
□ Capability: "implement" / "refactor" / "build service" → AP-01 CRITICAL
□ Domain examples section: absent or empty → AP-05 CRITICAL
□ Effort: XL → AP-04 CRITICAL
□ AC count: 8+ → AP-04 CRITICAL
□ Any HTTP code in ACs → AP-03 HIGH
□ Any class name in ACs (PascalCase) → AP-03 HIGH
□ "Given the {Service} is running" in ACs → AP-06 HIGH
□ Persona is "the user" / "someone" → AP-07 HIGH
□ Story references another story's output, Dependencies says "None" → AP-08 HIGH
```

First CRITICAL match → stop scanning, report `rejected`. All HIGH, no CRITICAL → report `changes_requested`.
