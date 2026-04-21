---
name: outside-in-tdd
description: Use when writing tests from the outside-in, defining behavior before code, or any feature where tests should start from observable business behavior and let internal design emerge. Covers double-loop TDD, 4-phase cycle, boundary-to-boundary testing, iron rule of tests, walking skeleton, and post-GREEN wiring verification.
---

# Outside-In TDD

## Overview

Complete testing methodology for outside-in development.
Start from observable behavior (Gherkin), let design emerge from tests.

**Core rule:** Real domain objects, mocked external boundaries, fast in-memory tests.

## Double-Loop TDD Architecture

- **Outer loop** — Acceptance test (customer view): business requirement. Stays RED while the inner loop cycles.
- **Inner loop** — Unit tests (developer view): technical decomposition. RED → GREEN → REFACTOR in minutes.

Outer drives **WHAT** to build, inner drives **HOW**. Never build a class not required by an active scenario.

## 4-Phase Cycle (per behavior slice)

### 1. PREPARE (owned by this skill)
Identify the **input boundary** (use case / interactor the test enters through) and the **output boundaries** (gateways the test observes: repositories, presenters, external services). Target exactly ONE scenario.

### 2. RED & 3. SYNTHESIZE-GREEN (delegated to `red-synthesize-green`)
The mechanics of RED (wishful thinking, behavior failure), the mandatory architectural gate, and SYNTHESIZE-GREEN (clean one-shot synthesis, NOT dirty-then-refactor) live in the `red-synthesize-green` skill. Follow it exactly.

### 4. COMMIT & VERIFY (owned by this skill)
- Run the **Post-GREEN Wiring Verification** (see below) to detect Fixture Theater.
- Run the `mutation-testing` skill. 100% on business logic; equivalent mutants only accepted survivors.
- Commit using conventional commits (`feat(<domain>): <behavior>`). **Never commit on red.**

## Iron Rule of Tests

NEVER modify a failing test to make it pass — fix the implementation.
If stuck after **3 attempts**: revert to last green, escalate.

A test modified to turn green is theater: it no longer witnesses behavior.

## Boundary-to-Boundary Testing (all test levels)

Every test enters through an **input boundary** (use case / interactor) and asserts at **output boundaries** (gateways) or on the return value. Internal classes (entities, value objects, domain services) are exercised **indirectly** — never instantiated directly in test code.

| Test level | Input boundary | Output observation |
|---|---|---|
| Acceptance | Use case / interactor (application handler) | Gateway mocked (repository, email…) or use-case output DTO |
| Unit (domain function) | The public function signature (its contract IS the boundary) | Return value |
| Integration (gateway adapter) | Gateway contract | Real infrastructure (DB, filesystem, subprocess) |

**Unit tests are NOT "isolated object tests."** They are boundary-to-boundary at a smaller scope. Testing a pure domain function by calling it directly IS boundary-to-boundary — the function's public signature is the contract under test.

## Outside-In Approach

**Prerequisite:** Gherkin scenarios written and approved before this skill applies — for new features, bug fixes, and behavior-changing refactoring.

### Step 1: Map Scenario to Acceptance Test

1. **Map Gherkin to test** — translate scenario to a top-level acceptance-style test
2. **Write the test** — mock only external boundaries, use real domain objects

### Step 2: Let Domain Emerge

**STOP. Do NOT create any domain class, value object, entity, policy, or enum before your first test fails to compile.** Design MUST emerge from red — not from upfront thinking. Even if you already know the domain from context, create nothing until the test's compilation failure confirms what's needed. This includes adding 'just a new variant' of something that already exists: a new vehicle type, a new rejection reason, a new value object field, or a new boundary value — even if similar ones already exist in the codebase. Wait for the test's compilation failure before creating the new type.

Test failures reveal the domain you need. Let the design emerge from failing tests — don't design upfront.
- Domain objects (policies, value objects, services) emerge from what the test demands
- Orchestrators only coordinate — domain logic lives in the domain
- Real domain objects (not mocked)
- No design upfront — the test tells you what to build

### Step 3: Verify with Mutation Testing

Once both acceptance and domain test streams are green, run mutation testing (see `mutation-testing` skill).
100% on business logic. Equivalent mutants are the only accepted survivors.
Applies to ALL changes — features, bug fixes, refactoring, edge cases.

## Acceptance-Style Tests (Sociable — Entry Point Level)

Test the system entry point with real domain objects. Mock only external boundaries. Verify orchestration + observable behavior.

```csharp
[Fact]
public async Task WhenSubmittingValidRequest_ShouldPersistPendingRecord()
{
    var repository = A.Fake<IRequestRepository>();
    var handler = new SubmitRequestHandler(repository);
    var command = new SubmitRequestCommand(
        UserId.CreateNew(),
        new UserInfo(Age: 25, YearsOfExperience: 3),
        new ResourceInfo(Type: "standard", Age: 1));

    await handler.Handle(command);

    A.CallTo(() => repository.AddAsync(
        A<RequestRecord>.That.Matches(r => r.Status == RequestStatus.Pending),
        A<CancellationToken>._)).MustHaveHappenedOnceExactly();
}
```

