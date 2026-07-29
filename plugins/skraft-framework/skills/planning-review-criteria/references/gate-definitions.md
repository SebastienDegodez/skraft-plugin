# Gate Definitions — G1-G8

Detailed per-gate checklists for the `backlog-planner-reviewer`. Each gate is fully specified with step-by-step verification instructions, auto-fail examples, and passing examples from the MonAssurance auto-insurance domain.

---

## G1 — INVEST Compliance

**Lens:** invest-lens
**Severity if violated:** HIGH

### Definition

Every story in the sprint satisfies all 6 INVEST criteria. A story that fails any single INVEST criterion fails G1 for that criterion. Multiple criteria can fail on the same story.

### How to Check — Step by Step

1. For each story, read the story statement (As a / I want / So that)
2. Check **Independent**: Does the story reference another story's output without listing it as a dependency? If yes → I fails.
3. Check **Negotiable**: Does the story body contain class names, HTTP contracts, framework names, or database schemas? If yes → N fails.
4. Check **Valuable**: Could a non-technical stakeholder notice if this story was not shipped? If no → V fails.
5. Check **Estimable**: Do ACs and Technical Notes exist? Can the team size this in 5 minutes? If no → E fails.
6. Check **Small**: Is the estimate XL? Does the story have 6+ ACs or touch 3+ user actions? If yes → S fails.
7. Check **Testable**: Are there at least 3 Given/When/Then ACs derived from domain examples? If no → T fails.

### Auto-Fail Examples

**I fails:**
```
Story body: "The driver receives their eligibility certificate and can proceed to
the document upload step [from Story A]..."
Dependencies: None
```
→ Implicit dependency on Story A not listed.

**N fails:**
```
I want the EligibilityService.Check() method to be called with a DriverProfileDTO
and return a EligibilityResultDTO.
```
→ Prescribes specific class names and method signatures.

**V fails:**
```
As a developer,
I want to refactor the eligibility module to reduce cyclomatic complexity,
so that the code is easier to maintain.
```
→ No user-visible value.

**S fails:**
```
Story: Insurance application end-to-end
Effort: XL
ACs: 12
```
→ Must be split.

### Pass Examples

**G1 pass — all criteria satisfied:**
```
Story: STORY-03 — Driver Eligibility Check
As a first-time driver (I — no implicit prerequisites)
I want to receive an eligibility decision (N — behaviour only, no tech prescription)
so that I know whether to continue my application (V — user-visible value)

ACs: 3 (E — estimable: M/1 day), (S — small: 1 day)
AC-01: Given/When/Then with real values (T — testable)
Dependencies: STORY-01, STORY-02 (I — explicit)
```

---

## G2 — Sprint Independence

**Lens:** invest-lens
**Severity if violated:** HIGH

### Definition

The dependency graph of all stories in the sprint is a Directed Acyclic Graph (DAG). Every story can be delivered in a topologically valid sequence. No story waits for a non-scheduled predecessor.

### How to Check — Step by Step

1. For each story, read the `Dependencies` section
2. Build an adjacency list: `Story-A → depends-on → Story-B`
3. Run DFS on the graph. Track visited nodes and recursion stack.
4. If a back-edge is encountered → cycle detected → G2 violation
5. Verify all dependency targets are either: (a) in the sprint, or (b) confirmed as already done

### Auto-Fail Examples

**G2 fails — circular dependency:**
```
STORY-03 depends on STORY-05
STORY-05 depends on STORY-03
```
→ Cycle: STORY-03 ↔ STORY-05. Neither can start.

**G2 fails — dependency outside sprint, no confirmation:**
```
STORY-07: Underwriter Review
Dependencies: STORY-03 (Eligibility Check) — not in this sprint, no "already done" confirmation
```
→ STORY-07 cannot be delivered this sprint.

### Pass Example

```
STORY-01: no dependencies
STORY-02: depends on STORY-01 ✅ (STORY-01 is in the sprint)
STORY-03: depends on STORY-01, STORY-02 ✅ (both in the sprint)
STORY-04: depends on STORY-03 ✅ (STORY-03 is in the sprint)
Topological order: STORY-01 → STORY-02 → STORY-03 → STORY-04 ✅ valid DAG
```

---

## G3 — AC Completeness

**Lens:** ac-quality-lens
**Severity if violated:** HIGH

### Definition

Every story has at least 3 acceptance criteria. Each AC is in Given/When/Then format or clear bullet-list format. No AC is an implementation instruction.

### How to Check — Step by Step

1. Open each `ac-draft-{story}.md` file
2. Count ACs. Flag any story with fewer than 3.
3. For each AC, check format:
   - Given/When/Then: verify Given (state), When (one action), Then (observable outcome)
   - Bullet list: acceptable for non-behavioural constraints only
4. For each AC, check content: does it describe what the USER sees, or what the SYSTEM does internally?
5. Flag any AC containing: method names, HTTP codes, class names, database terms, framework terms

