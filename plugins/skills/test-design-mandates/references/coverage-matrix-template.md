# Coverage Matrix Template

## Instructions

Fill one row per scenario. Complete before implementation starts.
Use this as the input to the implementation plan (outside-in order = P1 → P2 → P3).

---

## Template

| # | Scenario | Feature File | Use Case Boundary | Layer | Double Type | Walking Skeleton | Strategy | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | {Scenario title} | `{feature}.feature` | `{UseCaseName}` | Application | InMemory{Interface} | ✅ | A | P1 |
| 2 | {Scenario title} | `{feature}.feature` | `{UseCaseName}` | Application | InMemory{Interface} | | A | P1 |
| 3 | {Complex invariant} | — | `{PolicyName}` | Domain | None (pure function) | | — | P2 |
| 4 | {Adapter test} | — | `{IRepositoryName}` | Infrastructure | Testcontainers | | C | P3 |

---

## Field Definitions

| Field | Values | Description |
|---|---|---|
| Scenario | Free text | Title from the `.feature` file |
| Feature File | Path | Relative path to the `.feature` file |
| Use Case Boundary | Class name | The Application layer use case / command handler entered by this test |
| Layer | `Application`, `Domain`, `Infrastructure`, `API` | Clean Architecture layer this test targets |
| Double Type | `InMemory{Interface}`, `None`, `Testcontainers`, `Fake{External}`, `WebApplicationFactory` | The test double strategy |
| Walking Skeleton | `✅` or blank | Whether this scenario is a walking skeleton (@smoke) |
| Strategy | `A`, `B`, `C`, `D`, or `—` | Walking Skeleton strategy (see test-design-mandates skill) |
| Priority | `P1`, `P2`, `P3` | Implementation order |

---

## Example — Eligibility Feature

| # | Scenario | Feature File | Use Case Boundary | Layer | Double Type | Walking Skeleton | Strategy | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | Driver with clean record obtains eligibility | `eligibility-check.feature` | `CheckEligibilityUseCase` | Application | `InMemoryEligibilityRepository` | ✅ | A | P1 |
| 2 | Driver at age limit obtains eligibility | `eligibility-check.feature` | `CheckEligibilityUseCase` | Application | `InMemoryEligibilityRepository` | | A | P1 |
| 3 | Driver with 2+ accidents is rejected | `eligibility-check.feature` | `CheckEligibilityUseCase` | Application | `InMemoryEligibilityRepository` | | A | P2 |
| 4 | Driver with suspended licence is rejected | `eligibility-check.feature` | `CheckEligibilityUseCase` | Application | `InMemoryEligibilityRepository` | | A | P2 |
| 5 | Eligibility invariant: accident count threshold | — | `EligibilityPolicy` | Domain | None (pure function) | | — | P2 |
| 6 | Eligibility result persisted correctly | — | `IEligibilityRepository` | Infrastructure | Testcontainers (PostgreSQL) | | C | P3 |

---

## Totals

| Layer | Count | Priority |
|---|---|---|
| Application | {n} | P1–P2 |
| Domain | {n} | P2 |
| Infrastructure | {n} | P3 |
| API | {n} | P3 |
| **Total** | **{n}** | |
