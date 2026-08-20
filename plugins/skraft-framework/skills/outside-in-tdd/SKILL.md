---
name: outside-in-tdd
description: Use when an approved business example has to become working software — deciding what to deliver now and what to defer, what counts as done for the first route through a feature, and in what order to take the remaining examples and any wider integration work. Also use before writing implementation code for a behaviour whose expected result is already approved, when judging whether a failing suite is trustworthy evidence that a behavior is missing, and when handing a write-the-test-then-implement slice to a worker or subagent. Also use when the implementation contradicts an approved expectation, or when the suite is green but the running behavior is not.
---

# Outside-In TDD

## Entry Gate — read before anything else

This skill turns an **approved** expected result into working software. It never decides what that
expected result should be.

Before entering any phase below, confirm the behaviour has an approved observable outcome — a
Gherkin scenario, a worked example, an agreed expected value. When it does not:

- **Stop.** No test, no implementation, no provisional choice of outcome on the business's behalf.
- Name the decision that is still open, and ask for one observable example that closes it.
- `bdd-methodology` owns that conversation. Re-enter here once it has an answer.

An unapproved outcome driven out through a clean cycle still yields a suite that proves only that
the code matches a guess. The same prerequisite is restated under **Outside-In Approach** below.

## Precedence

This skill owns **SEQUENCE** — what must be true before the next phase may start, and what counts as
evidence that it is true. A loading agent descriptor owns **MODE** — interactivity, thresholds, and
what its dispatch payload carries.

Where the two disagree, **the descriptor wins on mode and this skill wins on sequence.** A rule here
that names a mode (pause and ask, a specific mutation percentage, how big one increment is) is
describing the common case, not overriding the descriptor that loads it.

## Overview

Complete testing methodology for outside-in development.
Start from observable behavior (Gherkin), let design emerge from tests.

The inner cycle is **2 steps, not 3**:

- **Traditional (3 steps):** RED → green (dirty) → Refactor
- **Here (2 steps):** RED (behavior failure) → SYNTHESIZE GREEN (clean synthesis)

**Core rule:** Real domain objects, mocked external boundaries, fast in-memory tests.

**Hard rule:** No implementation code before RED is a clean behavior failure.

## Double-Loop TDD Architecture

- **Outer loop** — Acceptance test (customer view): business requirement. Stays RED while the inner loop cycles.
- **Inner loop** — Unit tests (developer view): technical decomposition. RED → GREEN → REFACTOR in minutes.

Outer drives **WHAT** to build, inner drives **HOW**. Never build a class not required by an active scenario.

## 4-Phase Cycle (per behavior slice)

### 1. PREPARE

Identify the **input boundary** (use case / interactor the test enters through) and the **output boundaries** (gateways the test observes: repositories, presenters, external services). Target exactly ONE scenario.

### 2. RED (Behavior Failure Only)

Write the failing test. Run it.

- Compilation errors = **wishful thinking phase** → implement stubs/empty returns to compile, rerun
- Assertion/behavior failure = **RED** ✓ → proceed to the architectural checkpoint
- Never treat compilation errors as RED

**Programming by Wishful Thinking:** When your test won't compile, you're discovering the API you need. Stub just enough to compile, then confirm the test fails on behavior.

#### Placeholder assertions are NOT wishful thinking

`assert.fail()`, `Assert.Fail()`, `Assert.True(false)`, `Assert.False(true)`, `fail()`, `assert False`, `throw new NotImplementedException()`, `throw new Error('not implemented')` — any assertion designed to fail unconditionally — makes the test compile and fail, but asserts **nothing** about the API under test. It produces false RED evidence, in every language.

A proper wishful-thinking test calls the function you WISH existed and lets the build or runtime surface the failure naturally:

1. Reference the missing type/function → compile error or missing-symbol/module error
2. Stub just enough to compile (empty return / minimal implementation) → test fails on the real business assertion

NEVER insert a placeholder assertion. This list is the single reference for the whole framework — `craft-discipline` C5 enforces it at commit time.

### Between RED and GREEN: Architectural Guidance (MANDATORY)

**Hard rule:** This checkpoint is not skippable. Do not proceed to SYNTHESIZE GREEN without completing it.

**The invariant:** the failing test is inspected — by someone other than whoever is about to write
the implementation — before any production code exists. What is inspected is the RED output itself,
never a promise that it exists.

**Who inspects, and how, is MODE.** In an interactive session the developer reviews and explicitly
validates the test before you continue. Under an autonomous dispatch the inspection belongs to the
orchestrator and happens between two separate dispatches (see *When Orchestrating Subagents*): a
subagent instructed to act autonomously does not satisfy this by asking anyway — it reports the
failing test and stops there. Either way, no implementation is written until the inspection happened.

Orient design before synthesis:

- Which pattern? (specification, factory, builder)
- Which layer owns the logic?
- Immutability, return values vs mutations?

### 3. SYNTHESIZE-GREEN (Clean Synthesis)

Implement the smallest slice the failing test demands — and implement it clean the first time.