### Auto-Fail Examples

**Fewer than 3 ACs:**
```
AC-01: The driver receives an eligibility result. (only 1 AC)
```
→ G3 fails.

**AC is an implementation instruction:**
```
AC-02: Call EligibilityService.Check() and return the result with HTTP 200.
```
→ G3 fails: implementation instruction, not a user observable outcome.

### Pass Example

```
AC-01: (eligible driver)
Given a driver aged 29 with 0 accidents and a valid B licence
When the driver requests an eligibility check
Then the driver receives an eligibility confirmation valid for 30 days

AC-02: (ineligible driver)
Given a driver with 2 at-fault accidents in the last 3 years
When the driver requests an eligibility check
Then the driver receives an ineligibility notice stating "accident threshold exceeded"

AC-03: (under-age driver)
Given a driver aged 17
When the driver requests an eligibility check
Then the driver receives a rejection stating "below minimum age"
```
→ 3 ACs, G/W/T format, domain vocabulary, observable outcomes. G3 passes.

---

## G4 — AC Unambiguity

**Lens:** ac-quality-lens
**Severity if violated:** BLOCKER

### Definition

Every acceptance criterion has a single unambiguous interpretation when read by a domain expert with no code knowledge. An AC that can be implemented in two different ways by two different engineers and both be "correct" is ambiguous.

### How to Check — Step by Step

1. For each AC, read it aloud as if you are a business analyst who has never seen the codebase
2. Ask: "Could two engineers implement this differently and both claim to have satisfied the AC?"
3. If yes → AC is ambiguous → G4 violation
4. Scan for G4 red flags (see below)

### G4 Red Flags (Auto-Fail)

| Red flag | Example | Problem |
|---|---|---|
| HTTP status codes | `The system returns HTTP 200` | Two valid interpretations: the UI shows a success message, OR the API returns 200 |
| HTTP verbs | `A POST request is sent to /eligibility` | Couples AC to a REST implementation decision |
| Vague notification | `The driver is notified` | By email? By UI? By SMS? Three valid interpretations |
| Vague threshold | `The response is fast` | "Fast" has no agreed definition |
| Class references | `The EligibilityService returns true` | Couples AC to a class design decision |

### Auto-Fail Example

```
AC-01: The driver is notified of the result and the system updates accordingly.
```
→ G4 fails: "notified" is ambiguous (channel?), "updates accordingly" is ambiguous (what updates?).

### Pass Example

```
AC-01:
Given a driver aged 29 with 0 accidents and a valid B licence
When the driver submits their profile for an eligibility check
Then the driver sees the message "You are eligible for insurance coverage"
And the confirmation shows a validity period of 30 days
And the driver sees a "Continue to document upload" button
```
→ Single unambiguous interpretation. G4 passes.

---

## G5 — Milestone Scope

**Lens:** planning-coherence-lens
**Severity if violated:** HIGH

### Definition

All stories in the sprint align with the milestone's stated theme. No story spans multiple milestone themes without decomposition. The milestone is deliverable within its stated time-box.

### How to Check — Step by Step

1. Read the milestone description (sprint goal and key deliverables)
2. For each story, ask: "Does this story's outcome belong in this milestone's theme?"
3. If a story touches a different feature domain (e.g., a payment story in the `v0.2-eligibility` milestone) → G5 violation
4. Verify total story-days ≤ sustainable capacity (see sprint-planning skill)
5. Flag stories estimated at L with loose ACs (scope unclear within the time-box)

### Auto-Fail Example

```
Milestone: v0.2-eligibility (sprint goal: driver eligibility decision flow)
Stories:
  STORY-03: Driver eligibility check ✅
  STORY-04: Driver document upload ❌ (document upload is a different feature theme)
  STORY-05: Payment processing ❌ (payment is out of scope for eligibility milestone)
```

### Pass Example

```
Milestone: v0.2-eligibility
Stories:
  STORY-03: Driver eligibility check ✅
  STORY-06: Eligibility certificate download ✅ (part of eligibility flow)
  STORY-07: Ineligibility notice with reasons ✅ (part of eligibility flow)
All stories directly support the sprint goal.
```

---

## G6 — Dependency DAG

**Lens:** planning-coherence-lens
**Severity if violated:** BLOCKER

### Definition

The dependency graph for the sprint is a Directed Acyclic Graph. No circular dependencies exist. The delivery sequence is derivable from topological sort.

### How to Check — Step by Step

1. Build adjacency list from all `Dependencies` fields
2. Run DFS. For each node, track: visited (already fully processed) and in-stack (currently in recursion)
3. If a node already in-stack is encountered → back-edge → cycle → BLOCKER
4. Report the exact cycle path

### Auto-Fail Example

```
STORY-03 depends on: STORY-05
STORY-05 depends on: STORY-03
→ Cycle detected: STORY-03 → STORY-05 → STORY-03
G6 violation: BLOCKER
```

