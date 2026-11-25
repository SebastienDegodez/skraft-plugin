---
name: outside-in-tdd
description: Use when an approved behaviour (scenario, Gherkin example, worked example, expected result) must become working software, or when a test suite is not trustworthy evidence of it — the suite is green while the real runtime behaviour is wrong or missing because fixtures or tests supply the value, or the suite already fails but that failure may not prove the missing approved outcome. Drives outside-in / double-loop TDD with an acceptance or application-boundary test first, a trustworthy RED before any implementation, domain logic emerging only from failing behaviour, one walking skeleton or delivery slice at a time. Also decides what belongs in first delivery, keeps wider HTTP/DB/infrastructure tests behind an inner failing behaviour, and keeps the RED inspection point when RED and GREEN are split across workers or subagents. Finishes with post-GREEN wiring verification and mutation/coverage gates; never commits on red.
---

# Outside-In TDD

Turns an **approved** scenario into working software: enter at the application boundary, get a
trustworthy failure first, let the design emerge from failing tests. Real domain objects, doubles
only on external boundaries, fast in-memory tests. No implementation code before RED is a clean
behavior failure.

## Entry Gate — read before anything else

This skill never decides what the expected result should be. Before any phase, confirm the
behavior has an approved observable outcome (Gherkin scenario, worked example, agreed value).
When it does not:

- **Stop.** No test, no implementation, no provisional outcome chosen on the business's behalf.
- Name the open decision and ask for one observable example that closes it; `bdd-methodology`
  owns that conversation. Re-enter once it is answered.

## What this skill owns

This skill owns the **sequence** (what must be true before the next phase, and what evidence
proves it) and **which production layer a rule's code lands in**. Load the owner for everything
else:

| Question | Owner |
|---|---|
| What the observable behavior is, and whether it is approved | `bdd-methodology` |
| Which test project, which test layer, which double | `clean-architecture-testing` |
| Whether a Domain test is authorized; coverage matrix; walking-skeleton strategy A–D | `test-design-mandates` |
| Survivor classification after a developer's `/skraft-mutation` run | `mutation-testing` |
| Commit-time self-check, placeholder assertions (C5) | `craft-discipline` |
| Cleaning up test code that already passes | `test-refactoring-catalog` |
| Policy vs Domain Service vs Specification | `architecture-patterns` |

The loading agent descriptor owns **mode** (interactivity, thresholds, increment size, what its
dispatch carries): it wins on mode, this skill wins on sequence.

## The cycle (per behavior slice)

The outer loop is one acceptance test at the application boundary; it stays RED while the inner
loop cycles. The inner cycle has two steps, RED then SYNTHESIZE GREEN, with no dirty-then-refactor
step. Never build a class no active scenario requires.

1. **PREPARE** — name the input boundary (use case / handler the test enters through) and the
   output boundaries (repositories, presenters, external services it observes), as
   *Boundary-to-Boundary Testing* defines them. Target exactly ONE scenario.
2. **RED** — write the test, run it.
   - A compile or missing-symbol error is **not** RED: stub just enough to compile (empty return,
     minimal implementation), rerun, and get a failure on the business assertion.
   - "I know it will fail" is not RED: run it.
   - Never use a placeholder assertion (`craft-discipline` C5 lists them, `throw new
     NotImplementedException()` first) as the test body or as the stub: it fails without testing
     the API. Call the function you wish existed and let the missing symbol fail the build.
3. **Checkpoint (mandatory)** — before any production code:
   - The RED output is inspected by someone other than whoever writes the implementation
     (see *Inspection by mode*).
   - Name in writing, once per rule, the type that will hold the rule and its layer, checked
     against *When to Write Which*.
4. **SYNTHESIZE GREEN** — implement the smallest slice this test demands, clean the first time:
   idiomatic, domain semantics, no speculative branch, no unrequested error handling, no
   abstraction the test does not force. If the test was misunderstood, revise the test and
   restart from RED; never iterate on the code instead.
5. **COMMIT & VERIFY** — run *Post-GREEN Wiring Verification* and the *Coverage Gate*, then commit
   as *Commit policy* says; the message format is `craft-discipline` C9. A red is never chained to
   a commit; the only red commit is the story's `test` commit.

**Iron Rule of Tests:** never modify a failing test to make it pass; fix the implementation. Stuck
after 3 attempts: revert to the last green and escalate.

Read [references/pitfalls.md](references/pitfalls.md) when you are about to skip a step of the
cycle, and before you report a cycle done: quick reference, common rationalizations, red flags,
anti-patterns, common mistakes.

