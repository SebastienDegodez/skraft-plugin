# Coverage lens — examples

Worked examples of the gates of `acceptance-review-coverage`, gate by gate.

## G1 — AC–Scenario Bijection

**Definition:** Every acceptance criterion in `ac-draft-{story}.md` has its own scenario in the `.feature` files, no scenario holds two criteria, no scenario lacks a source criterion; every value of a scenario equals its criterion's.

**How to check:**
1. Extract all ACs from `ac-draft-{story}.md` — label them AC-01, AC-02, …
2. Extract all scenarios from `*.feature` files
3. Build the trace matrix:
   ```
   AC-01 → Scenario "Driver with clean record obtains eligibility" ✅
   AC-02 → Scenario "Driver at age limit obtains eligibility" ✅
   AC-03 → [NO SCENARIO] ❌ BLOCKER
   AC-04, AC-05 → Scenario "Driver renews a licence" ❌ BLOCKER (two criteria, one scenario)
   [NO AC] → Scenario "Driver pays a late fee" ❌ BLOCKER
   ```
4. Flag: missing coverage (AC with no scenario of its own), merged criteria (one scenario holding two), orphan scenarios (no AC) and values that differ from their AC's

**Severity:** BLOCKER
**Common cause:** Designer forgot to translate an AC, or a scenario was written without an AC source.

---

## G2 — Edge Case Representation

**Definition:** Boundary conditions and negative cases from the domain examples in the story are represented, each as an `Examples` row of the scenario of the criterion it belongs to, or as the scenario of a criterion of its own. Only the story and its acceptance criteria give examples: a Gherkin mapping, an example or a variant a DESIGN document writes (event model, tactical design) is none, and a variant an earlier rule of the story already decides (a precedence) adds no boundary.

**How to check:**
1. Read the domain examples section of the story
2. Identify boundary values (min age, max accidents, threshold dates, etc.)
3. Verify each boundary condition is an `Examples` row of its criterion's scenario, or a criterion's own scenario
4. Verify at least one rejection/error scenario per business rule

**Severity:** HIGH
**Common cause:** Designer wrote happy path only, missed the boundary cases in domain examples.
