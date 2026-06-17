---
name: test-design-mandates
description: Use when designing test coverage matrices, assigning tests to Clean Architecture layers, planning the outside-in implementation order, or applying the Walking Skeleton strategy. Ensures every behaviour is tested at the right level with no redundancy. Load after writing Gherkin scenarios.
---

# Test Design Mandates

## Overview

Four mandatory rules that govern how tests are designed in a Clean Architecture context. Applied after Gherkin scenarios are written, before any implementation starts.

**Core principle:** Tests enter through a use case boundary and assert at the next visible boundary. Never test internal classes directly.

---

## Mandate 1 — Layer Boundary Enforcement

**Rule:** Every AC names its **use case boundary** — the Application layer entry point the test enters through. All tests at the Application layer enter through that use case. Assertions are made via application interfaces (repositories, gateways) or the use case return value. Never instantiate an internal domain class directly in a test that is exercising Application behaviour.

**Why:** Prevents TBU (Tested But Unwired) defects — production code that works in isolation but is never called through the real composition root.

**Application:**
- Acceptance test → enters through `{UseCaseName}` use case / command handler
- Domain unit test (when extracted) → enters through the domain function or policy's public signature
- Infrastructure test → enters through the application interface (repository contract)

**TBU detection checklist (run after GREEN):**
- [ ] Can I delete the production implementation and still have the test pass? → Wired? YES = TBU
- [ ] Is the use case wired in the DI container? → Not tested if no integration test exercises the wiring
- [ ] Does the acceptance test use an `InMemory` implementation, not the real one? → Correct for unit pass; add integration test for real wiring

---

## Mandate 2 — Business Language Abstraction

**Rule:** Maintain 3 strictly separated layers of abstraction in test code. No technical vocabulary leaks upward.

| Layer | Location | Language | Example |
|---|---|---|---|
| **Gherkin** | `.feature` files | Pure business | `Given a driver with a clean record` |
| **Step methods** | Step definition classes | Bridge — calls use case | `eligibilityUseCase.handle(command)` |
| **Business services / Use cases** | Test helpers or application | Technical | `new CheckEligibilityCommand(driverId, ...)` |

**Violations:**
- ❌ Gherkin step: `Given the EligibilityApplicationService is instantiated`
- ❌ Step method builds DTOs with raw primitives without a factory method
- ✅ Step method: `var command = EligibilityCommandBuilder.forDriverWith(cleanRecord);`

**Implementation:**
- Create `{Feature}Builder` / `{Feature}Mother` test factories in step definition layer
- Step methods delegate to builders — never hardcode IDs, dates, or primitives in Gherkin or steps

---

## Mandate 3 — User Journey Completeness

**Rule:** Tests validate **complete user journeys**, not isolated operations. A scenario must include setup, action, and observable outcome — all three, always.

**Structure:**
```
Setup (Given)   → state of the system before the action
Action (When)   → ONE business trigger
Outcome (Then)  → observable business result (not internal state)
```

**Incomplete journey anti-patterns:**
- ❌ Only testing `Given` + `When` with no assertion → setup test, not a behaviour test
- ❌ `Then` asserting internal state (e.g., field value on domain object) → not observable by user
- ❌ Missing setup → test depends on implicit shared state (test ordering bug)

**Journey completeness check:** Ask "could a user observe this outcome in the real system?" If yes, the Then is correctly observable.

---

## Mandate 4 — Domain Test Extraction (Gated)

**Default rule:** Acceptance tests do the work. **No domain unit test by default**, even when a pure function is extracted by refactoring. A regression that breaks 2+ AC together is the correct business signal — the duplicated red is the proof that the rule traverses multiple user journeys, not a redundancy to eliminate.

**Anti-pattern this rule prevents — DOUBLE-COVERAGE:** A pure function whose every behavioral branch is already reached by planned acceptance scenarios MUST NOT receive a dedicated domain test. Two suites asserting the same behavior drift together on every rule change and add zero failure-discrimination value.

**A domain unit test is REQUIRED if and only if one of the two gates opens:**

- **Gate (a) — Branch unreachable via AC.** A behavioral branch of the function exists but no realistic acceptance scenario can trigger it (defensive case, exhaustive-enum fallback, technical guard). The AC physically CANNOT observe it.
- **Gate (b) — Combinatorial economy.** Covering the input grid through AC alone would explode the Gherkin scenario count (indicative threshold: > 10–15 scenarios for a single rule). Keep 3–5 representative business AC (happy path + key rejections + critical boundaries) and delegate combinatorial sweep to a parameterized domain test (`[Theory]`, `@ParameterizedTest`, table-driven).

**No gate opens → REJECT extraction.** Record in the test plan: `M4 negative — saturated by AC`.

