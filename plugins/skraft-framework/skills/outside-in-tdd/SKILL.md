---
name: outside-in-tdd
description: "Use first, before giving advice or writing code, for any request to implement, deliver, fix or plan production behaviour that product or the business has approved (a scenario, example, expected value or first outcome). Covers: scoping a first delivery, ordering tests from the outside in, deciding when HTTP or database tests come in, telling whether a green or failing suite actually proves the approved outcome (fixture-supplied values, placeholder failures), and splitting RED from GREEN when work goes to an unattended worker or subagent. Skip it for cleaning up tests that already pass, or when the expected outcome is still undecided."
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
| Whether a Domain test is authorized; coverage matrix; walking skeleton and its exemptions; what each dependency runs on | `test-design-mandates` |
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
   ONE scenario.
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
5. **VERIFY, then commit** — run *Post-GREEN wiring verification*, then commit as *Commit policy*
   says. Never commit on red.

**Iron rule:** never modify a failing test to make it pass; fix the implementation. Stuck after
3 attempts: revert to the last green and escalate.

### Inspection by mode

- **Interactive session:** the developer reviews and explicitly validates the failing test
  before you continue.
- **skraft DELIVER:** the recorded red commit is the inspection: on the story pass, DISTILL's
  `test` commit of the acceptance tests; on a pass after the story is delivered, your own test's
  failing run, read before any production code, the test then committed with that code. Continue to GREEN in the same run; never stop
  after RED to wait for an inspection.
- **Delegating a slice to a worker or subagent:** never put RED and SYNTHESIZE GREEN in the same
  instruction. Send RED only (write the test, stub to compile, run, report the failing output);
  inspect that output yourself — show it to the developer and wait for "proceed" when one is
  present; then send GREEN. The inspection stays with whoever delegates; a worker told to act
  unattended reports the failing test and stops. A `PAUSE` note in a plan or inside the worker's
  own instruction does not create the stop: only a separate dispatch does.

### Inner loop, at a model's pace

- **The acceptance test is the first inner test.** When it states the rule with its examples, go
  from its red to the code: write no unit test of your own. Write one only for what the acceptance
  test does not pin down: a combinatorial rule `test-design-mandates` Mandate 4 opens a gate for,
  or a case no example of the scenario reaches.
- **One RED per rule, not per example.** A unit test is one test, or one parametrized test whose
  rows triangulate the same rule (`craft-discipline` C11). Rows of two rules never share a RED.
- **Write a stated rule whole.** When the acceptance criterion states the rule (a rate table, a
  threshold, a cap, a formula), GREEN writes it; take a smaller step (a constant, then a branch)
  only when the general rule is not clear from the test.
- **Run scope.** During RED and GREEN run only the test at hand, filtered to it (*Run one test*);
  no project or suite run until the story's commit. The component's gates (`build`, `format`,
  `lint`) and the whole suite run once each, before that one commit, the suite in the command
  that commits; never a confirmation re-run, never a separate build when the test run compiles.
- **Where commands run.** Every test, build, format and lint command runs through `skraft_repl`
  (`run(command, { cwd })`, `gate(name, command, { cwd })`); only the runs of `skraft_repl` count as proof. Chain the `git add` and the `git commit` of a commit in one `run` string, so the commit
  is one cell.
- **Short output.** Run tests at their quietest verbosity, failures only; read a full output only
  to understand a failure.
- **Checks once per group.** After each inner GREEN, only `git diff --name-only` (step 1 of
  *Post-GREEN wiring verification*); its other steps and the Object Calisthenics rules
  (`craft-discipline` C10) run once on the group's whole diff, when its acceptance tests pass.

### Run one test

| Stack | One test | Quiet, failures only |
|---|---|---|
| .NET | `dotnet test <test project> --filter "FullyQualifiedName~<Class>.<Method>"` | `--verbosity quiet` |
| Java, Maven | `mvn -q test -Dtest=<Class>#<method>` (`-pl <module>` in a multi-module build) | `-q` |
| Java, Gradle | `gradle test --tests "<Class>.<method>"` (`:<module>:test`) | `-q` |
| TypeScript, Vitest | `npx vitest run <file> -t "<name>"` | `--reporter=dot` |
| Python, pytest | `pytest <file>::<test>` | `-q` |

