---
name: acceptance-review-criteria
description: Use when reviewing DISTILL artefacts (Gherkin scenarios, test plans, implementation plans) for quality, completeness, and alignment. Contains the gate definitions and scoring rubric for the DISTILL review lenses.
---

# Acceptance Review Criteria

## Overview

Formal gate definitions and verdict rubric for the DISTILL review. Applied across 4 lenses (coverage, business-alignment, testability, boundary-enforcement) that the engine runs; it computes the verdict from their findings.

---

## Gate Definitions (G1–G11, B1, T1–T3, E1–E2)

Every gate id is unique across the four lenses: a finding's `gate` names one row below.

### Lens 1: coverage-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| AC–Scenario bijection | G1 | Every AC in `ac-draft-{story}.md` maps to ≥1 scenario. No scenario exists without a traceable AC. | All ACs covered, no orphan scenarios. | BLOCKER |
| Edge case representation | G2 | Boundary conditions and negative cases from the domain examples in the story are represented as scenarios. Only the story and its acceptance criteria give examples: a Gherkin mapping, an example or a variant a DESIGN document writes (event model, tactical design) is none, and a variant an earlier rule of the story already decides (a precedence) adds no boundary. A technical input case (a value of the wrong type, `NaN`, infinity, `null`/`undefined`, a number written as text) is no business rule: it is never asked for as a scenario, and belongs in the test plan as an inner-loop unit case citing its DESIGN decision. | ≥1 edge case or boundary condition scenario per business rule; every technical input case DESIGN decides is in the test plan. | HIGH |

**Checking G1:**
1. List all ACs from `ac-draft-{story}.md`
2. List all scenarios from `*.feature`
3. Build a trace matrix: AC → scenario(s)
4. Flag any AC with no scenario (missing) and any scenario with no AC (orphan)

---

### Lens 2: business-alignment-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Business vocabulary | G3 | All nouns, verbs, and adjectives in Given/When/Then steps appear in the domain vocabulary of the stories or the business lexicon. No class names, method names, HTTP verbs, or framework names. | Zero technical identifiers in `.feature` files. | HIGH |
| No technical jargon | G4 | Given/When/Then steps contain zero implementation details: no HTTP status codes, no ORM terms, no database language, no DI container references. | Zero implementation leaks. | BLOCKER |
| Story scope | B1 | Every scenario expresses an outcome the story asks for; none describes behaviour the story does not ask for. A value the story leaves open (a format, a limit) fixed by a scenario is behaviour the story does not ask for, unless a DESIGN document decides it. | Every scenario traces to a statement of the story or a DESIGN decision. | HIGH |

**G4 red flags (auto-fail):**
- `POST`, `GET`, `HTTP 200`, `HTTP 422`
- `Repository`, `Service`, `Handler`, `Controller`, `UseCase`
- `null`, `true`, `false` as business values (unless they are genuine domain terms)
- A technical input case in a step or an Examples cell (`NaN`, `Infinity`, `undefined`, a quoted number), even reworded ("an endless amount"): the finding asks to move it to the test plan as an inner-loop unit case, never to reword it
- SQL, JSON, XML, YAML in scenario text
- Class names (Pascal case identifiers)

---