### Inspection by mode

- **Interactive session:** the developer reviews and explicitly validates the failing test
  before you continue.
- **SKRAFT DELIVER (the software engineer, dispatched once per story):** the inspection is the
  scenario's acceptance test run red on a business assertion and committed as a `test` commit
  before any production code of that scenario exists; no RED run is captured. Each inner unit
  test's red is run and read. Continue to SYNTHESIZE GREEN in the same dispatch — never stop after
  RED to wait for an inspection. The DELIVER reviewer's `test-integrity` lens inspects every `test`
  commit against the test plan.
- **Delegating a slice to a worker or subagent:** never put RED and SYNTHESIZE GREEN in the same
  instruction. Send RED only (write the test, stub to compile, run, report the failing output);
  inspect that output yourself — show it to the developer and wait for "proceed" when one is
  present; then send GREEN. The inspection stays with whoever delegates; a worker told to act
  unattended reports the failing test and stops. A `PAUSE` note in a plan or inside the worker's
  own instruction does not create the stop: only a separate dispatch does.

In every mode, no implementation is written until the inspection — or, in SKRAFT DELIVER, the
scenario's `test` commit — exists.

### Inner loop, at a model's pace

- **The acceptance test is the first inner test.** When it states the rule with its examples,
  go from its red to the code: write no unit test of your own. Write one only for what the
  acceptance test does not pin down: a combinatorial rule `test-design-mandates` Mandate 4 opens
  a gate for, or a case no example of the scenario reaches.
- **One RED per rule, not per example.** A unit test is one test, or one parametrized test whose
  rows triangulate the same rule (`craft-discipline` C11). Rows of two rules never share a RED.
- **Write a stated rule whole.** When the acceptance criterion states the rule (a rate table, a
  threshold, a cap, a formula), GREEN writes it; take a smaller step (a constant, then a branch)
  only when the general rule is not clear from the test.
- **Run scope.** Run the new test filtered to it, then the test project or module it lives in,
  as *Run one test, then its project* gives by stack. The whole suite runs once per scenario,
  in the command that commits its green.
- **Short output.** Run tests at their quietest verbosity, failures only; read a full output
  only to understand a failure.
- **Checks once per scenario.** After each inner GREEN, only `git diff --name-only` (step 1 of
  *Post-GREEN Wiring Verification*); its other steps and the Object Calisthenics rules
  (`craft-discipline` C10) run once on the scenario's whole diff, before its commit.

### Run one test, then its project

| Stack | One test | Its project or module | Quiet, failures only |
|---|---|---|---|
| .NET | `dotnet test <test project> --filter "FullyQualifiedName~<Class>.<Method>"` | `dotnet test <test project>` | `--verbosity quiet` |
| Java, Maven | `mvn -q test -Dtest=<Class>#<method>` (`-pl <module>` in a multi-module build) | `mvn -q test -pl <module>` | `-q` |
| Java, Gradle | `gradle test --tests "<Class>.<method>"` (`:<module>:test`) | `gradle :<module>:test` | `-q` |
| TypeScript, Vitest | `npx vitest run <file> -t "<name>"` | `npx vitest run <folder>` | `--reporter=dot` |
| Python, pytest | `pytest <file>::<test>` | `pytest <folder>` | `-q` |

Pending excluded — every test but the acceptance tests of scenarios not delivered yet, by the
scenario id that starts each acceptance test's name (`S5_…`, `test_s5_…`): .NET
`--filter "FullyQualifiedName!~S5_&FullyQualifiedName!~S6_"`; Maven `-Dtest='!*S5_*,!*S6_*'`;
Vitest `-t "^(?!.*\b[Ss](5|6)_)"`; pytest `-k "not s5_ and not s6_"`. A runner that only
includes (Gradle `--tests`) lists the delivered scenarios' ids and the unit tests instead.

The stack's test command from the stack-commands file stays the command of record: add only the
filter and the verbosity to it, never replace it with another runner.

## Commit policy

What a run commits, by pass. The test command's output tells a failing assertion from a build
error only when read: a red is never chained to a commit; a green is.