The component's test command from your brief is the command of record: add only the filter and the
verbosity to it, never replace it with another runner.

## Commit policy

What a run commits, by pass. The test command's output tells a failing assertion from a build
error only when read: a red is never chained to a commit; a green is.

| Pass | Commits |
|---|---|
| Acceptance tests of the story (skraft DISTILL) | One `test` commit: the walking skeleton and the acceptance test of every scenario, with the skeleton they call, after one run whose output shows each failing on a business assertion |
| Story in DELIVER, one dispatch | The inner cycles commit nothing. One `feat` or `fix` commit for the whole story, once every group's scenarios and the walking skeleton pass: its unit tests and every format or lint fix included, chained: `<test command, unfiltered> && git add <each file> && git commit -s -m "<subject>" -m "Refs: #N"` in sh and PowerShell 7; in Windows PowerShell 5.1, `<test command, unfiltered>; if ($?) { git add <each file>; if ($?) { git commit -s -m "<subject>" -m "Refs: #N" } }`; the lines the brief gives; the gates (`build`, `format`, `lint`) ran just before it |
| Gates or review sent the story back (skraft DELIVER, after the story's commit) | Each cycle: one `feat` or `fix` commit holding its test and its code, once green, never a `test` commit of its own; `refactor` for a change under green, `style` for format or lint fixes |
| No scenario: mutant kills, a session without skraft | Each cycle: `test` with the failing test, then `feat` or `fix` with the code; `refactor` for a change under green |

The acceptance tests of a scenario are its oracle: the green never changes them. A wrong one is
named and sent back to whoever wrote it.

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

- **Walking skeleton:** the outer loop of the story, written first, failing, with the skeleton of
  every class of its chain. A plain test, no Gherkin, it drives the real entry point through the
  use case to the real internal gateways (database on Testcontainers); external gateways and the
  clock as the infrastructure policy says (`test-design-mandates`). It asserts the status, the
  shape and one value S1 names. A pure library, a refactoring with no new public interface, or a
  configuration or documentation change has none.
- **Double loop:** each scenario's acceptance test, S1's included, enters by the use case; the inner
  loop drives it green. The group holding S1 is done when its acceptance tests and the walking
  skeleton both pass: thinnest slice, hardcoded values, minimal branching. Every later group keeps
  the walking skeleton and the groups before it passing.
- **First delivery** holds only the approved outcome; defer unapproved validations, states and
  abstractions.
- **All acceptance tests first:** write the acceptance test of every scenario, each name starting
  with its scenario's number, run them once and read that each fails on a business assertion,
  never a build or setup error; commit them all in one `test` commit. Never skip one: a scenario
  not delivered yet stays an active, failing test, left out by the name filter (Commit policy).
- **One group at a time, one commit:** the implementation plan groups the scenarios by the rule
  they pin down: consecutive scenarios that enter through the same use case and state one rule or
  its edge cases form one group; a scenario on its own is a group of one. One dispatch works every
  group in plan order and makes one green commit for the story. For each group, in one turn: run its
  acceptance tests filtered by their numbers; scenarios that already pass are covered by an earlier
  one: confirm it with the deletion test (*Post-GREEN wiring verification*), write no code for
  them, name the covering scenario on the change-log line; write the code its red tests demand,
  nothing more. After the last group run the chained commit, whose unfiltered test run is the one
  run of the whole suite and the `test` gate; then run each other gate on that commit.
- A scenario's acceptance test that already passes on the stubs needs no code: note it and keep
  its scenario; never merge it into another scenario's `Examples`.

## Concentric circles

| Circle | What to write | Starts when |
|---|---|---|
| 1 — Inner | Acceptance test at the application boundary + Domain tests | Always first |
| 2 — API | Integration test at the transport boundary (in-process host) | Circle 1 GREEN |
| 3 — Infrastructure | Integration test at persistence, broker or external boundary | Circle 2 GREEN |

Never start circle N+1 while circle N is RED: outer failures hide the inner root cause. Give the
ordered sequence rather than refusing the outer tests.