### Lens 3: testability-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Step unambiguity | G5 | Every step can be implemented without asking the designer for clarification. The step's meaning is unambiguous within the domain vocabulary. | Every step maps uniquely to a domain action or state. | HIGH |
| Implementation plan completeness | G6 | Every scenario listed in the `.feature` files has a corresponding entry in `impl-plan-{story}.md` with a file path and a use case boundary, except a scenario whose test-plan row is a proven `existing` row (below). | Bijection feature scenarios ↔ impl-plan entries other than proven `existing` rows; an `existing` row without its proof is a G6 finding. | HIGH |
| Scenario in progress | T2 | The patch holds the acceptance test of the scenario in progress only, S1 on the pass the review judges (`outside-in-tdd`: one acceptance test at a time): DISTILL writes each later scenario's test once the one before passes, so a later scenario absent from the tests is no finding, and a test of a later scenario, or one marked skipped, is. Every input and expected value the test holds equals its scenario in the `.feature` verbatim (same numbers, texts, units). | One scenario's acceptance test; no value it holds differs from the `.feature`. | BLOCKER |
| Failing for the business reason | T3 | The acceptance test of the scenario in progress exists in the patch and fails on a business assertion (an expected outcome not met), not on a compile, import or setup error. The production code it calls exists as a skeleton: the use case the event model names with its input and output types, each answering the empty value of its type, with no behaviour; for the walking skeleton, the entry point that reaches it too, wired in the composition root. | The test file is in the changes, its failure is an assertion on the expected outcome, and every production file of the patch holds only that skeleton. | BLOCKER |
| One observable behaviour | T1 | Each scenario and test checks one behaviour through an observable outcome and depends on no time, order or randomness it does not fix. | No scenario asserts two behaviours; no test reads the clock, the order of other tests or a random value it does not set. | HIGH |
| Inner-loop boundary presence | G11 | The acceptance test of the scenario in progress lives where its kind puts it, per `clean-architecture-testing`, and the file physically exists in the repo, referenced from `impl-plan-{story}.md`. The walking skeleton: the integration-test place of its component, entering through the real entry point. Any other scenario, S1 of an exempt story included: the unit-test place of its component's language, entering at the Application layer: .NET a `<Context>.UnitTest` project (`.UnitTests`, `.Unit.Test`, `.Unit.Tests`, `.Test` and `.Tests` too); Java a `<context>-unit-test` or `<context>-unit-tests` module; any other language (Python, TypeScript, JavaScript, React) a `unit` folder right under the component's test path (`tests/unit/`, `test/unit/`), or that test path itself when it is named `unit`; an Integration/HTTP test never stands for it. | The test of the scenario in progress is a real file in the place its kind takes. | BLOCKER |

**Checking G5:** For each step, ask "could two engineers implement this differently and both be correct?" If yes, the step is ambiguous.

**Checking T2:** the scenario in progress is S1, the first row of the test plan's `## Scenarios` table. A test case of another scenario, or one marked `Skip`, `[Ignore]` or `.skip`, is a finding at its line. For each literal value the acceptance test holds, find the same value in its scenario of the `.feature`; a value rounded, reworded or absent from the `.feature` is a finding at the test's line. Later scenarios are not in the tests yet: never ask for them.