| Pass | Commits |
|---|---|
| Acceptance tests of the story (skraft DISTILL) | One `test` commit: every scenario's acceptance test and the skeleton they call, after one run whose output shows each failing on a business assertion, formatted and linted before the commit |
| Scenario in progress (skraft DELIVER) | The inner cycles commit nothing. One `feat` or `fix` commit once the scenario passes, its unit tests and every format or lint fix included, chained so it commits only when the run passes: `<test command, pending scenarios excluded> && git add <each file> && git commit -s -m "<subject>" -m "Refs: #N"` |
| No scenario: gates or review sent the story back, a session without skraft | Each cycle: `feat` or `fix` with its test and the code, once green; `refactor` for a change under green |
| Review asks for a stronger test, no behavior change | One `test` commit, never a RED→GREEN cycle: it adds assertions or cases to existing tests and never removes or rewrites a line. A stricter assertion that must replace an existing one carries `PLAN_DEVIATION: <old assertion> → <new assertion>` in the commit body, one line per replacement |

The acceptance tests of a scenario are its oracle: the green never changes them. A wrong one is
named and sent back to whoever wrote it.

## Boundary-to-Boundary Testing (all test levels)

Every test enters through an **input boundary** (use case / interactor) and asserts at **output boundaries** (gateways) or on the return value. Internal classes (entities, value objects, domain services) are exercised **indirectly** — never instantiated directly in test code.

| Test level | Input boundary | Output observation |
|---|---|---|
| Acceptance | Use case / interactor (application handler) | Gateway mocked (repository, email…) or use-case output DTO |
| Unit (domain function) | The public function signature (its contract IS the boundary) | Return value |
| Integration (gateway adapter) | Gateway contract | Real infrastructure (DB, filesystem, subprocess) |

**Unit tests are NOT "isolated object tests."** They are boundary-to-boundary at a smaller scope. Testing a pure domain function by calling it directly IS boundary-to-boundary — the function's public signature is the contract under test.

**Do not test directly:** basic constructors (unless they enforce complex invariants), simple
getters/setters, or DTOs and passive data structures. Simple value objects are covered by their use
in policies and orchestrators.

## When to Write Which

Every row answers both questions; answering only the test one is how a rule ends up in an
orchestrator.

| Signal | Code lives in | Test that covers it |
|---|---|---|
| Orchestration (load, save, publish; no rule) | Application use case / handler | Use Case test (Acceptance) |
| Simple rule: one condition, no edge-case matrix | Application use case / handler | The primary Use Case test |
| Rule over an aggregate's own state | Method on the Domain entity / aggregate | Use Case test (Acceptance) |
| Complex invariant, edge-case matrix, or reused rule | A new named type in the Domain project | Use Case test (Acceptance); a Domain test only if `test-design-mandates` Mandate 4 opens a gate |

- **"Complex" is not a judgement call:** tiers or bands, a cap or a floor, rounding, or three or
  more worked examples of one calculation put you on the last row. Classify the whole approved
  rule, not the delta of the current slice.
- Beyond the simple-rule row the handler holds no arithmetic and no branch of the rule: it passes
  the inputs to the Domain type and returns what comes back. A Domain type holding the rate while
  the handler keeps the bands or the cap is the same failure.
- Placement never depends on whether a Domain test is authorized: without one, the Use Case test
  covers the Domain type; the rule never moves back into the handler.
- Example of the last row: [references/placement-example.md](references/placement-example.md) —
  read it when a rule is on the last row and the only test calls the handler.

## Let the domain emerge

- Create no domain class, value object, entity, policy or enum — not even a new variant of an
  existing one (a new type, rejection reason, field or boundary value) — before a failing test
  demands it.
- The bar is a failing test, not a failing test that names the type. For a last-row rule, write
  the handler as a call to the Domain type you wish existed, let that reference fail to compile,
  then create the type.
- Domain objects are real in every test, never mocked.

## Post-GREEN Wiring Verification (MANDATORY)

Step 1 after every GREEN; steps 2 to 4 once per scenario, after the whole suite turns green and
BEFORE its commit:

1. Run `git diff --name-only`. Every production file the behavior required MUST appear in the diff.
2. If only test files changed but tests flipped RED → GREEN → you hit **Fixture Theater**: the test
   setup implements the feature. BLOCK the commit, go back to GREEN, write the production code.
3. Deletion test: mentally revert the production changes. If tests still pass, the test is exercising
   fixture state, not behavior.
4. Placement check: run `git diff --name-only`. If an Application file gained a rate, threshold, cap,
   or rounding computation and no Domain file was added or changed, the policy is in the orchestrator.
   BLOCK the commit and move it. Moving misplaced code is not the forbidden post-GREEN iteration: the
   acceptance test does not change and stays green throughout.

## Coverage Gate

This skill owns **when** the gate runs and **what evidence closes it**. `skraft-quality-bar` owns
the numbers, and no setting lowers them.

Code you cannot cover is code no approved behavior asked for — delete it rather than lower the bar.

