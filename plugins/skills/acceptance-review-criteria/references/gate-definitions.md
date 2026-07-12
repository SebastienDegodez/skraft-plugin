# Gate Definitions G1–G10

Formal checklist for the `acceptance-designer-reviewer`. One section per lens.

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

**Definition:** Boundary conditions and negative cases from the domain examples in the story are represented as scenarios.

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

## Lens 4: boundary-enforcement-lens

### G7 — Layer Boundary Compliance

**Definition:** Each row in the coverage matrix (`test-plan-{story}.md`) targets an Application layer use case named in `contracts-{story}.md`. No scenario targets an Infrastructure adapter as its primary entry point.

**How to check:**
1. Read `contracts-{story}.md` — extract the list of valid use case boundaries
2. Read `test-plan-{story}.md` — check the "Use Case Boundary" column for each row
3. Verify each boundary name appears in the contracts
4. Flag any row that names an Infrastructure class (repository, adapter) as the entry point instead of a use case

**Severity:** BLOCKER — a test entering through Infrastructure instead of Application skips the business logic.

---

### G8 — Walking Skeleton Coverage

**Definition:** At least one walking skeleton scenario per major feature flow is identified in the test plan (marked "Walking Skeleton ✅" or tagged `@smoke` in the feature file).

**How to check:**
1. Identify the major feature flows (happy path + primary rejection path)
2. Verify the coverage matrix has ≥1 walking skeleton entry per flow
3. Verify the corresponding scenario in the feature file has the `@smoke` tag

**Severity:** HIGH — without a walking skeleton, DELIVER has no scaffolding to start from.

---

### G9 — Visual AC Evidence

**Definition:** Every scenario tagged `@visual` (a visual/positional/style AC per `bdd-methodology`)
has at least one corresponding Playwright E2E spec under `tests/e2e/`, referenced in
`impl-plan-{story}.md`. A unit/jsdom test entry does NOT satisfy this gate.

**How to check:**
1. List all `@visual`-tagged scenarios in the `.feature` files
2. List all `tests/e2e/` entries in `impl-plan-{story}.md`
3. Verify each `@visual` scenario maps to ≥1 E2E spec performing a real measurement
   (`boundingBox()`, `getComputedStyle()` colour, computed layout)
4. Flag any `@visual` scenario whose only planned coverage is a unit/jsdom test — jsdom has no
   real layout engine, so `getBoundingClientRect()` always returns zeros there

**Severity:** HIGH — a `@visual` AC closed only by a unit test is a structural proxy, not proof of
the rendered result; the real visual regression risk is uncaught.

---

### G10 — Comparable Consumer Convention Traceability (issue #115)

**Definition:** When `impl-plan-{story}.md` introduces a client-side consumer (hook/adapter) over a port comparable to one already covered by a sibling `impl-plan-*.md` — same shape class: list query, single-item query, command with optimistic update, ... — the plan names the prior consumer. It then states whether the convention (returned state shape, error handling, invalidation trigger) is the same, or a justified divergence citing the `contracts-{story}.md` divergence note required by `architecture-review-criteria` G16. This is the DISTILL-side companion to DESIGN's G16: G16 catches the divergence in the contract, and G10 catches it again in the implementation plan, one phase before DELIVER would otherwise surface it as a late finding.

**How to check:**
1. List every consumer (hook/adapter) named in `impl-plan-{story}.md` and the port/interface it wraps.
2. Search sibling `impl-plan-*.md` files for a consumer wrapping a comparable port.
3. When found, confirm the current plan names the sibling and declares "same convention" or points at the contract's inline divergence note.
4. No comparable sibling in scope → gate passes vacuously.

**Auto-fail examples:**
- `impl-plan-US-07.md` adds `useDriverHistory()` (a query hook) with no mention of the earlier `useDriverEligibility()` query hook from `impl-plan-US-04.md`, and the two hooks' planned return shapes differ (`{data, isLoading, error}` vs `{status, value, err}`). → G10 HIGH fail.

**Pass examples:**
- `impl-plan-US-07.md` states: "`useDriverHistory` follows the same `{data, isLoading, error}` convention as `useDriverEligibility` (impl-plan-US-04)." → G10 pass.
- `impl-plan-US-09.md` states: "`usePolicyDraft` diverges from `useDriverHistory`'s convention per the divergence note in `contracts-US-09.md`." → G10 pass.

**Severity:** HIGH — undetected here, this class of drift becomes a DELIVER-phase rework finding.

---

## Quick Reference

| Gate | Lens | Check | Severity |
|---|---|---|---|
| G1 | coverage | AC↔scenario bijection | BLOCKER |
| G2 | coverage | Edge cases from domain examples | HIGH |
| G3 | business-alignment | Business vocabulary — no technical identifiers | HIGH |
| G4 | business-alignment | No implementation details in steps | BLOCKER |
| G5 | testability | Unambiguous steps | HIGH |
| G6 | testability | Impl plan covers all scenarios | HIGH |
| G7 | boundary-enforcement | Coverage matrix → valid use case boundary | BLOCKER |
| G8 | boundary-enforcement | ≥1 walking skeleton per flow | HIGH |
| G9 | boundary-enforcement | `@visual` scenarios ↔ Playwright E2E spec bijection | HIGH |
| G10 | boundary-enforcement | Comparable consumer convention traceability across impl-plans | HIGH |
