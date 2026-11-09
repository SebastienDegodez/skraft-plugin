# Gate Definitions G1–G11, B1, T1–T3, E1–E2

Formal checklist for the DISTILL review lenses the engine runs. One section per lens.

---

## Lens 1: coverage-lens

### G1 — AC–Scenario Bijection

**Definition:** Every acceptance criterion in `ac-draft-{story}.md` maps to at least one scenario in the `.feature` files. No scenario exists without a traceable AC.

**How to check:**
1. Extract all ACs from `ac-draft-{story}.md` — label them AC-01, AC-02, …
2. Extract all scenarios from `*.feature` files
3. Build the trace matrix:
   ```
   AC-01 → Scenario "Driver with clean record obtains eligibility" ✅
   AC-02 → Scenario "Driver at age limit obtains eligibility" ✅
   AC-03 → [NO SCENARIO] ❌ BLOCKER
   ```
4. Flag: missing coverage (AC with no scenario) and orphan scenarios (no AC)

**Severity:** BLOCKER
**Common cause:** Designer forgot to translate an AC, or a scenario was written without an AC source.

---

### G2 — Edge Case Representation

**Definition:** Boundary conditions and negative cases from the domain examples in the story are represented as scenarios. Only the story and its acceptance criteria give examples: a Gherkin mapping, an example or a variant a DESIGN document writes (event model, tactical design) is none, and a variant an earlier rule of the story already decides (a precedence) adds no boundary.

**How to check:**
1. Read the domain examples section of the story
2. Identify boundary values (min age, max accidents, threshold dates, etc.)
3. Verify a scenario exists for each boundary condition
4. Verify at least one rejection/error scenario per business rule

**Severity:** HIGH
**Common cause:** Designer wrote happy path only, missed the boundary cases in domain examples.

---

## Lens 2: business-alignment-lens

### G3 — Business Vocabulary

**Definition:** All nouns, verbs, and adjectives in Given/When/Then steps appear in the domain vocabulary of the stories or the domain lexicon. No technical identifiers.

**How to check:**
1. Extract all words from Given/When/Then steps
2. Cross-reference with: story vocabulary, AC vocabulary, domain lexicon (FR→EN table)
3. Flag any word that is: a class name, a method name, an HTTP verb, a framework term, or a database term

**Auto-fail words (examples):**
- `Repository`, `Service`, `Handler`, `Controller`, `Adapter`, `UseCase`
- `POST`, `GET`, `PUT`, `DELETE`, `HTTP`, `REST`, `JSON`, `XML`
- `null`, `true`, `false` (unless genuinely part of domain language)
- `SQL`, `SELECT`, `INSERT`, `ORM`, `Entity`
- Any PascalCase identifier (class name signal)

**Severity:** HIGH

---

### G4 — No Technical Jargon

**Definition:** Given/When/Then steps contain zero implementation details.

**How to check:**
1. Read each step as if you are a domain expert with no software engineering background
2. Ask: "Would this step make sense to a business analyst?"
3. Flag any step that would require software knowledge to understand

**Auto-fail examples:**
```gherkin
# ❌ BLOCKER
When I call the EligibilityApplicationService.checkEligibility method
Then HTTP status 200 is returned with body {"eligible": true}
Given the InMemoryEligibilityRepository is seeded with driver "DRV-001"
```

**Severity:** BLOCKER

---

## Lens 3: testability-lens

### G5 — Step Unambiguity

**Definition:** Every step can be implemented by any engineer without asking the designer for clarification. The step's meaning is unambiguous within the domain vocabulary.

**How to check:**
For each step, apply the "two engineers" test:
> "Could two engineers implement this step differently and both be correct?"

If YES → ambiguous → flag.

**Common ambiguities:**
- `Given a valid driver` — what makes a driver valid? Define it.
- `When the system processes the request` — not a user action; what action exactly?
- `Then the result is positive` — positive in what business sense?

**Severity:** HIGH

---

### G6 — Implementation Plan Completeness

**Definition:** Every scenario in the `.feature` files has a corresponding entry in `impl-plan-{story}.md` with a file path and a use case boundary.

**How to check:**
1. List all scenario titles from `*.feature`
2. List all entries in `impl-plan-{story}.md`
3. Verify bijection

**Severity:** HIGH — DELIVER cannot start if a scenario has no implementation entry.

---

### G11 — Inner-Loop Boundary Presence

**Definition:** The acceptance test of the scenario in progress lives where its kind puts it, per `clean-architecture-testing`, and the file physically exists in the repo, referenced from `impl-plan-{story}.md`:

