---
name: outside-in-tdd
description: Use when an approved scenario, acceptance criterion or expected result has to be implemented test-first, when a passing suite may not prove the behaviour because the tests rather than production code produce the value, when a failing test may not show the missing outcome, when choosing what the first slice holds or which test level comes next, or when TDD steps are split between agents. Holds the RED checkpoint, the ordered test list (TPP), where each rule's code lives and the post-GREEN wiring check. Not for an outcome nobody has approved yet.
---

# Outside-In TDD

Turns an **approved** scenario into working software: enter at the application boundary, get a
trustworthy failure first, let the design emerge from failing tests. Real domain objects, doubles
only on external boundaries, fast in-memory tests. No implementation code before RED is a clean
behaviour failure.

## Entry gate

This skill never decides what the expected result should be. Before any phase, confirm the
behaviour has an approved observable outcome (Gherkin scenario, worked example, agreed value).
When it does not:

- **Stop.** No test, no implementation, no provisional outcome chosen on the business's behalf.
- Name the open decision and ask for one observable example that closes it; `bdd-methodology`
  owns that conversation. Re-enter once it is answered.

## Ownership

This skill owns the **sequence** (what must be true before the next phase) and **which production
layer a rule's code lands in**. Load the owner for everything else:

| Question | Owner |
|---|---|
| What the behaviour is, and whether it is approved | `bdd-methodology` |
| Test project, test layer, which double, test examples | `clean-architecture-testing` |
| Whether a Domain test is authorized; coverage matrix; walking-skeleton count and strategy | `test-design-mandates` |
| Commit-time self-check, placeholder assertions (C5) | `craft-discipline` |
| Cleaning up test code that already passes | `test-refactoring-catalog` |
| Policy vs Domain Service vs Specification | `architecture-patterns` |

The loading agent descriptor owns **mode** (interactivity, increment size): it wins on mode, this
skill wins on sequence.

## The cycle (per behaviour slice)

The outer loop is one acceptance test at the application boundary; it stays RED while the inner
loop cycles. The inner cycle has two steps, RED then SYNTHESIZE GREEN, with no dirty-then-refactor
step. Never build a class no active scenario requires.

1. **PREPARE** — name the input boundary (use case / handler the test enters through) and the
   output boundaries (repositories, presenters, external services it observes). Target exactly
   ONE scenario. Write the ordered test list (below) before any production code.
2. **RED** — write the test, run it.
   - A compile or missing-symbol error is **not** RED: stub just enough to compile (empty return,
     minimal implementation), rerun, and get a failure on the business assertion.
   - "I know it will fail" is not RED: run it.
   - Never use a placeholder assertion (`throw new NotImplementedException()`, `fail()`,
     `assert false`, …) as the test body or as the stub: it fails without testing the API.
     Call the function you wish existed and let the missing symbol fail the build.
3. **Checkpoint (mandatory)** — before any production code:
   - The RED output is inspected by someone other than whoever writes the implementation
     (see *Inspection by mode*).
   - Name in writing the type that will hold the rule and its layer, checked against
     *Where the code lives*.
4. **SYNTHESIZE GREEN** — implement the smallest slice this test demands, clean the first time:
   idiomatic, domain semantics, no speculative branch, no unrequested error handling, no
   abstraction the test does not force. If the test was misunderstood, revise the test and
   restart from RED; never iterate on the code instead.
5. **VERIFY, then commit** — run *Post-GREEN wiring verification*. Never commit on red.

**Iron rule:** never modify a failing test to make it pass; fix the implementation. Stuck after
3 attempts: revert to the last green and escalate.

### Inspection by mode

- **Interactive session:** the developer reviews and explicitly validates the failing test
  before you continue.
- **skraft DELIVER:** the recorded red commit is the inspection. Commit the failing test before
  any production code exists, then continue to GREEN in the same run; never stop after RED to wait.
- **Delegating a slice to a worker or subagent:** never put RED and SYNTHESIZE GREEN in the same
  instruction. Send RED only (write the test, stub to compile, run, report the failing output);
  inspect that output yourself — show it to the developer and wait for "proceed" when one is
  present; then send GREEN. The inspection stays with whoever delegates; a worker told to act
  unattended reports the failing test and stops. A `PAUSE` note in a plan or inside the worker's
  own instruction does not create the stop: only a separate dispatch does.

## Ordered test list (TPP + FLFI)

Before the first line of production code, write the ordered list of tests for the slice, one row
per test. Persist it next to the plan; consume it head-first.

