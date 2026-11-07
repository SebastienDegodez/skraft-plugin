---
title: "Gates"
description: "The engine's command gates and the review criteria (Gxx and other ids) the lenses judge, per phase, with a lens's answer, the refutation and the verdict."
---

# Gates

A gate is a binary criterion written in advance: a command that exits with 0, or a criterion a review lens declares held or not.

Why written criteria and an independent review:
[Review before review](../explanation/deep-dive/review-before-review.md).
Where each review sits in the pipeline: [Phases](./phases.md).

## Two kinds of gates <!-- #kinds -->

| Kind | Ids | Who judges it | Where |
| --- | --- | --- | --- |
| Command gate | `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | the engine, by the exit code of the component's command | DELIVER's `gates`, `mutation` and `mutation_gates` nodes, `skraft gate` |
| Review criterion | `G<n>`, and `C1`, `F1`, `B1`, `T<n>`, `E<n>`, `M<n>`, `K<n>` | a lens, then the engine (DESIGN, DISTILL, DELIVER) or `review-verdict.mjs` (DISCOVER, DISCUSS) | each phase's reviews |
| Engine check tied to a criterion | G2, G10, G12, G14 (DESIGN); G1 (`gherkin-records`), G11 (`testability#layout`) (DISTILL); G9 (`test-integrity#patch`) | the engine, without a lens | after the architect's attempt; after the acceptance designer's attempt; in a review's patch |

A `G<n>` id is unique only within its phase: DESIGN's G1 is not DISTILL's G1. A lens's table, in
its agent descriptor, is the source; a lens puts the id in the `gate` field of each finding.

## Command gates <!-- #command-gates -->

The gates are a component's commands whose name is one of the seven below, in
`skraft-config.json`. They run in that order, whatever the file's order, from the component's
root; a component stops at its first failing gate.

| Order | Gate | Node of the plugin's workflow |
| --- | --- | --- |
| 1 | `build` | `gates`, `mutation_gates` |
| 2 | `format` | `gates`, `mutation_gates` |
| 3 | `lint` | `gates`, `mutation_gates` |
| 4 | `test` | `gates`, `mutation_gates` |
| 5 | `architecture` | `gates`, `mutation_gates` |
| 6 | `coverage` | `gates`, `mutation_gates` |
| 7 | `mutation` | `mutation` |