**Checking T3:** the engine replays the test commit and refuses one whose JUnit report shows no failing assertion: a build, collection or import error (no report), errors only, skipped tests, all green, or a timeout.
1. Read the test: a failure only because a module, file or import is missing is a setup failure, a finding, in a new component too: DISTILL writes the skeleton instead. A failure on `assert.equal(result, expected)`-like code is the business failure T3 asks for.
2. Read every production file of the patch. Each declares only the use case the event model names and what it needs to be called (function, class, method, the use case's input and output types; for the walking skeleton, the entry point wired to it), each body answering the empty value of its type (`undefined`, `null`, `None`, `default`, an empty collection). A body that throws is a finding: a thrown error is not an assertion failing. A branch, a computation, a value of the story, or a file the use case does not need is a finding at its line.
3. A loader, harness or stub inside the tests standing in for missing production code is a finding at its line: the skeleton is the only way to a business failure.

**Checking G11:** the engine reads where the patch adds test files and reports, as `testability#layout`, a test added outside the unit and integration places of its component's language. Never report those again; judge the rest:
1. Find the scenario in progress (S1) in the test plan's `## Scenarios` table, its component and whether it is tagged `@walking-skeleton`.
2. Find the component's language and test path (`skraft-config.json`, else the repo layout). Its unit-test place: .NET `tests/**/<Context>.UnitTest(s)/**`, `<Context>.Unit.Test(s)/**` or `<Context>.Test(s)/**`; Java `<context>-unit-test(s)/**`; any other language `<test path>/unit/**`. Its integration-test place: .NET `<Context>.IntegrationTest(s)` or `.Integration.Test(s)`; Java `<context>-integration-test(s)`; any other language `<test path>/integration/**`.
3. The walking skeleton's test missing from the integration-test place, or entering through the use case instead of the entry point → BLOCKER. Any other scenario's test missing from the unit-test place, or entering through an endpoint, a message or an infrastructure class instead of the use case → BLOCKER: the outer loop is not where `clean-architecture-testing` puts the Application circle (`outside-in-tdd` Concentric circles). In .NET, a test project whose name ends in none of `.UnitTest(s)`, `.Unit.Test(s)`, `.Test(s)` never is the unit-test place.

---

### Lens 4: boundary-enforcement-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Layer boundary compliance | G7 | Each row in the coverage matrix, except a proven `existing` row (below), targets an Application layer use case the event model `docs/domain/event-model/{bounded-context}.md` names (one of its Commands or Queries); the walking skeleton's row names the use case its entry point reaches. No scenario targets an Infrastructure adapter directly as its primary entry point. An implementation-plan step that writes no scenario's acceptance test (an API, HTTP or Infrastructure test of a later circle) is no row of the matrix: never a G7 finding. | All coverage matrix entries reference a use case boundary the event model names. | BLOCKER |
| Walking skeleton | G8 | S1 is the story's walking skeleton, tagged `@walking-skeleton`, in a back-end component: its acceptance test drives the real entry point (HTTP endpoint, CLI command, consumed message) through the use case to the real internal gateways (the database on Testcontainers), external gateways and clock as the infrastructure policy says. Or the test plan declares `Walking skeleton exemption: <value>` under its Scenarios table and the story's changes bear it out: `library` (the component has no entry point), `refactoring` (no new endpoint, command, message or public type), `docs-only` (no source file changed). | S1's test runs that real path, or the declared exemption holds. | BLOCKER |
| Use case only | E1 | The acceptance test of a scenario drives only its entry: the use case for a targeted scenario, the real entry point for the walking skeleton. It never calls or asserts on a domain internal, a repository implementation or an infrastructure class directly. Constructing the use case's real collaborators to hand them to its constructor, or the test host and containers of the walking skeleton, is wiring, not a finding. An integration test an implementation-plan step adds is no acceptance test. | Every call and assertion of the acceptance test goes through its entry's input and output. | BLOCKER |
| Infrastructure by policy | E2 | Each dependency the acceptance test reaches runs on what the infrastructure policy names for its scenario's stage (`test-design-mandates`; a component's `infrastructure` in `skraft-config.json` overrides it), as the test plan's `Double Type` writes it: targeted, internal gateways in-memory, external gateways on Microcks, clock fake; walking skeleton, internal gateways on Testcontainers, external gateways on Microcks, clock fake. Never a double of a domain object or of the use case under test; never a hand-written fake where the policy names Microcks or Testcontainers. | Every dependency of the acceptance test runs on its policy's mechanism. | HIGH |
| Visual AC evidence | G9 | Every `@visual` scenario has ≥1 Playwright E2E spec in `tests/e2e/` per `impl-plan-{story}.md`. jsdom/unit entry invalid. | Bijection `@visual` scenarios ↔ Playwright E2E spec entries. | HIGH |
| Comparable contract consistency | G10 | When `impl-plan-{story}.md` plans a component (hook/adapter/client) that is comparable to one already implemented for a similar responsibility in a prior story, its planned state/return/error convention matches the existing component's, unless the plan notes an explicit, justified divergence. | Every comparable pair of planned components shares its convention, or the divergence is explicitly noted and justified in the impl-plan. | HIGH |

**Coverage matrix codes:** a row with `Layer = Domain` carries the `Extraction Reason` of `test-design-mandates` Mandate 4: `branch_unreachable_via_AC` (gate a: a branch no acceptance scenario can reach, a technical input guard included) or `combinatorial_economy` (gate b: a rule sweep that would explode the scenario count). A Domain row without one of these two codes, other than a proven `existing` row, is a G7 finding; a row with one is never a finding for its code alone.

**Proven `existing` row:** `Priority` `existing`, and its Scenario cell names the covering test (file and test name, a test the research document lists under `Existing tests`), the command that ran it filtered to it, and its result `passed`. An `existing` row missing the test, the command or the result, or whose result is not `passed`, is exempt from neither G6 nor G7: it is a finding of each gate it would skip.

