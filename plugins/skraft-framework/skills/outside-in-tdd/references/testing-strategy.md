# Testing Strategy: Sociable Tests for DDD

## Philosophy

This testing strategy follows Martin Fowler's **sociable testing** approach:

- **Sociable tests** use real collaborators from within the same layer or below
- **Output gateways** are replaced by simple hand-written InMemory doubles (no mocking library in Domain, Application or `<Context>.UnitTest`); mocking/contract tools for external systems live only in `<Context>.IntegrationTest`

## What to Test Where

### Application Layer Tests (primary focus)
- Test use cases (Command/Query handlers) with real Domain objects
- Replace Infrastructure dependencies (repositories, external services) with InMemory doubles
- Validate the entire business flow including Domain logic
- Located in: `tests/<Context>.UnitTest/<Feature>/` (layout per `clean-architecture-testing`)

### Domain Layer Tests (rare: only when `test-design-mandates` Mandate 4 opens a gate)
- Test **domain services** (policies, specifications, calculators) in isolation
- Aggregates, value objects, and entities are **not** tested directly — they are exercised through the domain service or through Acceptance tests
- Most Domain logic is already covered through Acceptance tests
- Located in: `tests/<Context>.UnitTest/<Feature>/`, same project as the Application tests

### Integration Tests (full stack)
- Test API endpoints with real infrastructure (Testcontainers)
- Located in: `tests/<Context>.IntegrationTest/` (Infrastructure, API and Architecture tests)

## When Application vs Domain Tests

See **When to Write Which** in `SKILL.md`. That table is the single copy, and it answers both
questions this section used to answer only half of: which layer the code lands in, and which test
covers it. A routing table that names only a test kind is what lets a policy stay in the handler.

## Decision Framework: 3 Questions

Ask yourself these 3 questions to route a test to the right layer:

**1. Am I testing a pure business rule?**
→ **Use Case (Acceptance) test** by default: the rule is covered through the use case. A **Domain test** (isolated, state-based assertions on a **domain service**, e.g. `EligibilityPolicy`) exists only when `test-design-mandates` Mandate 4 opens a gate and the test-plan records the Extraction Reason. Aggregates, VOs, and entities are not tested directly.

**2. Am I testing a use case?**
→ **Sociable Acceptance test**
- Real Domain objects
- External ports (repositories, services) replaced by hand-written InMemory doubles

**3. Am I testing a technical integration?**
→ **Integration test** — full stack, real infrastructure (Testcontainers, HTTP client).

## Testing Rules

### DO ✅
- Test handlers with real Domain objects (aggregates, VOs, services)
- Replace only the Infrastructure layer (repositories, external services), with InMemory doubles
- Keep tests fast (no Testcontainers, no DB, no network, < 100ms)
- Name tests with business language (`WhenDoingSomething_ShouldExpectedBehavior`)
- Verify Domain state changes through observable outcomes

### DON'T ❌
- Don't mock or fake Domain objects, and don't use a mocking library in the core (`A.Fake<Order>()` — never)
- Don't centralize strategic rules in handlers — keep them in Domain
- Don't use Testcontainers in unit tests — save for Integration
- Don't test implementation details — test behavior

## Benefits

1. **Fast execution**: No external dependencies in unit tests
2. **Real behavior**: Tests verify actual Domain logic, not mocks
3. **Refactoring safety**: Tests break only when behavior changes
4. **Clear intent**: Tests show how Domain and Application work together
5. **Maintainability**: No mocks = less maintenance overhead