| Rule | Detail |
| --- | --- |
| Result | `pass` (exit 0) or `fail`, class `environment` or `deterministic` ([failure classes](./skraft-config.md#failure-classes)) |
| Component with no gate command | gate `none`, `fail`, class `environment` |
| Scope | the components changed since their base; `goal_gate=true` then runs all the others; `skraft gate --all` runs them all |
| Edges | every gate of the node passes: the `PASS` edge; one fails: the `FAIL` edge (`gates`: `PASS` to `deliver_review`, `FAIL` to `deliver`; `mutation`: `PASS` to `visuals`, `FAIL` to `kill_proposal`; `mutation_gates`: `PASS` to `mutation`, `FAIL` to `kill_mutants`) |
| Mutation | the engine reads the report of the `mutation` command (`mutationReport`) and judges two bars: **100 %** on the core (Domain, Application), **80 %** on the boundary (the rest); it runs once, after `deliver_review` approved; on failure, `kill_proposal` writes one proposal per file of survivors, the `mutation-plan` question lets the developer choose (`APPLY`, their instruction, `STOP`), then `kill_mutants` applies the choice ([Phases](./phases.md#deliver)) |
| Thresholds | none is configurable |
| Lock | `gates` and `mutation` are `locked=true`: a copy of the workflow drops them only with `unlock="<reason>"` ([The DOT workflow](./workflow-dot.mdx#locked-nodes)) |
| Evidence | `gates/<component>/<gate>-<n>.log` and a `gate.ran` event ([Tracking folder and journal](./run-journal.md#gate-evidence)) |

## Review criteria <!-- #review-criteria -->

| Severity | DISCOVER, DISCUSS (`review-verdict.mjs`) | DESIGN, DISTILL, DELIVER (engine) |
| --- | --- | --- |
| `blocker` | `REJECTED` | `NEEDS_REWORK` once confirmed by `finding-refuter` |
| `high` | `NEEDS_REWORK` | `NEEDS_REWORK` once confirmed |
| `medium` | `NEEDS_REWORK` | `NEEDS_REWORK` once confirmed |
| `low` | `APPROVED`, noted | `NEEDS_REWORK` once confirmed, whether its lens answered `fail` or `pass` |

---

## DISCOVER — G1 to G6 <!-- #discover -->

`backlog-discoverer` (skraft-backlog plugin) dispatches 3 lenses; `review-verdict.mjs --phase
discover` computes the verdict. Subject: the triage report and the sprint proposal.

| ID | Lens | Criterion | Severity |
| --- | --- | --- | --- |
| **G1** | `discovery-completeness-lens` | All 3 discovery modes were used, or the report says why a mode was skipped. | HIGH |
| **G2** | `discovery-completeness-lens` | No open P0 or P1 issue is absent from the triage report. | BLOCKER |
| **G3** | `discovery-prioritization-lens` | Every P0 carries a written justification; no priority inversion within a domain. | HIGH |
| **G4** | `discovery-prioritization-lens` | Declared capacity is respected; nothing above 8 points in the sprint; no P2/P3 seated while a P0/P1 waits. | HIGH |
| **G5** | `discovery-duplicate-lens` | No two triaged issues describe the same problem without being marked as duplicates. | HIGH |
| **G6** | `discovery-duplicate-lens` | Every merely related pair is noted with a recommendation. | MEDIUM |

## DISCUSS — G1 to G8 <!-- #discuss -->

`backlog-planner` (skraft-backlog plugin) dispatches 4 lenses; `review-verdict.mjs --phase
discuss` computes the verdict. Subject: the stories and their acceptance criteria.

| ID | Lens | Criterion | Severity |
| --- | --- | --- | --- |
| **G1** | `planning-invest-lens` | Each story satisfies all six INVEST criteria. | HIGH |
| **G2** | `planning-invest-lens` | Every story is independently deliverable; the sprint dependency graph has no cycle. | HIGH |
| **G3** | `planning-ac-quality-lens` | Every story carries at least three criteria, none of which is an implementation step. | HIGH |
| **G4** | `planning-ac-quality-lens` | No criterion admits two readings by a domain expert with no code knowledge. | BLOCKER |
| **G5** | `planning-coherence-lens` | Every story fits the milestone theme and its time-box without decomposition. | HIGH |
| **G6** | `planning-coherence-lens` | The dependency graph is acyclic and the delivery sequence respects it. | BLOCKER |
| **G7** | `planning-dor-lens` | Every story clears all eight Definition of Ready items. | BLOCKER |
| **G8** | `planning-dor-lens` | No CRITICAL antipattern and no HIGH antipattern is present. | BLOCKER for CRITICAL; HIGH otherwise |

A story missing two Definition of Ready items or more (two G7 findings) makes the verdict
`REJECTED`, whatever their severity.

## DESIGN <!-- #design -->

The `design_review` review: 3 lenses, verdict computed by the engine. A `Proposed` ADR the pass
under review wrote satisfies every criterion that asks for an `Accepted` ADR and falls under
every criterion that forbids one.

| ID | Lens | Criterion | Severity |
| --- | --- | --- | --- |
| **G1** | `consistency` | Every structural commitment shown in a diagram or detected in the structural scan has an `Accepted` ADR, or a `Proposed` ADR of this pass, justifying it. | blocker |
| **G2** | `consistency` | No two ADRs contradict each other; every row of `docs/adr/supersessions.md` has its new ADR carrying the `**Supersedes:**` line. | blocker |
| **G10** | `consistency` | The back-propagation journal of the consistency matrix explains every reconciliation rewrite. | blocker |
| **G12** | `consistency` | Every `supersession-plan-{story}.md` row has its new ADR carrying `**Supersedes:**`, and no event model or diagram still cites the superseded ADR as source of truth. | blocker |
| **G14** | `consistency` | A `Status: Rejected` ADR stands only when a story or measurable force of this batch raised the question and its Alternatives section names the option adopted instead. | blocker |
| **C1** | `consistency` | Context map, diagrams and event model name the same contexts, aggregates, commands, events and fields (the fields the event model gives each one), and each matches the research and the story. | high |
| **G3** | `architecture-compliance` | Domain and Application depend on nothing in Infrastructure or API. | blocker |
| **G4** | `architecture-compliance` | Every application interface (repository, gateway, publisher) is defined in Domain or Application, in the layer the aggregate's ADR records, never in Infrastructure. | blocker |
| **G5** | `architecture-compliance` | Each aggregate enforces only its own invariants and refers to other aggregates by ID. | high |
| **G6** | `architecture-compliance` | The context map labels every relationship between contexts with an explicit pattern (ACL, Conformist, Shared Kernel, Partnership, Open Host Service, Published Language). | high |
| **G16** | `architecture-compliance` | Comparable interfaces share the same state, return and error shape and exposed field names, unless an ADR justifies the divergence. | high |
| **G7** | `fitness` | Every story maps to at least one Command or Query in the event model. | high |
| **G8** | `fitness` | Every Command of a business bounded context has at least one domain event for its successful outcome; Queries and front-end components (which only trigger a business context's Command) are exempt. | high |
| **G9** | `fitness` | Every aggregate, bounded context, Event Sourcing adoption or Saga traces to a story that requires it. | medium |
| **G11** | `fitness` | Every ADR adopting CQRS, Event Sourcing, Saga, eventual consistency, a service split or an ACL cites an admissible force and evaluates the "do without" option. | high |
| **G15** | `fitness` | No ADR ratifies a baseline already enforced by a `clean-architecture-*` skill or an architecture test, where a repository interface lives included. | high |
| **G17** | `fitness` | Every ADR the pass wrote decides a layer boundary, an aggregate boundary, a bounded context, a pattern adding complexity or a cross-cutting concern, and weighs a real trade-off; another subject is `ADR-INFLATION`, no alternative weighed is `NON-DECISION`. | high |
| **G18** | `fitness` | Every ADR the pass wrote holds one decision at decision level: no full signature, enum values, Value Object inventory, route tree, or traceability reference (user story, PRD or requirement id), the triggering story included. A quality attribute stated with its measure as a force of the decision is allowed. A code file, an acceptance criterion, a ticket or another ADR cited outside the `Supersedes:` or `Amends:` line is refused by the engine, not by the lens. | medium |
| **F1** | `fitness` | Every quality attribute the story or research states has a design element that answers it. | high |

**Engine checks.** After each `solution-architect` attempt, without a lens
([`design-records`](./run-journal.md#statuses-and-codes)):

| Criterion | Check |
| --- | --- |
| G10 | a `consistency-matrix-<story>.md` in the tracking folder, its `consistency-gate` line reading `PASS` |
| docs-relied-on | the matrix has a `docs-relied-on:` line (comma-separated repository-relative paths, backticks allowed, `/` or `\` separators) listing at least one file under `docs/adr/`, `docs/architecture/`, `docs/domain/event-model/` or `docs/features/`, and every listed path is a readable regular file of the working copy. A path counts only from its start (not re-rooted from `mydocs/`, an absolute path or `../docs/`), a path with a `.` or `..` segment is not listed, a trailing `:line`, `#anchor` or period is dropped, and a folder or any other file of `docs/` does not count |
| G14 | no ADR the run wrote named `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` or `*-superseded.md` |
| G2, G12 | every `**Supersedes:** ADR-MMM` of an ADR the run wrote has its row in the `docs/adr/supersessions.md` registry |
| G2 | every ADR the run wrote has its row in `docs/adr/decisions-index.md` |
| G2 | an ADR on the base branch changes only its status lines and is never deleted (`adr-lifecycle`) |

A failure sends the architect back with one line per record; after its last attempt, the run
stops with `design-records`. The consistency matrix is also DESIGN's declared output: when it is
missing, the run stops with `missing-outputs` instead.

## DISTILL <!-- #distill -->

The `distill_review` review: 4 lenses, verdict computed by the engine.

| ID | Lens | Criterion | Severity |
| --- | --- | --- | --- |
| **G1** | `coverage` | Every acceptance criterion has at least one scenario; no scenario lacks a source criterion; every business value in a scenario equals its criterion's. | blocker |
| **G2** | `coverage` | Every business rule has its boundary conditions and negative or error cases from the story's examples; a Gherkin mapping or example written in a DESIGN document is no story example, and a variant an earlier rule already decides adds no boundary; a technical input case is never asked for. | high |
| **G3** | `business-alignment` | Every term in Given/When/Then steps comes from the story's domain vocabulary; no class, method or framework name. | high |
| **G4** | `business-alignment` | No step carries an implementation detail (HTTP verb or status, ORM or database term, `Repository`, `Service`, `Handler`, `Controller`, `UseCase`, technical input case). | blocker |
| **B1** | `business-alignment` | Every scenario expresses an outcome the story asks for; none describes behaviour it does not ask for. | high |
| **G5** | `testability` | Every step is unambiguous and implementable on its own. | high |
| **G6** | `testability` | Every scenario has an entry in the implementation plan. | high |
| **G11** | `testability` | Every use case new to the story has its acceptance test in its language's unit-test place (.NET: the `<Context>.UnitTest`, `<Context>.UnitTests` or `<Context>.Tests` project; Java: the `-unit-test(s)` module; Python, TypeScript, JavaScript, React: `<test path>/unit/`). | blocker |
| **T1** | `testability` | Each scenario and test checks one behaviour through an observable outcome and depends on no time, order or randomness it does not fix. | high |
| **T2** | `testability` | Every input and expected value the outer acceptance test holds equals the `.feature` verbatim; the test holds the first scenario only. | blocker |
| **T3** | `testability` | The outer acceptance test exists and its first scenario fails on a business assertion; the patch's production code is a skeleton whose signatures answer the empty value of their type. | blocker |
| **G7** | `boundary-enforcement` | Every scenario in the test plan targets an Application use case the event model names (one of its Commands or Queries); an implementation-plan step that writes no scenario's acceptance test (an API or HTTP test of a later circle) is out of its scope. | blocker |
| **G8** | `boundary-enforcement` | The test plan identifies at least one walking-skeleton scenario per flow. | high |
| **E1** | `boundary-enforcement` | The acceptance test drives only that use case: it never calls or asserts on a domain internal, a repository or an infrastructure class. Constructing the use case's real collaborators to hand them to its constructor is wiring, not a finding. | blocker |
| **E2** | `boundary-enforcement` | Test doubles replace only outer-edge dependencies, never a domain object or the use case; DISTILL's skeleton is the real module. | high |

**Engine check.** G11: the engine reads where the patch adds test files and reports, under the
lens `testability#layout` (severity blocker), a test added outside the stack's unit and
integration places, and a component that gains tests with none in its unit place. A test counts
only under a test path the component configures (`paths.tests`); a test path that is itself a
place counts as it (`tests/unit`, `tests/Orders.UnitTests`). .NET names its places
`<Context>.UnitTest(s)`, `<Context>.Unit.Tests` or `<Context>.Tests` and
`<Context>.IntegrationTest(s)` or `<Context>.Integration.Tests`; Java `<context>-unit-test(s)` and
`<context>-integration-test(s)`; any other stack `unit/` and `integration/` under the test path.

**Engine check.** G1: after each `acceptance-designer` attempt, without a lens
([`gherkin-records`](./run-journal.md#statuses-and-codes)), the engine reads the scenarios the test
plan names and reports one line per fault: a `.feature` the plan cites that `docs/features/` does
not hold, a scenario that says no Given, When or Then, an outline whose examples leave unfilled a
placeholder its title or its steps open, two scenarios of one file sharing a title, and a story
with fewer scenarios than its `ac-draft-{story}.md` declares acceptance criteria (an outline counts
once, however many example rows it carries). The plan declares the perimeter: only the `.feature`
files it cites are read, so the files of another story are never charged to this run, and a
coverage-matrix row that names no Gherkin writes `—`. The criteria answer how many scenarios it
takes: a story whose `ac-draft` declares none is asked for none. This is a floor under G1, not G1 itself: the `coverage` lens still
judges which criterion each scenario answers.

## DELIVER <!-- #deliver -->

DELIVER goes through the `gates` gates, the `deliver_review` call of the `review` workflow, then
the `mutation` gate; when it fails, the `mutation_review` review (lens `test-integrity`) judges
`kill_mutants`'s tests before `mutation_gates`. The same lenses judge
a pull request through `skraft review --pr`.

| ID | Lens | Criterion | Severity |
| --- | --- | --- | --- |
| **G7** | `test-integrity` | No test theater: every test can fail when the behaviour it names breaks. | blocker |
| **G9** | `test-integrity` | No test changed to pass: no weakened assertion, no deleted test, no skip or focus added, no acceptance value that drifted from the `.feature`. | blocker |
| **G4** | `architecture-boundaries` | No test double on a Domain or Application type in a unit test. | blocker |
| **G5** | `architecture-boundaries` | Dependencies point inward: Domain → nothing, Application → Domain, API and Infrastructure → Application; skipped for a component whose `architecture` gate passed in this run. | blocker |
| **G10** | `architecture-boundaries` | Domain code follows the 9 Object Calisthenics rules. | medium |
| **G11** | `cold-reader` | Tests and production code speak the business language and show their intent. | medium |
| **M1** | `mock-fidelity` | The test follows its component's mocking strategy. | high |
| **M2** | `mock-fidelity` | The mock is wired into the test host. | blocker |
| **M3** | `mock-fidelity` | No real downstream call leaks. | blocker |
| **M4** | `mock-fidelity` | The double stands in for the downstream, never for the system under test. | high |
| **K1** | `contract-fidelity` | When the component asks for contract tests, the patch has an integration test that starts the app in-process and calls it over HTTP. | blocker |
| **K2** | `contract-fidelity` | When the component asks for contract tests, the patch also has a Microcks provider verification (`TestEndpointAsync`, `OPEN_API_SCHEMA` runner). | high |
| **K3** | `contract-fidelity` | A Microcks provider verification asserts its result. | blocker |
| **K4** | `contract-fidelity` | The integration test asserts the response contract. | high |
| **K5** | `contract-fidelity` | No real downstream call leaks. | blocker |

`mock-fidelity` runs only on changes that touch mocks (`when="mock"`), `contract-fidelity` only on
changes that touch contracts (`when="contract"`)
([triggers](./workflow-dot.mdx#conditional-lenses)).

The engine also checks, with no gate id, the commits of each attempt (`commits.checked`): a
conventional message, `Refs: #<issue>` as the last line, no issue closed, a green commit preceded
by a red one, each red one replayed and failing
([`tdd.replay`](./skraft-config.md#tdd)).

## Review: answer, refutation, verdict <!-- #review-run -->

What follows holds for the reviews the engine conducts (DESIGN, DISTILL, DELIVER, `skraft review
--pr`).

### A lens's answer <!-- #lens-answer -->

A lens ends its last message with one YAML document in a fenced block; the engine
reads the last fenced block of the message.

```yaml
lens: test-integrity
verdict: fail            # pass | fail | inconclusive
findings:                # [] when it finds none
  - id: F1
    gate: G9             # the gate of the lens's table
    severity: blocker    # blocker | high | medium | low
    location: "tests/Orders.UnitTest/RefundTests.cs:42"
    description: "the expected amount 90 became Assert.NotNull"
    suggestion: "restore Assert.Equal(90, refund.Amount)"   # optional
    severityReason: "the refund amount is no longer checked"
    drift: structural    # label | classification | structural
    occurrences:
      - "tests/Orders.UnitTest/RefundTests.cs:42"
```

| Rule | Detail |
| --- | --- |
| Keys | only `lens`, `verdict`, `findings`; per finding `id`, `gate`, `severity`, `location`, `description`, `suggestion`, `severityReason`, `drift`, `occurrences`; any other key refuses the answer |
| Required | `gate`, `description`, `severityReason` (why this severity), `drift` (`label`, `classification` or `structural`) and `occurrences` (every `path:line` of the same fact, as a list or one line separated by `,` or `;`); a missing `id` becomes the first free `F<n>` |
| Values | free texts in double quotes or a literal block scalar; no anchor, alias or tag; case of `verdict` and `severity` normalized |
| Ceiling | at most 20 findings; a `pass` with a blocker, high or medium finding is refused |
| Texts | brought onto one line and cut (description: 500 characters); `location` made relative to the working copy, `/`-separated, `./` dropped, its `:line` kept (a path outside the working copy stays absolute) |
| Refused answer | the lens is asked once more with the reason; a second unreadable answer stops the run with `lens-unreadable`; a resume asks again only the lenses whose answer could not be read |

### G9 read by the engine <!-- #g9-engine -->

When `test-integrity` reviews the changes, the engine also reads the patch of
the test files (source files under a `test`, `tests`, `spec` or `__tests__` folder, or named like
`test_*.py`, `*.test.ts`, `*_test.go`, `*Tests.cs`, `*IT.java`; fixtures, snapshots and testdata
left out) and journals what it finds as the lens `test-integrity#patch` (agent `skraft-engine`):
a skip or a focus added (`[Fact(Skip = …)]`, `[Ignore]`, `.skip`, `.only`, `.todo`, `xit(`, `fit(`,
`@pytest.mark.skip`/`skipif`/`xfail`, `@Disabled`, `t.Skip(`…, blocker at `path:line`), a test
file deleted (blocker), assertion lines removed with fewer added back (high). The brief of
`test-integrity` lists them so that the lens does not report them again; they go to the refuter
like a lens's.

### Refutation <!-- #refutation -->

Findings of different lenses at the same `path:line` (the path normalized as the
patch's: `./src\Checkout.cs:12` is `src/Checkout.cs:12`) with the same severity form one group.
Each group of findings, of any severity, goes once to `finding-refuter`, its label and brief naming
every lens of the group, with the inputs, skills and descriptor of those lenses (for an engine
check, the skills and descriptor of the lens it reports for). It judges by the rule of the gate the
finding cites, as the lens descriptor's gate table, those skills and their references state it; a rule no input states is no reason to refute, and makes
the finding `unverifiable`. It answers `confirmed`,
`refuted` (its `reason` cites the `path:line` it read) or `unverifiable`, and the answer applies
to every finding of the group. A refuted finding does not count; an unverifiable one does, and
so does a finding whose check was unreadable twice.

How each answer shows in a pull request: [From finding to status](./pull-request.md#finding-to-status).

### Verdict <!-- #verdict -->

A lens that answers `inconclusive` blocks the review with `lens-inconclusive`, naming each such
lens and what it noted: the work is not sent back, no finding is checked, and the run asks the
`blocked` question on the review node. Otherwise `NEEDS_REWORK` when a finding counts, else
`APPROVED`. Every finding the refuter did not refute counts, a low one too, whether its lens
answered `fail` or `pass`, so that the producer fixes every severity while the review may send its
work back. From the second pass, a finding at the place of one the refuter refuted is carried over
as refuted, and a finding new on a line the producer left as it was is a note, the only kind of
note a review sets aside: neither
counts, goes back to the producer nor reaches the `review-ceiling` question. The
findings that count go to the next brief of the phase agent, a group on one line citing each of
its lenses. When the loop back to the producer reaches its `max_visits`, the run asks a human
instead of sending the work back again: the `review-ceiling` question (`ACCEPT`, an instruction
or `STOP`) when only medium and low findings are left, the `blocked` question (an instruction or
`STOP`) while a blocker or high one is ([Tracking folder and journal](./run-journal.md)).
The summary gives the status, then the refuted findings and the notes it set aside, each cited
(`APPROVED: no finding counts; 2 refuted (consistency F1, fitness F1); 1 note (coverage F3)`,
`APPROVED: every lens passed` when no lens found anything); the progress (the pane, the workflow log) lists
under it each refuted finding with the refuter's reason and each note, then where `verdict.yaml`
is, so that a human can still have them fixed.

The table a reviewer reads: [Review table](./pull-request.md#review-table).

### Incremental re-review <!-- #incremental -->

On a later pass, a lens whose previous result was `pass` with no
finding, and whose fingerprint has not changed, is not started again: its result is journaled
again with `reused: true`. The fingerprint covers its inputs, the content of each `SKILL.md` it
reads (by skill name: moving the working copy or the plugin changes nothing), the project rule
files and the content of each changed path it reads.

From the second pass, the review compares each finding, of any severity, with those of the
last pass of the same step, before any refuter is asked. Two findings of one lens and one gate
stand at the same place when they cite the same path and the text of their lines appears exactly
once in that file at each pass (a line that moved is the same, an edited or repeated one is not);
without a line, when their location and claim are the same word for word. Each pass keeps what
the files it reviewed held in `snapshot.json`, beside its verdict.

| Finding of this pass | Becomes |
| --- | --- |
| at the place of one the last pass refuted | refuted, carried over with that reason, the refuter not asked (`review.refuted` with `carried`) |
| at the place of one the last pass did not refute | checked by the refuter as usual |
| new, from a lens, on a line the last pass read with the same text | a note: it never sends the work back (`review.noted`) |
| any other | checked by the refuter as usual |

### DISCOVER and DISCUSS verdict <!-- #backlog-verdict -->

`review-verdict.mjs` reads the lens answers and writes the review file; its exit code carries
the verdict.

| Finding | Verdict | Exit code |
| --- | --- | --- |
| at least one `blocker` finding, or a story with two G7 findings or more (DISCUSS) | `REJECTED` | 4 |
| otherwise, a finding `medium` or above, a lens `fail` or `inconclusive`, or a finding on a gate outside the phase | `NEEDS_REWORK` | 3 |
| otherwise (`low` findings only, or none) | `APPROVED` | 0 |
| malformed line or unreadable answer | — | 1 |

## See also <!-- #see-also -->

- [Phases](./phases.md)
- [The DOT workflow](./workflow-dot.mdx)
- [Agent and lens catalogue](pathname:///dashboard/)
- [Run the gates](../how-to/run-gates.md)
- [Review before review](../explanation/deep-dive/review-before-review.md)

Terms to know: **gate**, **lens**, **finding**, **BLOCKER**, **INVEST**, **walking
skeleton** — see the [glossary](./glossary.md).