| Scenario | Place | Entry |
|---|---|---|
| Walking skeleton (S1 tagged `@walking-skeleton`) | the integration-test place of its component | the real entry point (HTTP endpoint, CLI command, consumed message) |
| Any other, S1 of an exempt story included | the unit-test place of its component's language | the use case boundary (Application layer) |

| Language | Unit-test place | Integration-test place |
|---|---|---|
| .NET | a `tests/<Context>.UnitTest/` project (`.UnitTests`, `.Unit.Test`, `.Unit.Tests`, `.Test` and `.Tests` too); a project whose name ends in none of these never is it | `<Context>.IntegrationTest(s)` or `<Context>.Integration.Test(s)` |
| Java | the `<context>-unit-test` or `<context>-unit-tests` module | `<context>-integration-test(s)` |
| Any other (TypeScript, JavaScript, Python, React…) | a `unit` folder right under the component's test path in `skraft-config.json` (`tests/unit/`, `test/unit/`), or that test path itself when it is named `unit` | an `integration` folder right under it |

**Why this gate exists:** `outside-in-tdd`'s Concentric circles put the Application-layer acceptance test of a targeted scenario in the fast unit suite, and the walking skeleton's real path in the integration suite. A targeted scenario covered only by an HTTP or Integration test is one circle removed from the boundary DELIVER implements against; a walking skeleton entering through the use case proves no wiring. G1–G10 check Gherkin and plan artefacts, never the test files on disk.

**How to check:**
1. Find the scenario in progress (S1) in the test plan's `## Scenarios` table: its component, and whether it is tagged `@walking-skeleton`.
2. Search the place its kind takes (tables above) for its acceptance test file.
3. Flag a missing file, a file in the other place, or a test entering anywhere but its entry.

**Auto-fail example:**
```
test-plan-eligibility.md: S1 "Driver checks eligibility" — @walking-skeleton, component api (.NET)
Repo search: tests/Eligibility.UnitTest/Features/Eligibility/EligibilityAcceptanceTests.cs (found, calls CheckEligibilityUseCase)
             tests/Eligibility.IntegrationTest/** (NOT FOUND)
→ G11 BLOCKER: the walking skeleton enters through the use case, not the real entry point.

test-plan-checkout.md: S1 "Customer pays an order" — exempt (library), component JavaScript, test path tests/
Repo search: tests/pay.test.mjs (found, at the test path root)
             tests/unit/** (NOT FOUND)
→ G11 BLOCKER: the acceptance test is not in tests/unit/.
```

**Severity:** BLOCKER — the RED the test proves (T3) is not a RED of the boundary DELIVER must implement against.

---

## Lens 4: boundary-enforcement-lens

### G7 — Layer Boundary Compliance

**Definition:** Each row in the coverage matrix (`test-plan-{story}.md`), the walking skeleton's included, targets an Application layer use case the event model `docs/domain/event-model/{bounded-context}.md` names (one of its Commands or Queries). No scenario targets an Infrastructure adapter as its primary entry point. An implementation-plan step that writes no scenario's acceptance test (an API, HTTP or Infrastructure test of a later circle) is no row of the matrix: never a G7 finding.

**How to check:**
1. Read the event model `docs/domain/event-model/{bounded-context}.md` of the story's bounded context — its Commands and Queries are the list of valid use case boundaries
2. Read `test-plan-{story}.md` — check the "Use Case Boundary" column for each row
3. Verify each boundary name appears in the event model as a Command or a Query
4. Flag any row that names an Infrastructure class (repository, adapter) as the entry point instead of a use case

**Severity:** BLOCKER — a test entering through Infrastructure instead of Application skips the business logic.

---

### G8 — Walking Skeleton

**Definition:** S1 is the story's walking skeleton, tagged `@walking-skeleton`, in a back-end component: its acceptance test drives the real entry point through the use case to the real internal gateways (the database on Testcontainers), external gateways and clock as the infrastructure policy says (`test-design-mandates`). Or the test plan declares, under its `## Scenarios` table, `Walking skeleton exemption: <value>`, and the story's changes bear it out:

| Exemption | Holds when |
|---|---|
| `library` | the component is a pure library: no entry point at all |
| `refactoring` | the story and the patch add no public interface: no endpoint, command, message or public type |
| `docs-only` | the story changes configuration or documentation only: no source file |

