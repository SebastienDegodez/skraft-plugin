# Boundary Enforcement Principle

## Definition

In Clean Architecture, every test enters through a **use case boundary** — the Application layer's entry point — and asserts at the next visible boundary in the direction of the architecture.

No test ever targets an internal class directly unless that class IS the boundary (e.g., a domain Policy extracted as a pure function).

---

## The Three Boundaries

```
[Test]
  │
  ▼
[Use Case / Command Handler]   ← Application layer entry point (use case boundary)
  │
  ▼
[Domain]                        ← Internal — not targeted directly from Application tests
  │
  ▼
[Application Interface]         ← Repository / Gateway contract (output boundary)
  │
  ▼
[Infrastructure Adapter]        ← Real or faked implementation
```

**Inputs to a test:** use case boundary (left side of the diagram)
**Assertions from a test:** use case return value OR application interface (right side)

---

## What Is a Use Case Boundary?

The use case boundary is the **public interface of the Application layer** — typically:
- A command handler: `Handle(CheckEligibilityCommand command)`
- A query handler: `Handle(GetEligibilityResultQuery query)`
- A use case class: `eligibilityUseCase.Execute(request)`

The boundary is named in the `contracts-{story}.md` artefact from DESIGN.

---

## TBU — Tested But Unwired

A TBU defect occurs when:
1. A unit passes in isolation ✅
2. The same unit is **not wired** through the real composition root ❌
3. The integration test never exercises the wiring

Result: production code that is tested but never reached by real traffic.

### TBU Detection Checklist (run after GREEN)

- [ ] Is the use case registered in the DI container?
- [ ] Does an integration test (API layer or in-process host) exercise the endpoint that calls this use case?
- [ ] If the acceptance test uses an `InMemory` double, does a separate infrastructure test verify the real adapter?

### TBU Prevention

| Level | Action |
|---|---|
| Application (unit) | Test enters through use case. Double the application interfaces. |
| Infrastructure | Test the real adapter separately with Testcontainers. |
| API (integration) | Test the endpoint with a real in-process app host. Verifies DI wiring. |
| Architecture | Assert that use case is registered (ArchUnit / NetArchTest). |

---

## Correct vs Incorrect Test Entry Points

### ✅ Correct — Application boundary

```csharp
// Enters through use case boundary
var result = await _useCase.Handle(new CheckEligibilityCommand(driverId));

// Asserts at the return value (output boundary)
result.IsEligible.Should().BeTrue();
```

### ✅ Correct — Domain boundary (extracted pure function)

```csharp
// Enters through the policy's public signature
var result = EligibilityPolicy.Evaluate(driverProfile);

// Asserts at the return value
result.Should().Be(EligibilityDecision.Eligible);
```

### ❌ Incorrect — Internal domain object tested directly from Application test

```csharp
// Wrong: bypasses use case, tests internals
var driver = new Driver(id, licenceNumber, accidents: 0);
driver.IsEligible().Should().BeTrue();
```

### ❌ Incorrect — Infrastructure adapter used as entry point in unit test

```csharp
// Wrong: tests persistence, not behaviour
var repository = new EligibilityRepository(dbContext);
var result = await repository.FindByDriverId(driverId);
result.Should().NotBeNull();
```

---

## Application Interface (Output Boundary)

The application interface is the **contract** defined in the Application layer that Infrastructure implements. In Clean Architecture:

- Lives in: `Application/Interfaces/IEligibilityRepository.cs`
- Implemented in: `Infrastructure/Persistence/EligibilityRepository.cs`
- Doubled in tests by: `InMemoryEligibilityRepository` (Application unit tests) or Testcontainers adapter (Infrastructure tests)

**In the coverage matrix:** the "Double Type" column names the application interface being doubled.

---

## Summary

| Test scope | Entry point | Assertion point |
|---|---|---|
| Application acceptance | Use case (`Handle(command)`) | Return value or application interface |
| Domain unit | Policy / Specification public method | Return value |
| Infrastructure integration | Application interface contract | Real DB state (Testcontainers) |
| API integration | HTTP endpoint | HTTP response + application state |