**Checking E2:** the skeleton DISTILL writes in the production code (T3) is the real module the story fills, not a double; a stand-in for it inside the tests is one. A Microcks or Testcontainers dependency that cannot run because no container runtime answers is an environment problem, never a reason for a fake.

**Checking G8:** the engine already refuses a Scenarios table that tags a scenario other than S1 `@walking-skeleton`, puts S1 in a `react` component while the configuration has a back end, names an unknown exemption, or declares `docs-only` while a commit changes a component's source. Judge the rest: S1's test runs the real path; `library` holds only when the component has no entry point at all; `refactoring` only when the patch and the story add no public interface.

**Checking G9:**
1. List all scenarios tagged `@visual` in the `.feature` files
2. List all `tests/e2e/` spec entries in `impl-plan-{story}.md`
3. Verify each `@visual` scenario maps to ≥1 E2E spec asserting its roles and texts in a real browser; its screenshots are the `visuals` step's evidence, never an assertion of the acceptance test
4. Flag any `@visual` scenario whose only planned coverage is a unit/jsdom test

**Checking G10:**
1. List every client-side consumer (hook or client wrapper) named in `impl-plan-{story}.md` and the interface it wraps.
2. Scan sibling `impl-plan-*.md` files (other stories in the same or prior milestones) for a consumer wrapping a comparable interface (same shape class: list query, single-item query, command with optimistic update, ...).
3. When a comparable prior consumer exists, confirm `impl-plan-{story}.md` names it and states either "same convention as `{prior}`" or notes and justifies the divergence.
4. No comparable prior consumer in scope → gate is vacuously satisfied (nothing to compare against).
5. A named prior consumer with no convention statement, or a silent state-shape difference undetected by the plan → G10 HIGH fail.

---

## Severity Definitions

| Severity | Definition | Impact |
|---|---|---|
| **BLOCKER** | Fundamental correctness violation. The artefact cannot be used by DELIVER as-is. | Always triggers `rejected` verdict. |
| **HIGH** | Significant quality gap. Increases implementation risk or causes rework in DELIVER. | Triggers `changes_requested` unless no other severity exists. |
| **MEDIUM** | Quality improvement. Can be implemented but suboptimal. | Triggers `changes_requested`. |
| **LOW** | Style or consistency issue. Does not affect DELIVER. | `approved` with recommendation. |

---

## Verdict Derivation

| Condition | Verdict |
|---|---|
| ≥1 BLOCKER in ANY lens | `rejected` |
| ≥1 HIGH, 0 BLOCKER (across ALL lenses) | `changes_requested` |
| MEDIUM only (across ALL lenses) | `changes_requested` |
| LOW only, or all lenses pass | `approved` |

**Confidence:**
- `high` — all artefacts present, clear findings, no ambiguity
- `medium` — some artefacts missing, or findings require interpretation
- `low` — critical artefacts missing, review is incomplete

---

## Dissent Handling

When 3 lenses pass and 1 fails:

1. Document the minority finding explicitly in `dissent`
2. Assess whether the minority finding independently triggers BLOCKER/HIGH severity
3. If BLOCKER/HIGH → **uphold** the minority. Verdict = `changes_requested` or `rejected`.
4. If MEDIUM/LOW → **override** the minority. Verdict = `approved` with recommendation.
5. NEVER silently override. Document the reasoning.

Example dissent entry:
```
dissent: "business-alignment-lens flagged 'driver ID' in step text (G3 HIGH).
Overridden: 'driver ID' is a genuine domain term used consistently in the story
vocabulary. Not a technical identifier. Verdict remains approved."
```

---

## Scoring Rubric (per lens)

| Score | Meaning |
|---|---|
| `pass` | All gates in this lens pass. No findings. |
| `fail` | ≥1 gate in this lens has a finding. |

Each finding includes:
- `gate` — one id of the tables above (G1–G11, B1, T1–T3, E1–E2)
- `severity` — BLOCKER / HIGH / MEDIUM / LOW
- `finding` — plain-language description of the problem
- `location` — file path and line/scenario reference
- `suggestion` — (optional) how to fix it

---

## References

- [gate-definitions.md](references/gate-definitions.md) — detailed gate checklist with examples
- [verdict-rubric.md](references/verdict-rubric.md) — decision table with example scenarios
