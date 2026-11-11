# Coverage Matrix Template

## Instructions

Fill one row per scenario. Complete before implementation starts.
Use this as the input to the implementation plan (outside-in order = P1 → P2 → P3).

---

## Template

| # | Scenario | Feature File | Use Case Boundary | Layer | Double Type | Priority |
|---|---|---|---|---|---|---|
| S1 | {Scenario title} `@walking-skeleton` | `{feature}.feature` | `{UseCaseName}` | Entry point | real entry point, Testcontainers {database}, Microcks {downstream API} | P1 |
| S2 | {Scenario title} | `{feature}.feature` | `{UseCaseName}` | Application | InMemory{Interface}, Microcks {downstream API} | P1 |
| — | {Complex invariant} | — | `{PolicyName}` | Domain | None (pure function) | P2 |

---

## Field Definitions

| Field | Values | Description |
|---|---|---|
| # | `S1`, `S2`, … or `—` | The scenario's row in the test plan's `## Scenarios` table, in build order; `—` for a Domain or Infrastructure test |
| Scenario | Free text | Title from the `.feature` file |
| Feature File | Path | Relative path to the `.feature` file |
| Use Case Boundary | Class name | The Application layer use case / command handler the test enters, or the walking skeleton's entry point reaches |
| Layer | `Entry point`, `Application`, `Domain`, `Infrastructure`, `API` | `Entry point` for the walking skeleton; the Clean Architecture layer the test targets otherwise |
| Double Type | Free text | What each dependency runs on, from the infrastructure policy (test-design-mandates) |
| Priority | `P1`, `P2`, `P3` | Implementation order |

---

## Example — Eligibility Feature

| # | Scenario | Feature File | Use Case Boundary | Layer | Double Type | Priority |
|---|---|---|---|---|---|---|
| S1 | Driver checks eligibility `@walking-skeleton` | `eligibility-check.feature` | `CheckEligibilityUseCase` | Entry point | real HTTP endpoint, Testcontainers PostgreSQL | P1 |
| S2 | Driver at age limit obtains eligibility | `eligibility-check.feature` | `CheckEligibilityUseCase` | Application | `InMemoryEligibilityRepository` | P1 |
| S3 | Driver with 2+ accidents is rejected | `eligibility-check.feature` | `CheckEligibilityUseCase` | Application | `InMemoryEligibilityRepository` | P2 |
| S4 | Driver with suspended licence is rejected | `eligibility-check.feature` | `CheckEligibilityUseCase` | Application | `InMemoryEligibilityRepository` | P2 |
| — | Eligibility invariant: accident count threshold | — | `EligibilityPolicy` | Domain | None (pure function) | P2 |

---

## Totals

| Layer | Count | Priority |
|---|---|---|
| Entry point | 1 | P1 |
| Application | {n} | P1–P2 |
| Domain | {n} | P2 |
| Infrastructure | {n} | P3 |
| API | {n} | P3 |
| **Total** | **{n}** | |