## Domain Tests (Pure — Rule Level)

Test business **policies**, **rules**, and **domain services** — not data structures directly.  
No mocks — pure state-based assertions.

```csharp
[Fact]
public void WhenUserIsUnderMinimumAge_ShouldBeRejected()
{
    var policy = new EligibilityPolicy();
    var user = new UserInfo(Age: 17, YearsOfExperience: 0);
    var resource = new ResourceInfo(Type: "standard", Age: 1);

    var result = policy.Evaluate(user, resource);

    Assert.False(result.IsEligible);
    Assert.Equal("minimum_age_not_met", result.RejectionReason);
}
```

**What NOT to test directly:**
- Basic constructors (unless complex invariants)
- Simple value objects (covered by usage in policies/orchestrators)
- Simple getters/setters
- DTOs or passive data structures

## When to Write Which

| Signal | Route to |
|---|---|
| Orchestration (load/save/publish) | Use Case test (Acceptance) |
| Business rule inside an Aggregate | Use Case test (Acceptance) |
| Complex invariants, large edge-case matrices, or reused rules | Extract to Policy + Domain test |
| Simple rule | Already covered by primary Use Case test |

**Default:** Start with a Use Case test. Add Domain tests only if extracting a complex rule makes testing simpler.

## Testing Rules

### DO ✅
- Mock only external boundaries (repositories, external services)
- Use real domain objects (entities, policies, services)
- Keep tests fast (< 100ms, no DB, no network)
- Name tests with business language (`WhenCondition_ShouldOutcome`)
- Cover meaningful edge-case combinations

### DON'T ❌
- Don't mock domain objects
- Don't centralize strategic rules in orchestrators
- Don't use integration tooling in unit tests
- Don't test implementation details — test behavior
- Don't couple to a specific assertion library in the skill

## Anti-Patterns

- Strategic rules in orchestrators instead of domain
- Over-mocking that hides real business behavior
- Treating coverage percentage as the quality target
- Duplicating acceptance test coverage with redundant domain tests

## Post-GREEN Wiring Verification (MANDATORY)

After the suite turns green and BEFORE commit:

1. Run `git diff --name-only`. Every production file the behavior required MUST appear in the diff.
2. If only test files changed but tests flipped RED → GREEN → you hit **Fixture Theater**: the test setup implements the feature. BLOCK the commit, go back to GREEN, write the production code.
3. Deletion test: mentally revert the production changes. If tests still pass, the test is exercising fixture state, not behavior.

## Walking Skeleton (first slice of a new feature)

At most ONE walking skeleton per new feature.
- Write ONE acceptance test proving end-to-end wiring with **real adapters** (filesystem, DB, subprocess, HTTP — fake only costly externals like paid APIs).
- Implement the thinnest possible slice: hardcoded values, minimal branching, no error handling beyond what the AT requires.
- Unit tests only if needed to decompose a complex GREEN.
- The AT drives ALL implementation. Subsequent scenarios may find "already implemented, just remove @skip" — that's correct.

## E2E Test Management

Enable ONE acceptance test at a time to avoid commit blocks:
1. Mark all AT except the first with `Skip`.
2. Drive the first scenario through the 4-phase cycle.
3. Commit.
4. Un-skip the next AT. Repeat.

## Mutation Testing (third validation layer)

After both test streams are green, verify test effectiveness with the `mutation-testing` skill.
100% on business logic, equivalent mutants only accepted survivors.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Mocking domain objects in acceptance tests | Use real domain objects, mock only external boundaries |
| Designing domain objects upfront | Let domain emerge from test failures — don't design before testing |
| Treating compilation errors as RED | Stub to compile, then confirm failure on a business assertion |
| Committing when only test files changed | Post-GREEN verification via `git diff --name-only` |
| Modifying a failing test to pass | Iron Rule violation — fix the implementation or revert |
| Skipping Gherkin ("too small") | Even small features benefit from behavior-first thinking |
| Polluting Gherkin with class/endpoint names | Keep scenarios in business language only |
| Testing data structures directly by default | Test policies/rules; data types are covered by usage |
| Skipping mutation testing before merge | Run the mutation-testing skill after tests green |

## Integration with other skills

- `red-synthesize-green` — **mandatory** mechanics of the RED → validation → SYNTHESIZE-GREEN cycle
- `mutation-testing` — run after GREEN, before commit
- `clean-architecture-testing` — test level & doubles policy
- `quality-framework` — quality gates checklist
- `test-refactoring-catalog` — safe test refactorings

## References
- [test-examples.md](references/test-examples.md) - Examples of both Acceptance and Domain tests.
- [testing-strategy.md](references/testing-strategy.md) - Detailed explanation of the testing pyramid and strategy.
- [cqrs-patterns.md](references/cqrs-patterns.md) - CQRS architecture references.