| # | Level (acceptance / unit / integration) | Behaviour name, business language | TPP transformation | Contradiction the current code cannot satisfy |
|---|---|---|---|---|

- **Transformation:** for each entry, name the single transformation that turns the previous
  GREEN into this one, highest first: `{}→nil`, `nil→constant`, `constant→constant+`,
  `constant→scalar`, `statement→statements`, `unconditional→if`, `scalar→array`,
  `array→container`, `statement→recursion`, `if→while`, `expression→function`,
  `variable→assignment`, `case`.
- **F — Failing:** an entry with no contradiction would pass on the current code; drop it.
- **L — Least:** take next the entry whose GREEN needs the highest transformation. Degenerate and
  boundary cases before the general case; reach the general case by accumulated
  transformations, never by a leap.
- **F — Fast:** the acceptance entry opens the list and stays red; units drive the inside;
  integration entries come after (*Concentric circles*).
- **I — Incremental:** one entry, one slice, one commit. An entry needing two transformations is
  two entries.
- GREEN applies exactly the declared transformation, even when a later entry will obviously need
  more. Never two failing tests at once besides the outer acceptance test.
- After a GREEN, re-plan only in writing (entry added, removed, reordered, transformation
  revised). Never re-plan to justify code already written; never merge entries to save a cycle;
  never write the list after the code.

## Where the code lives

Every row answers both questions; answering only the test one is how a rule ends up in an
orchestrator.

| Signal | Code lives in | Test that covers it |
|---|---|---|
| Orchestration (load, save, publish; no rule) | Application handler | Use-case test |
| Simple rule: one condition, no edge-case matrix | Application handler | The use-case test |
| Rule over an aggregate's own state | Method on the Domain entity / aggregate | Use-case test |
| Complex invariant, edge-case matrix, or reused rule | A new named Domain type | Use-case test; a Domain test only if `test-design-mandates` Mandate 4 opens a gate |

- **"Complex" is not a judgement call:** tiers or bands, a cap or a floor, rounding, or three or
  more worked examples of one calculation put you on the last row. Classify the whole approved
  rule, not the delta of the current slice.
- Beyond the simple-rule row the handler holds no arithmetic and no branch of the rule: it passes
  the inputs to the Domain type and returns what comes back. A Domain type holding the rate while
  the handler keeps the bands or the cap is the same failure.
- Placement never depends on whether a Domain test is authorized: without one, the use-case test
  covers the Domain type; the rule never moves back into the handler.
- Do not test constructors (unless they enforce complex invariants), getters, DTOs or simple
  value objects directly.
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

## Post-GREEN wiring verification

After the suite turns green, before the commit:

1. `git diff --name-only`: every production file the behaviour required appears. Tests flipped
   RED → GREEN with only test files changed is **fixture theater** (the test setup implements the
   feature): write the production code, and remove the test helper that supplied the value.
2. Deletion test: mentally revert the production changes. If tests still pass, they exercise
   fixture state, not behaviour.
3. Placement: an Application file gained a rate, threshold, cap or rounding computation and no
   Domain file changed → move it to the Domain before committing. This move is not forbidden
   post-GREEN iteration: the acceptance test does not change and stays green.

Code no approved behaviour asks for and no test covers: delete it. Run no mutation inside a cycle.

## Walking skeleton and slicing

- **One walking skeleton at a time**, driven to GREEN before the next. Its acceptance test proves
  end-to-end wiring with real infrastructure (filesystem, DB, subprocess, HTTP); fake only costly
  externals such as paid APIs. Thinnest slice: hardcoded values, minimal branching, no error
  handling beyond what the test requires.
- **First delivery** holds only the approved outcome; defer unapproved validations, states and
  abstractions.
- **One acceptance test at a time:** the `.feature` file is the backlog. Write the executable test
  for one scenario, drive it to green, commit, then write the next. Never author them all up front
  with all but one skipped. A later test that goes green on its first run because an earlier
  slice covered it is correct: confirm it with the deletion test.

## Concentric circles

| Circle | What to write | Starts when |
|---|---|---|
| 1 — Inner | Acceptance test at the application boundary + Domain tests | Always first |
| 2 — API | Integration test at the transport boundary (in-process host) | Circle 1 GREEN |
| 3 — Infrastructure | Integration test at persistence, broker or external boundary | Circle 2 GREEN |

Never start circle N+1 while circle N is RED: outer failures hide the inner root cause. Give the
ordered sequence rather than refusing the outer tests.