**Process for each candidate pure function P:**
1. Enumerate `B(P)` — distinct behavioral branches of P.
2. Enumerate `A(P)` — branches reached by planned AC scenarios.
3. If `A(P) == B(P)` AND combinatorial size ≤ 10–15 → **forbidden to extract**, log `M4 negative — saturated by AC`.
4. Otherwise, name which gate opens and record the corresponding `Extraction Reason` code.

**Counter-example (STORY-41 contrefactual):** `Vehicle.MinimumAge()` has `B(P) = {21, 16}`. Five planned AC reach both outputs, so `A(P) == B(P)`. Combinatorial size = 3 cases, well under threshold. **Both gates closed → no domain test.** The 5 AC do all the work; if `MinimumAge()` breaks, all 5 turn red — that is the intended business signal.

---

## Coverage Matrix

Build this matrix for every story before implementation starts. **Any row with `Layer = Domain` MUST carry an `Extraction Reason` code** (see Mandate 4). Without a reason code, the row is not authorized — remove it.

Allowed `Extraction Reason` codes:
- `branch_unreachable_via_AC` — Gate (a)
- `combinatorial_economy` — Gate (b)

| Scenario | Use Case Boundary | Layer | Extraction Reason | Double Type | Walking Skeleton | Priority |
|---|---|---|---|---|---|---|
| Happy path — driver eligible | `CheckEligibilityUseCase` | Application | — | InMemory repository | A | P1 |
| Edge — driver at age limit | `CheckEligibilityUseCase` | Application | — | InMemory repository | A | P1 |
| Rejection — too many accidents | `CheckEligibilityUseCase` | Application | — | InMemory repository | A | P2 |
| Combinatorial sweep — premium grid | `PricingPolicy.computePremium` | Domain | `combinatorial_economy` | None (pure function) | — | P2 |
| Infrastructure — real persistence | `IEligibilityRepository` | Infrastructure | — | Real DB (Testcontainers) | — | P3 |

**Priority:**
- P1 — happy path, walking skeleton basis
- P2 — business rule coverage, edge cases
- P3 — infrastructure, integration, error paths

---

## Walking Skeleton Strategy

A walking skeleton is the thinnest possible slice that exercises the full path from use case to output — enough to prove the wiring works.

### 4 Strategies

| Strategy | When to use | Setup |
|---|---|---|
| **A — Full InMemory** | Feature is purely internal (no external services) | InMemory repository, no real I/O |
| **B — Real local + Fake costly** | Feature needs a local DB but avoids expensive external calls | Testcontainers DB + fake/stub for external service |
| **C — Real local** | Feature integrates with controllable local infrastructure | Testcontainers for all local dependencies |
| **D — Configurable** | Feature must run in both unit and integration mode | Strategy/feature flag selects double type at test startup |

### Decision Tree

```
Does the feature write to or read from persistent storage?
├── NO  → Strategy A (full InMemory)
└── YES → Does it call an expensive external service (payment, SMS, AI)?
          ├── YES → Strategy B (real local DB + fake external)
          └── NO  → Is the storage local and controllable?
                    ├── YES → Strategy C (real local with Testcontainers)
                    └── NO  → Strategy D (configurable)
```

### Walking Skeleton Sizing

- **2–5 walking skeletons per feature** (one per major flow variant)
- **15–20 focused scenarios total** per feature (detailed behaviour coverage)
- Tag walking skeleton scenarios with `@smoke` for fast validation

---

## Layer Assignment Rules

| What to test | Test project | Layer | Double type |
|---|---|---|---|
| Use case / command handler | `UnitTest` | Application | InMemory application interfaces |
| Domain policy / specification | `UnitTest` | Domain | None (pure function — call directly) |
| Repository adapter | `IntegrationTest` | Infrastructure | Real DB via Testcontainers |
| API controller / endpoint | `IntegrationTest` | API | In-process app host (WebApplicationFactory or equivalent) |
| Architecture boundaries | `IntegrationTest` | Architecture | Static analysis (NetArchTest, ArchUnit, etc.) |

**Never:**
- Test a domain entity by instantiating it directly in an Application acceptance test
- Use a real database in `UnitTest`
- Use a mock where an InMemory fake exists (InMemory > mock for repositories)

---

## References

- [coverage-matrix-template.md](references/coverage-matrix-template.md) — blank coverage matrix template
- [layer-assignment-rules.md](references/layer-assignment-rules.md) — detailed rules per layer
- [boundary-enforcement-principle.md](references/boundary-enforcement-principle.md) — use case boundary enforcement and TBU prevention
- [walking-skeleton-strategy.md](references/walking-skeleton-strategy.md) — 4 strategies with decision tree and examples
