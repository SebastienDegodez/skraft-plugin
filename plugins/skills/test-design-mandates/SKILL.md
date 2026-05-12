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

## Mandate 4 — Pure Function Extraction Before Fixtures

**Rule:** Before creating complex test fixtures or test factories, identify pure domain functions and extract them. Parameterize only the adapter layer.

**Process:**
1. Identify logic that is a pure function (input → output, no side effects)
2. Extract it as a named domain policy or specification
3. Write a focused domain unit test for it using its public signature
4. The Application acceptance test exercises it indirectly through the use case

**Result:** Fixtures become thin. Complex setup = signal that a pure function should be extracted.

---

## Coverage Matrix

Build this matrix for every story before implementation starts.

| Scenario | Use Case Boundary | Layer | Double Type | Walking Skeleton | Priority |
|---|---|---|---|---|---|
| Happy path — driver eligible | `CheckEligibilityUseCase` | Application | InMemory repository | A | P1 |
| Edge — driver at age limit | `CheckEligibilityUseCase` | Application | InMemory repository | A | P1 |
| Rejection — too many accidents | `CheckEligibilityUseCase` | Application | InMemory repository | A | P2 |
| Complex invariant — age + licence | `EligibilityPolicy` (domain) | Domain | None (pure function) | — | P2 |
| Infrastructure — real persistence | `IEligibilityRepository` | Infrastructure | Real DB (Testcontainers) | — | P3 |

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