**"Clean synthesis" constrains the QUALITY of the first draft, not its SCOPE.** Complete means
complete for THIS test: no speculative branches, no unrequested error handling, no abstraction the
test does not force. Gold-plating here contradicts the Walking Skeleton rule and the anti-pattern
list below, and it is what the descriptor means by "minimal production code".

- Follows all architectural rules and coding standards
- No dirty-then-refactor — synthesize properly from the start
- Idiomatic code, domain semantics, SOLID principles
- If the test was misunderstood → revise the test, restart from RED

**No iteration after SYNTHESIZE GREEN** unless RED was wrong or architectural guidance changed.

### 4. COMMIT & VERIFY

- Run the **Post-GREEN Wiring Verification** (see below) to detect Fixture Theater.
- Run the **mutation gate** (see below).
- Commit using conventional commits (`feat(<domain>): <behavior>`). **Never commit on red.**

## Quick Reference

| Phase | What | Success Criteria |
|---|---|---|
| **PREPARE** | Name the input and output boundaries, pick ONE scenario | The scenario under test is unambiguous |
| **RED** | Write test, stub until it compiles, run | Test fails on **behavior** (assertion), not compilation |
| **Guidance** (**MANDATORY**) | Orient the architectural approach + **the failing test is inspected** | Design direction clear, the RED output has been seen by someone other than its implementer |
| **SYNTHESIZE GREEN** | Synthesize the smallest slice the test demands, clean the first time | Tests green, architecture respected, nothing built the test did not force |
| **COMMIT & VERIFY** | Wiring verification, mutation gate, commit | Production files in the diff, mutation gate run and its survivors resolved, never on red |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Compilation error IS red" | No. Compilation = wishful thinking. RED = behavior failure. |
| "I'll write dirty code then refactor" | That's 3-step TDD. SYNTHESIZE GREEN produces clean code. |
| "I can skip RED, I know it'll fail" | Run it. RED proves your test catches real failures. |
| "The placeholder fails, so it's RED" | No. `assert.fail()` / `Assert.Fail()` / `Assert.True(false)` assert nothing about the API. Write the real call; let the missing symbol cause a compile error, then stub past it. |

## Red Flags — STOP and Restart

- Entering the cycle at all while the expected result is still an open business decision
- Implementation code before RED is a behavior failure
- Compilation errors treated as RED
- Placeholder assertion in the test body — tests no behavior, produces false RED evidence
- Skipping RED entirely
- Skipping the architectural guidance checkpoint
- Proceeding to SYNTHESIZE GREEN before the failing test was inspected
- Refining code after SYNTHESIZE GREEN instead of revising RED

**Any of these mean:** Delete the code, start over with a proper RED.

## When Orchestrating Subagents (MANDATORY)

If you dispatch subagents to carry out a TDD slice — whatever the orchestration
mechanism:

**NEVER put RED and SYNTHESIZE GREEN in the same subagent prompt.**

Split every TDD task into **two separate dispatches**:

1. **Dispatch 1 — RED only:** subagent writes the test, stubs to compile, runs to confirm behavior failure, reports the failing test output
2. **YOU inspect** — the RED output comes back to you. In an interactive session you show it to the developer and wait for explicit confirmation ("ok, proceed"); running autonomously you inspect it yourself. Either way it is inspected before GREEN is dispatched.
3. **Dispatch 2 — SYNTHESIZE GREEN:** only after that inspection

The inspection checkpoint is the **orchestrator's responsibility**. It cannot be delegated to the subagent that will implement the result — that is the entire point of splitting the dispatch.

**Red flags — you are violating this rule if:**
- Your subagent prompt contains both "write the failing test" AND "implement the solution"
- You wrote `PAUSE` in a plan comment but included all steps in one prompt
- You assumed the developer would confirm via the plan document

| Rationalization | Reality |
|---|---|
| "The pause is in the plan text" | Plans are documentation. Dispatch boundaries are enforcement. |
| "The subagent will stop and ask" | Subagents execute what they receive. Split the prompt. |
| "It's more efficient in one shot" | Efficiency that skips developer validation is not efficiency. |

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

**Prerequisite:** Gherkin scenarios written and approved before this skill applies — for new features, bug fixes, and behavior-changing refactoring. `bdd-methodology` defines WHAT the observable behavior is; this skill turns it into working software.

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

Placeholder test bodies are the same failure mode — see **Placeholder assertions are NOT wishful thinking** above.

### Step 3: Verify with the Mutation Gate

Once both acceptance and domain test streams are green, run the mutation gate below.

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

## Mutation Gate (third validation layer)

This skill owns **when** the gate runs and **what evidence closes it**. After both test streams are
green and before merge, run the `mutation-testing` skill:

1. Mutation testing covers Application and Domain logic, and its result is recorded.
2. Every surviving mutant is either killed or documented as equivalent with a justification.
3. A test that kills no mutants is deleted, not kept for the count.

If the gate has not run, the work is not complete — that is sequence, and it holds for every change.