The coverage run happens once, after the story's last work commit, and only it closes the gate.
If the gate has not run, the work is not complete — that is sequence, and it holds for every
change.

Mutation never runs in the delivery, inside a cycle or after it: G6 is recorded `not_run`, and
the developer runs `/skraft-mutation`.

## Walking Skeleton (first slice of a feature)

**ONE walking skeleton at a time.** A feature has several — `test-design-mandates` sizes them at
2–5, one per major flow variant, and picks each one's strategy (A/B/C/D) — but you drive one to GREEN
before starting the next. Two skeletons RED at once is the Concentric Circle ordering rule broken at
the skeleton level: two incomplete end-to-end paths, neither of them evidence.

This skill decides **in what order** you take them and what "done" means for one:

- Write ONE acceptance test proving end-to-end wiring with **real adapters** (filesystem, DB,
  subprocess, HTTP — fake only costly externals like paid APIs).
- Implement the thinnest possible slice: hardcoded values, minimal branching, no error handling
  beyond what the AT requires.
- Unit tests only if needed to decompose a complex GREEN.
- The AT drives ALL implementation. A later scenario's test may go green before its turn because an
  earlier scenario's code already covers it — that is correct. Confirm it with the deletion test
  rather than assuming it; record no cycle for it, and name the earlier scenario on its change-log
  line.

## Concentric Circle Expansion

The double loop (acceptance + domain unit tests) is the inner circle. Once it is GREEN for a
behavior slice, expand outward — one circle at a time.

| Phase | What to write | Prerequisite |
|---|---|---|
| **1 — Inner (double loop)** | Acceptance test at the application boundary + domain unit tests | none — always first |
| **2 — API circle** | Integration test at the transport boundary (in-process host, real entry point) | Phase 1 GREEN |
| **3 — Infrastructure circle** | Integration test at the persistence / broker / external adapter boundary | Phase 2 GREEN |

**Ordering rule:** never start Phase N+1 while Phase N is RED. Expanding outward while the inner
loop is still RED hides the root cause under outer-circle complexity and produces untraceable
failures.

For test project placement and folder naming conventions, see `clean-architecture-testing`.

## All Acceptance Tests First

The story's scenarios are written as executable acceptance tests together, committed red in one
`test` commit, then made green one scenario at a time. No `[Skip]`, no `[Ignore]`, nothing disabled
(`craft-discipline` C5): a pending scenario stays an active, failing test.

1. Write the acceptance test of every scenario of the `.feature` (skraft: the acceptance-designer, in
   DISTILL; the software-engineer never writes one), values copied verbatim, each test's name starting with its scenario id and an underscore
   (`S4_WelcomeFiveTakesFiveEuros`, `test_s4_welcome_five…`) — a name every runner filters on, with the skeleton signatures they compile against and no behavior.
2. Run the acceptance tests once, failures listed, and read that each fails on a business
   assertion, never a build or setup error. A test that already passes needs no code: note it.
3. Commit all of them, formatted and linted, in ONE `test` commit. One command: the run and the
   commit never wait on each other's turn when the output was already read.
4. Group the scenarios, in plan order, by the rule they pin down: consecutive scenarios that
   enter through the same use case and state one rule or its edge cases (a rate, its cap, its
   threshold) form one group; a scenario on its own is a group of one. For each group, in one
   turn: run its tests filtered to it; scenarios that already pass are covered by an earlier
   one — no code, name the covering scenario on their change-log line. Write the code the
   group's red tests demand, nothing more, then chain the gate and ONE green commit for the
   group: every test except the pending scenarios' acceptance tests (*Run one test, then its
   project* → Pending excluded) `&& git add … && git commit -m "feat(feature): <rule> S4–S7"`.
5. Loop until the last group: a red acceptance test after a green commit is a scenario still
   owed, never a reason to stop. After the last one, the whole suite runs green, unfiltered.

Every green commit leaves the delivered scenarios and every other test green; only the
acceptance tests of scenarios not delivered yet are red.

## References

- [pitfalls.md](references/pitfalls.md) - Quick reference, common rationalizations, red flags, anti-patterns, common mistakes.
- [placement-example.md](references/placement-example.md) - A tiered rule placed in the Domain, driven from the handler.
- [outer-loop.md](references/outer-loop.md) - What the author of the acceptance tests needs from this skill.
- [test-examples.md](references/test-examples.md) - Worked Acceptance and Domain test examples (real domain objects, mocked boundaries).
- [testing-strategy.md](references/testing-strategy.md) - Testing pyramid and strategy.
- [cqrs-patterns.md](references/cqrs-patterns.md) - CQRS architecture references.