### Pass Example

```
Adjacency list:
  STORY-01: []
  STORY-02: [STORY-01]
  STORY-03: [STORY-01, STORY-02]
  STORY-04: [STORY-03]

DFS result: no back-edges detected
Topological order: STORY-01 → STORY-02 → STORY-03 → STORY-04 ✅
G6 passes.
```

---

## G7 — DoR 8-Item Gate

**Lens:** dor-compliance-lens
**Severity if violated:** BLOCKER

### Definition

Every story in the sprint passes all 8 Definition of Ready items. A single failing item = G7 violation for that story. Two or more failing items on the same story = automatic `rejected` verdict.

### How to Check — Step by Step

For each story, verify all 8 items:

1. **Problem statement**: Story body does NOT start with "implement", "create a service", "build", "refactor". Persona is not a developer role.
2. **Specific persona**: Persona is a named domain role. "user", "someone", "person" → fail.
3. **3+ domain examples**: Count examples. Each must have real values (names, numbers, specific context).
4. **UAT scenarios**: At least 3 G/W/T scenarios exist, derived from domain examples.
5. **AC derived from UAT**: Trace each AC to a domain example. AC without a source → fail.
6. **Right-sized**: Estimate is XS, S, M, or L (with tight ACs). XL → automatic fail.
7. **Technical notes**: Section exists and contains at least one note (or explicit "None identified").
8. **Dependencies**: Section exists and lists all inter-story dependencies (or explicit "None").

### Auto-Fail Examples

```
Story: STORY-08 — Policy Issuance
Missing DoR items:
  - Item 2: Persona is "the user" (vague)
  - Item 3: Only 1 domain example (minimum: 3)
  - Item 7: Technical notes section absent
→ 3 items failing → G7 BLOCKER → minimum verdict: rejected
```

### Pass Example

```
Story: STORY-03 — Driver Eligibility Check
DoR check:
  ✅ Item 1: "As a first-time driver... I want to receive..." (not "implement")
  ✅ Item 2: "first-time driver applying for personal liability coverage"
  ✅ Item 3: 3 examples with names, ages, accident counts, expected outcomes
  ✅ Item 4: 3 G/W/T scenarios
  ✅ Item 5: each AC traces to an example (trace table present)
  ✅ Item 6: Effort M (1 day)
  ✅ Item 7: "calls eligibility-service v2, P95 < 2s, stateless"
  ✅ Item 8: "STORY-01 and STORY-02 listed, both in sprint"
G7 passes: 8/8 items.
```

---

## G8 — Antipattern Absence

**Lens:** dor-compliance-lens
**Severity if violated:** BLOCKER (CRITICAL antipatterns); HIGH (HIGH antipatterns)

### Definition

No CRITICAL antipatterns are present in any story. No HIGH antipatterns are present. CRITICAL antipatterns are automatic `rejected` verdicts. HIGH antipatterns trigger `changes_requested`.

### CRITICAL Antipatterns (Auto-Reject)

| ID | Name | Detection |
|---|---|---|
| AP-DISCUSS-01 | Implement-X | Persona = developer/engineer/architect; capability verb = implement/build/refactor |
| AP-DISCUSS-04 | Giant Stories | 8+ ACs OR scope covers entire user journey OR XL estimate with no split |
| AP-DISCUSS-05 | No Examples | Domain Examples section absent, empty, or has zero real values |

### HIGH Antipatterns (Changes Requested)

| ID | Name | Detection |
|---|---|---|
| AP-DISCUSS-02 | Generic Data | Examples contain "some", "a few", "enough", "several" without real values |
| AP-DISCUSS-03 | Technical AC | AC contains HTTP codes, class names, method names, framework terms |
| AP-DISCUSS-06 | Tests After Code | Given step references a running service, database state, or deployed system |
| AP-DISCUSS-07 | Vague Persona | Persona is "the user", "someone", "a person", "a customer" without role |
| AP-DISCUSS-08 | Missing Dependencies | Story references data from another story not listed in Dependencies |

### Pass Example

```
Story: STORY-03 — Driver Eligibility Check
G8 antipattern scan:
  AP-DISCUSS-01: Persona = "first-time driver" ✅ not a developer role
  AP-DISCUSS-04: 3 ACs, estimate M ✅ not a giant story
  AP-DISCUSS-05: 3 domain examples with real values ✅
  AP-DISCUSS-02: "aged 29", "0 accidents", "B licence" ✅ real values
  AP-DISCUSS-03: No HTTP codes or class names in ACs ✅
  AP-DISCUSS-06: Given = "a driver aged 29..." ✅ not a system state
  AP-DISCUSS-07: "first-time driver applying for personal liability coverage" ✅ specific
  AP-DISCUSS-08: Dependencies section lists STORY-01 and STORY-02 ✅
G8 passes.
```