**The threshold itself is MODE and this skill does not set it.** The passing score is owned by
`skraft-difficulty-routing` via the `depthTier` in the dispatch payload, and the descriptor applies
it. Do not read a fixed percentage into this section.

## Walking Skeleton (first slice of a feature)

**ONE walking skeleton at a time.** A feature has several — `test-design-mandates` sizes them at
2–5, one per major flow variant — but you drive one to GREEN before starting the next. Two
skeletons RED at once is the Concentric Circle ordering rule broken at the skeleton level: two
incomplete end-to-end paths, neither of them evidence.

`test-design-mandates` decides **how many** skeletons a feature needs and which strategy each one
uses (A/B/C/D). This skill decides **in what order** you take them and what "done" means for one.

For each skeleton:
- Write ONE acceptance test proving end-to-end wiring with **real adapters** (filesystem, DB, subprocess, HTTP — fake only costly externals like paid APIs).
- Implement the thinnest possible slice: hardcoded values, minimal branching, no error handling beyond what the AT requires.
- Unit tests only if needed to decompose a complex GREEN.
- The AT drives ALL implementation. A later scenario's test may go green on its first run because an earlier skeleton already covered it — that is correct. Confirm it with the deletion test rather than assuming it.

## Concentric Circle Expansion

The double loop (acceptance + domain unit tests) is the inner circle. Once it is GREEN for a
behavior slice, expand outward — one circle at a time.

| Phase | What to write | Prerequisite |
|---|---|---|
| **1 — Inner (double loop)** | Acceptance test at the application boundary + domain unit tests | none — always first |
| **2 — API circle** | Integration test at the transport boundary (in-process host, real entry point) | Phase 1 GREEN |
| **3 — Infrastructure circle** | Integration test at the persistence / broker / external adapter boundary | Phase 2 GREEN |

**Ordering rule:** never start Phase N+1 while Phase N is RED. Expanding outward while the inner
loop is still RED hides the root cause under outer-circle complexity and produces untraceable failures.

For test project placement and folder naming conventions, see `clean-architecture-testing`.

## One Acceptance Test at a Time

Every commit leaves the suite fully green — no `[Skip]`, no `[Ignore]`, nothing disabled
(`craft-discipline` C1, C2, C5). That rules out the common shortcut of authoring every
acceptance test up front and skipping all but one: a skipped test asserts nothing and carries
a false green through every commit until someone remembers to enable it.

Author acceptance tests **on demand**, one per slice:

1. The approved scenarios live in the `.feature` file. That is the backlog — it costs nothing and blocks nothing.
2. Write the executable acceptance test for **one** scenario. It is RED.
3. Drive it through the 4-phase cycle until green.
4. Commit — the whole suite is green, nothing is skipped.
5. Write the next scenario's acceptance test. Repeat.

A scenario whose test has not been written yet is not "skipped" — it is not started, and the
`.feature` file already records that it is owed.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Mocking domain objects in acceptance tests | Use real domain objects, mock only external boundaries |
| Designing domain objects upfront | Let domain emerge from test failures — don't design before testing |
| Treating compilation errors as RED | Stub to compile, then confirm failure on a business assertion |
| Placeholder assertion standing in for a real one | Call the API you wish existed; let the missing symbol fail the build |
| Committing when only test files changed | Post-GREEN verification via `git diff --name-only` |
| Modifying a failing test to pass | Iron Rule violation — fix the implementation or revert |
| Skipping the architectural guidance checkpoint | The failing test is inspected before any implementation is written |
| Writing every acceptance test up front and skipping all but one | Author one acceptance test per slice — a skipped test is a false green |
| Skipping Gherkin ("too small") | Even small features benefit from behavior-first thinking |
| Polluting Gherkin with class/endpoint names | Keep scenarios in business language only |
| Testing data structures directly by default | Test policies/rules; data types are covered by usage |
| Skipping the mutation gate before merge | Run the mutation-testing skill after tests green |

## Integration with other skills

Behavior-first workflow:

1. `bdd-methodology` defines WHAT (observable behavior, approved before this skill applies)
2. This skill maps scenarios to executable tests and drives the RED → validation → SYNTHESIZE-GREEN cycle
3. `mutation-testing` validates test quality after GREEN, before merge
4. `craft-discipline` is the commit-time self-check that enforces the result

- `bdd-methodology` — the approved scenarios this skill consumes
- `test-design-mandates` — coverage matrix, layer assignment, walking skeleton strategy
- `mutation-testing` — run after GREEN, before commit
- `clean-architecture-testing` — test level & doubles policy
- `craft-discipline` — commit-time quality gates checklist
- `test-refactoring-catalog` — safe test refactorings

Pair with domain-specific testing skills for patterns and examples.

## References
- [test-examples.md](references/test-examples.md) - Examples of both Acceptance and Domain tests.
- [testing-strategy.md](references/testing-strategy.md) - Detailed explanation of the testing pyramid and strategy.
- [cqrs-patterns.md](references/cqrs-patterns.md) - CQRS architecture references.
