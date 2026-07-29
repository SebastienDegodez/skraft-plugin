# Layer Assignment Rules

## Principle

Every test targets exactly one Clean Architecture layer. The layer determines the entry point, the double type, and the project location.

---

## Layer Map

```
┌─────────────────────────────────────┐
│  API / Presentation                 │  ← Integration tests (in-process host)
├─────────────────────────────────────┤
│  Application                        │  ← Acceptance tests (use case boundary, InMemory doubles)
├─────────────────────────────────────┤
│  Domain                             │  ← Unit tests (pure functions only, when extracted)
├─────────────────────────────────────┤
│  Infrastructure                     │  ← Integration tests (Testcontainers, real adapters)
└─────────────────────────────────────┘
```

---

## Assignment Table

| What to test | Project | Layer | Double type | Speed |
|---|---|---|---|---|
| Use case / command handler behaviour | `UnitTest` | Application | `InMemory{Interface}` per application interface | Fast (<1s) |
| Domain policy / specification (complex invariant) | `UnitTest` | Domain | None — pure function, call directly | Fast (<1s) |
| Domain entity invariant (rare, complex only) | `UnitTest` | Domain | None — construct and assert | Fast (<1s) |
| Repository adapter (real persistence) | `IntegrationTest` | Infrastructure | Real DB (Testcontainers) | Slow (5–30s) |
| External service adapter | `IntegrationTest` | Infrastructure | Real or WireMock (Testcontainers) | Slow |
| API endpoint + DI wiring | `IntegrationTest` | API | `WebApplicationFactory` or in-process host | Slow |
| Architecture boundaries (layer rules) | `IntegrationTest` | Architecture | Static analysis (NetArchTest, ArchUnit) | Medium |

---

## Application Layer — Rules

**Entry point:** Use case / command handler / query handler
**Double type:** InMemory implementation of each application interface (repository, gateway, event publisher)
**Project:** `tests/{Context}.UnitTest/`
**Speed:** Must run in < 1s total for the full suite. No I/O, no containers, no network.

**What to double:**
- `IEligibilityRepository` → `InMemoryEligibilityRepository`
- `IEmailGateway` → `InMemoryEmailGateway` (captures sent emails for assertion)
- `IEventPublisher` → `InMemoryEventPublisher` (captures published events for assertion)

**What NOT to double:**
- Domain objects — use the real ones
- Domain policies / specifications — use the real ones

---

## Domain Layer — Rules

**When to write a Domain test:** ONLY when a business rule has complex invariants or a large edge-case matrix AND the rule is extracted into a reusable Policy / Specification / Domain Service.

**Entry point:** The public method signature of the policy / specification
**Double type:** None. Pure function — no collaborators to double.
**Project:** `tests/{Context}.UnitTest/`

**Do NOT write Domain tests for:**
- Simple value objects (covered by Application tests)
- Constructors (unless they enforce complex invariants)
- Getters / properties
- DTOs or data containers

---

## Infrastructure Layer — Rules

**Entry point:** The application interface contract
**Double type:** Real infrastructure via Testcontainers
**Project:** `tests/{Context}.IntegrationTest/`

**Test what:** Verify the adapter correctly implements the application interface contract — serialisation, queries, transactions, error handling.

**Do NOT test:** Business rules (that's Application/Domain). Infrastructure tests are adapter correctness tests, not behaviour tests.

---

## API Layer — Rules

**Entry point:** HTTP endpoint (or message consumer entry)
**Double type:** In-process application host (`WebApplicationFactory` in .NET, `@SpringBootTest` in Java)
**Project:** `tests/{Context}.IntegrationTest/`

**Test what:** DI wiring, HTTP status codes, request/response shapes, authentication/authorisation headers.

**Use real:** InMemory repository implementations (same as Application tests) OR real DB (Testcontainers) for full wiring verification.

---

## Architecture Layer — Rules

**Entry point:** Static analysis of compiled code
**Tool:** NetArchTest (.NET), ArchUnit (Java), similar
**Project:** `tests/{Context}.IntegrationTest/`

**Assert:**
- Domain has no outward dependencies (no Infrastructure, no Application)
- Application depends only on Domain (no Infrastructure, no API)
- Infrastructure depends on Application interfaces only (implements them, does not define them)
- API depends on Application (not on Infrastructure or Domain directly)

---

## Common Mistakes

| Mistake | Correct approach |
|---|---|
| Using a real database in `UnitTest` | Use `InMemory{Interface}` — keep unit tests I/O-free |
| Using a mock where an InMemory exists | InMemory > mock for application interfaces. Mocks for external services only. |
| Writing a Domain test for a simple value object | Covered indirectly by Application acceptance test |
| Testing infrastructure logic in Application tests | Write a separate Infrastructure integration test |
| Skipping Architecture tests | Run in CI — they are the only thing that enforces the dependency rule |
