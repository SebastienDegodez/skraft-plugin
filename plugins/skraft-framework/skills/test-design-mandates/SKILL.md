---
name: test-design-mandates
description: Use when planning which tests an approved set of examples actually needs before any code is written — where each test enters and what it observes, whether a rule those examples already cover deserves a test of its own, and whether a scenario reads in business terms and ends in an outcome a user could observe.
---

# Test Design Mandates

## Overview

Five mandatory rules that govern how tests are designed in a Clean Architecture context. Applied after Gherkin scenarios are written, before any implementation starts.

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
- [ ] Does the acceptance test use an `InMemory` implementation, not the real one? → Correct for a targeted scenario; the walking skeleton proves the real wiring

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

## Mandate 5 — Visual/Positional AC Enforcement

**Rule:** Any AC expressed in visual, positional, or style terms (pixel position, full-page width,
background colour, relative alignment between two elements) is closed ONLY by a Playwright E2E test
performing a real measurement (`boundingBox()`, computed colour, computed layout) against a real
browser engine. A jsdom/unit test is NOT a valid closure for this AC type.

**Why:** jsdom has no layout engine (`getBoundingClientRect()` → zeros). Unit assertions proxy via
DOM order/class presence, not rendered proof. Without this mandate, a unit-TDD-only contributor
believes the AC is verified while CSS/mount/z-index regressions go uncaught.

**Enforcement:**
- Tag scenario `@visual` (see `bdd-methodology`).
- Add matrix row: `Layer = E2E`, `Double Type = Real browser (Playwright)`.
- `@visual` w/o `tests/e2e/` spec → coverage gap, block story (G9 check).

---

## Coverage Matrix

Build this matrix for every story before implementation starts. **Any row with `Layer = Domain` MUST carry an `Extraction Reason` code** (see Mandate 4). Without a reason code, the row is not authorized — remove it.

Allowed `Extraction Reason` codes:
- `branch_unreachable_via_AC` — Gate (a)
- `combinatorial_economy` — Gate (b)

| Scenario | Use Case Boundary | Layer | Extraction Reason | Double Type | Priority |
|---|---|---|---|---|---|
| S1 Driver checks eligibility (walking skeleton) | `CheckEligibilityUseCase` | Entry point | — | real entry point, Testcontainers PostgreSQL, Microcks risk API | P1 |
| S2 Driver at age limit obtains eligibility | `CheckEligibilityUseCase` | Application | — | in-memory repository, Microcks risk API | P1 |
| S3 Rejection — too many accidents | `CheckEligibilityUseCase` | Application | — | in-memory repository, Microcks risk API | P2 |
| Combinatorial sweep — premium grid | `PricingPolicy.computePremium` | Domain | `combinatorial_economy` | None (pure function) | P2 |

`Double Type` names what each dependency of the test runs on, from the infrastructure policy below.

**Priority:**
- P1 — walking skeleton, happy path
- P2 — business rule coverage, edge cases
- P3 — infrastructure, integration, error paths

---

## Walking Skeleton

S1 of every story, built first: the thinnest slice that runs the real path, from the entry point
through the use case to the real internal gateways.

- One per story, tagged `@walking-skeleton`, in a back-end component, never a React front end.
- Its acceptance test drives the real entry point (HTTP endpoint, CLI command, webhook received,
  topic consumed), wired by the production composition root; it lives in the integration-test
  place of its component.
- Exemptions, declared under the test plan's `## Scenarios` table as
  `Walking skeleton exemption: <value>`, with no scenario tagged `@walking-skeleton`:

  | Exemption | Holds when |
  |---|---|
  | `library` | a pure library: the component has no entry point |
  | `refactoring` | the story adds no public interface: no endpoint, command, message or public type |
  | `docs-only` | the story changes configuration or documentation only, no source file |

  An exemption the story's changes contradict is a blocker.

## Infrastructure Policy

What each kind of dependency runs on, in a targeted scenario (every scenario but the walking
skeleton) and in the walking skeleton. A component overrides a row with `infrastructure` in
`skraft-config.json`; the brief names each component's effective policy.

| Dependency | Targeted scenario | Walking skeleton |
|---|---|---|
| Entry point: controller, CLI, UI, webhook received, topic consumed | in-process | real |
| Internal gateway: repository, database, cache | in-memory | Testcontainers |
| External gateway: REST, SOAP, GraphQL, gRPC, Kafka, RabbitMQ, MQTT, WebSocket, webhook sent | Microcks | Microcks |
| Clock, randomness | fake | fake |
| React front end → back end, targeted tests | MSW | — |
| React front end → back end, Playwright e2e | Microcks | — |

- The external gateway row, and a React front end's rows to the back end, follow the component's
  `mocking.strategy`: `microcks` by default, `inprocess` for a `react` component; a back-end
  component set to `inprocess` runs its external gateways on an in-process double.
- Microcks runs from Testcontainers (the uber native image), one container per test session,
  started in the test runner's global setup (`mocking-microcks-<stack>`).
- Docker or Podman runs the containers. With neither: the scenario is INDETERMINATE and reported;
  never skipped, never moved to a fake.

## Layer Assignment Rules

| What to test | Test project | Layer | Double type |
|---|---|---|---|
| Use case / command handler | `UnitTest` | Application | InMemory application interfaces |
| Domain policy / specification | `UnitTest` | Domain | None (pure function — call directly) |
| Walking skeleton (S1) | `IntegrationTest` | Entry point → use case → internal gateways | Real entry point, Testcontainers, Microcks |
| Repository adapter | `IntegrationTest` | Infrastructure | Real DB via Testcontainers |
| API controller / endpoint | `IntegrationTest` | API | In-process app host (WebApplicationFactory or equivalent) |
| Architecture boundaries | `IntegrationTest` | Architecture | Static analysis (NetArchTest, ArchUnit, etc.) |
| Visual/positional/style assertion (`@visual`) | `E2E` (Playwright) | Presentation (E2E) | Real browser engine — `boundingBox()`, `getComputedStyle()` |

**Never:**
- Test a domain entity by instantiating it directly in an Application acceptance test
- Use a real database in `UnitTest`
- Use a mock where an InMemory fake exists (InMemory > mock for repositories)

---

## References

- [coverage-matrix-template.md](references/coverage-matrix-template.md) — blank coverage matrix template
- [layer-assignment-rules.md](references/layer-assignment-rules.md) — detailed rules per layer
- [boundary-enforcement-principle.md](references/boundary-enforcement-principle.md) — use case boundary enforcement and TBU prevention
- [walking-skeleton-strategy.md](references/walking-skeleton-strategy.md) — walking skeleton, exemptions and the infrastructure policy, with an example
