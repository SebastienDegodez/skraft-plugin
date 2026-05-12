# Walking Skeleton Strategy

## Definition

A walking skeleton is the **thinnest possible slice** that exercises the full path from use case to output boundary. It proves the wiring works end-to-end before behaviour detail is added.

A walking skeleton is NOT a feature test. It is the scaffolding that validates the pipeline exists.

---

## The 4 Strategies

### Strategy A — Full InMemory

**When:** The feature has no external dependencies. All behaviour is internal.

**Setup:**
- Use case boundary: real use case
- Application interfaces: InMemory implementations (no I/O)
- Domain: real domain objects
- No containers, no network, no file system

**Test speed:** < 100ms
**Tag:** `@smoke`

**Example:**
```csharp
// InMemoryEligibilityRepository seeded with known data
var repo = new InMemoryEligibilityRepository();
var useCase = new CheckEligibilityUseCase(repo, new EligibilityPolicy());
var result = await useCase.Handle(new CheckEligibilityCommand(driverId));
result.IsEligible.Should().BeTrue();
```

---

### Strategy B — Real Local + Fake Costly External

**When:** The feature needs local persistence (DB) but calls an expensive external service (payment gateway, SMS, AI API, third-party risk engine).

**Setup:**
- Application interfaces for costly externals: Fake/Stub returning controlled responses
- Local storage: Testcontainers (PostgreSQL, Redis, etc.)
- Use case: real

**Test speed:** 5–30s (container startup)
**Tag:** `@smoke @integration`

**Example:**
```csharp
// Real PostgreSQL (Testcontainers) + fake external risk scoring service
var riskService = new FakeRiskScoringService(score: 720); // controlled response
var repo = new PostgreSqlEligibilityRepository(testDb.ConnectionString);
var useCase = new CheckEligibilityUseCase(repo, riskService, new EligibilityPolicy());
var result = await useCase.Handle(new CheckEligibilityCommand(driverId));
result.IsEligible.Should().BeTrue();
```

---

### Strategy C — Real Local

**When:** The feature integrates with controllable local infrastructure only (database, cache, message broker). No expensive external calls.

**Setup:**
- All infrastructure: Testcontainers
- Use case: real
- No fakes — everything is real

**Test speed:** 5–30s
**Tag:** `@smoke @integration`

**Example:**
```csharp
// Real PostgreSQL + real Redis via Testcontainers
var repo = new PostgreSqlEligibilityRepository(testDb.ConnectionString);
var cache = new RedisEligibilityCache(testRedis.ConnectionString);
var useCase = new CheckEligibilityUseCase(repo, cache, new EligibilityPolicy());
var result = await useCase.Handle(new CheckEligibilityCommand(driverId));
result.IsEligible.Should().BeTrue();
```

---

### Strategy D — Configurable

**When:** The test must run in both unit mode (CI fast pass) and integration mode (CI full pass). Environment or feature flag switches the double.

**Setup:**
- Factory or DI configuration selects: InMemory (unit) or Testcontainers (integration)
- Controlled by environment variable or test fixture flag

**Test speed:** Variable
**Tag:** `@smoke` (unit mode) + `@smoke @integration` (integration mode)

**Example:**
```csharp
// Configurable via environment variable
var repository = Environment.GetEnvironmentVariable("TEST_MODE") == "integration"
    ? new PostgreSqlEligibilityRepository(testDb.ConnectionString)
    : (IEligibilityRepository) new InMemoryEligibilityRepository();
```

---

## Decision Tree

```
Does the feature write to or read from persistent storage?
│
├── NO → Strategy A (Full InMemory)
│
└── YES
    │
    Does it call an expensive external service?
    (payment, SMS, AI, third-party risk engine)
    │
    ├── YES → Strategy B (Real local DB + Fake costly external)
    │
    └── NO
        │
        Is the storage local and controllable?
        (your own DB, cache, broker — not a SaaS)
        │
        ├── YES → Strategy C (Real local with Testcontainers)
        │
        └── NO → Strategy D (Configurable)
```

---

## Sizing

| Metric | Guideline |
|---|---|
| Walking skeletons per feature | 2–5 (one per major flow variant) |
| Focused scenarios per feature | 15–20 (detailed behaviour coverage) |
| @smoke scenarios | ≤3 per feature (fastest confidence signal) |

**Walking skeleton ≠ full feature test.** Once the skeleton passes, add focused scenarios for each business rule, boundary condition, and error path.

---

## Walking Skeleton Checklist

Before marking a walking skeleton complete:

- [ ] The test enters through the use case boundary (not a shortcut)
- [ ] The test asserts at the output boundary (return value or application interface)
- [ ] All collaborators are explicitly configured (no magic DI in unit tests)
- [ ] The skeleton tag is applied (`@smoke`)
- [ ] The coverage matrix row is marked "Walking Skeleton ✅"

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Walking skeleton that tests nothing | Just verifies the test runs without asserting an outcome |
| Walking skeleton skipping the use case | Calls repository directly — not end-to-end |
| Too many walking skeletons | >5 per feature = the skeleton has become the test suite |
| Walking skeleton without a coverage matrix entry | Not tracked, not reviewed |