**How to check:** the engine already refuses a table that tags a scenario other than S1, puts S1 in a `react` component, names an unknown exemption, or declares `docs-only` while a commit changes a component's source.
1. No exemption: open S1's acceptance test. It starts the component through its production composition root and sends the request, command or message the story's entry point takes; the use case and the internal gateways it reaches are the real ones, the database a Testcontainers container. A test that calls the use case, or an in-memory repository, is a finding.
2. An exemption: check it against the story and the patch; an entry point the component has (`library`), or a public interface the story adds (`refactoring`), is a finding.

**Severity:** BLOCKER — without a real walking skeleton, DELIVER builds every scenario on wiring nothing proved; an exemption the changes contradict hides that.

---

### G9 — Visual AC Evidence

**Definition:** Every scenario tagged `@visual` (a visual/positional/style AC per `bdd-methodology`)
has at least one corresponding Playwright E2E spec under `tests/e2e/`, referenced in
`impl-plan-{story}.md`. Its red is functional: it fails on roles and texts the page shows.
The screenshots are evidence the `visuals` step captures from the e2e run, judged there, never an
assertion of the acceptance test. A unit/jsdom test entry does NOT satisfy this gate.

**How to check:**
1. List all `@visual`-tagged scenarios in the `.feature` files
2. List all `tests/e2e/` entries in `impl-plan-{story}.md`
3. Verify each `@visual` scenario maps to ≥1 E2E spec asserting its roles and texts in a real
   browser
4. Flag any `@visual` scenario whose only planned coverage is a unit/jsdom test — jsdom renders
   no page, so what it asserts is never what the person sees

**Severity:** HIGH — a `@visual` AC closed only by a unit test is a structural proxy, not proof of
the rendered result; the real visual regression risk is uncaught.

---

### G10 — Comparable Contract Consistency

**Definition:** When `impl-plan-{story}.md` plans a component (hook, adapter, client) that plays the same role as one already implemented in a prior story for a comparable responsibility (e.g. two React hooks each wrapping a similar query, two API clients for sibling endpoints), the planned state/return/error convention must match the existing component's — same loading/error/data shape, same naming for the exposed fields — unless the impl-plan explicitly notes and justifies the divergence.

**How to check:**
1. List the components (hooks/adapters/clients) named in `impl-plan-{story}.md`, grouped by consumer category with any comparable components from prior stories' impl-plans or existing code.
2. For each group, compare the planned state/return/error shape.
3. Flag any pair whose shape differs with no justification recorded in the impl-plan notes.

**Auto-fail example:**
```
impl-plan-US-01.md: useDriverEligibility → { data, error, loading }
impl-plan-US-04.md: useDriverHistory      → { result, isError, pending }  (no rationale noted)
```

**Severity:** HIGH — an unexplained convention drift between comparable components is only caught
during DELIVER integration otherwise, after both implementations are already written.

---

## Quick Reference

| Gate | Lens | Check | Severity |
|---|---|---|---|
| G1 | coverage | AC↔scenario bijection | BLOCKER |
| G2 | coverage | Edge cases from domain examples | HIGH |
| G3 | business-alignment | Business vocabulary — no technical identifiers | HIGH |
| G4 | business-alignment | No implementation details in steps | BLOCKER |
| B1 | business-alignment | Every scenario is an outcome the story asks for | HIGH |
| G5 | testability | Unambiguous steps | HIGH |
| G6 | testability | Impl plan covers all scenarios | HIGH |
| G11 | testability | The scenario in progress's acceptance test is in the place its kind takes: walking skeleton in the integration place through the entry point; any other in the unit-test place through the use case | BLOCKER |
| T1 | testability | One observable behaviour per scenario, nothing unfixed (time, order, randomness) | HIGH |
| T2 | testability | The tests hold the scenario in progress only, its values equal to the `.feature` verbatim | BLOCKER |
| T3 | testability | Acceptance test fails on a business assertion, not on setup; production code is a skeleton answering empty values (and the walking skeleton's entry point wired to it) | BLOCKER |
| G7 | boundary-enforcement | Coverage matrix → valid use case boundary | BLOCKER |
| G8 | boundary-enforcement | S1 is a real walking skeleton, or the declared exemption holds | BLOCKER |
| G9 | boundary-enforcement | `@visual` scenarios ↔ Playwright E2E spec bijection | HIGH |
| G10 | boundary-enforcement | Comparable hooks/adapters/clients share a consistent convention | HIGH |
| E1 | boundary-enforcement | Acceptance test drives only its entry: the use case, or the walking skeleton's entry point | BLOCKER |
| E2 | boundary-enforcement | Each dependency runs on its infrastructure policy's mechanism | HIGH |
