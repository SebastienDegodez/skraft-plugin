---
title: "Gates"
description: "The engine's command gates and the review criteria (Gxx and other ids) the lenses judge, per phase, with a lens's answer, the refutation and the verdict."
---

# Gates

A gate is a binary criterion written in advance: a command that exits with 0 in a traced run, or a criterion a review lens declares held or not.

Why written criteria and an independent review:
[Review before review](../explanation/deep-dive/review-before-review.md).
Where each review sits in the pipeline: [Phases](./phases.md).

## Two kinds of gates <!-- #kinds -->

| Kind | Ids | Who judges it | Where |
| --- | --- | --- | --- |
| Command gate | `build`, `format`, `lint`, `test`, `architecture`, `coverage` | the software engineer runs it through `skraft_repl`; the engine journals the signed trace and the `quality-gates` lens judges it | DELIVER, in the review |
| Review criterion | `G<n>`, and `C1`, `F1`, `B1`, `T<n>`, `E<n>`, `M<n>`, `K<n>` | a lens, then the engine (DESIGN, DISTILL, DELIVER) or `review-verdict.mjs` (DISCOVER, DISCUSS) | each phase's reviews |
| Engine check tied to a criterion | G2, G10, G12, G14 (DESIGN); G11 (`testability#layout`) (DISTILL); G9 (`test-integrity#patch`) | the engine, without a lens | after the architect's attempt; after the acceptance designer's attempt; in a review's patch |

A `G<n>` id is unique only within its phase: DESIGN's G1 is not DISTILL's G1. A lens's table, in
its agent descriptor, is the source; a lens puts the id in the `gate` field of each finding.

## Command gates <!-- #command-gates -->

The gates are a component's commands whose name is one of the six below, in
`skraft-config.json`. The engine runs none of them: in DELIVER the software engineer runs each one
through the MCP tool `skraft_repl` (`gate(name, command, { cwd })`, see [The REPL](./repl.md)), and
the engine journals the signed trace of those runs and hands it to the DELIVER review, which judges it.

| Gate | What it proves |
| --- | --- |
| `build` | the component compiles |
| `format` | the code is formatted |
| `lint` | the linter is silent |
| `test` | the whole test suite passes; the run of the commit line (the whole unfiltered suite chained to `git add` and `git commit`, label `green`) is this run |
| `architecture` | the dependency rules hold |
| `coverage` | the coverage bar holds |

`mutation` is not a gate: it is a recipe of the developer's session ([Run mutation](../how-to/run-mutation.md)).

| Rule | Detail |
| --- | --- |
| Who runs | the software engineer, through `skraft_repl`, in each component the story changed |
| Absent gate | a gate the project's documents name no command for is declared with `absent(gate, component, reason)`; `test` is never absent |
| Trace | `logs/runs/<step>-<visit>-<attempt>/runs.jsonl`, signed; one folder per attempt |
| Judgement | the `quality-gates` lens of the DELIVER review (below); the engine refuses no attempt for a run |
| Journal | `evidence.checked` with `runs: [{ run, gate, cwd, log, sha256 }]`, only when the trace reads through its signatures; the designer's run labelled `red` carries `red: true` ([Tracking folder and journal](./run-journal.md#gate-evidence)) |
| Report | the "Quality evidence" table of the pull request, the issue comment and `qa-report.md` (Gate, Folder, Run, Evidence), the Claude Code pane row `Quality evidence: build run 1, test run 4` and the Copilot canvas line |
| Thresholds | none is configurable; the mutation bar (80 on the core, 80 on the boundary) is a read-only number of the configuration view |

### Workflows that still hold a gate

A workflow ejected earlier that holds a gate node or one of its attributes is refused, one
message per attribute:

| Found in the workflow | Message |
| --- | --- |
| a node of shape `parallelogram` or a `gate` attribute | `a gate node is gone: skraft runs no gate. The software engineer runs each gate through skraft_repl, and the DELIVER review reads the traced runs of its attempt; remove the node and its PASS and FAIL edges (skraft workflow diff shows the plugin's pipeline)` |
| `goal_gate`, `locked` or `unlock` | `<attribute> is gone with the gate node: skraft runs no gate` |
| `each` or `proposal` | `<attribute> is gone with the mutation the engine ran: mutation testing is a recipe of the session (the skraft-mutation skill), not a node` |

A run in progress that points at a retired node (`gates`, `mutation`, `mutation_gates`,
`kill_proposal`, `kill_mutants`, or a step that ran gates) blocks with the code `node-retired`:
"the node X was retired: skraft runs no gate and no mutation any more ... start the story again
with the plugin's workflow".

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
| **G1** | `consistency` | Every structural commitment shown in a diagram or detected in the structural scan is decided in a source the matrix cites: the project's architecture documents, an `Accepted` ADR or a `Proposed` ADR of this pass. A missing ADR is no finding by itself. | blocker |
| **G2** | `consistency` | No two ADRs contradict each other; every row of `docs/adr/supersessions.md` has its new ADR carrying the `**Supersedes:**` line. | blocker |
| **G10** | `consistency` | The back-propagation journal of the consistency matrix explains every reconciliation rewrite. | blocker |
| **G12** | `consistency` | Every `supersession-plan-{story}.md` row has its new ADR carrying `**Supersedes:**`, and no event model or diagram still cites the superseded ADR as source of truth. | blocker |
| **G14** | `consistency` | A `Status: Rejected` ADR stands only when a story or measurable force of this batch raised the question and its Alternatives section names the option adopted instead. | blocker |
| **C1** | `consistency` | Context map, diagrams and event model name the same contexts, aggregates, commands, events and fields (the fields the event model gives each one), and each matches the research and the story. | high |
| **G3** | `architecture-compliance` | Domain and Application depend on nothing in Infrastructure or API. | blocker |
| **G4** | `architecture-compliance` | Every application interface (repository, gateway, publisher) is defined in Domain or Application, in the layer the tactical design records, never in Infrastructure. The layer is never an ADR's to record. | blocker |
| **G5** | `architecture-compliance` | Each aggregate enforces only its own invariants and refers to other aggregates by ID. | high |
| **G6** | `architecture-compliance` | The context map labels every relationship between contexts with an explicit pattern (ACL, Conformist, Shared Kernel, Partnership, Open Host Service, Published Language). | high |
| **G16** | `architecture-compliance` | Comparable interfaces share the same state, return and error shape and exposed field names, unless an ADR justifies the divergence. | high |
| **G7** | `fitness` | Every story maps to at least one Command or Query in the event model. | high |
| **G8** | `fitness` | Every Command of a business bounded context has at least one domain event for its successful outcome; Queries and front-end components (which only trigger a business context's Command) are exempt. | high |
| **G9** | `fitness` | Every aggregate, bounded context, Event Sourcing adoption or Saga traces to a story that requires it. | medium |
| **G11** | `fitness` | Every ADR adopting CQRS, Event Sourcing, Saga, eventual consistency or a service split cites an admissible force and evaluates the "do without" option. | high |
| **G15** | `fitness` | No ADR ratifies a baseline already enforced by a `clean-architecture-*` skill or an architecture test, where a repository interface lives included, nor restates what the project's documents or an `Accepted` ADR already decide. | high |
| **G17** | `fitness` | Every ADR the pass wrote decides a choice costly to undo that reaches beyond one bounded context (layer boundary, aggregate boundary crossing contexts, isolation or coupling between contexts, pattern adding complexity across contexts, cross-cutting concern) and weighs a real trade-off; a choice inside one context, a context or relationship, or a choice argued from a future need is `ADR-INFLATION`, no alternative weighed is `NON-DECISION`. | high |
| **G18** | `fitness` | Every ADR the pass wrote holds one decision at decision level: no full signature, enum values, Value Object inventory, route tree, or traceability reference (user story, PRD or requirement id), the triggering story included. A quality attribute stated with its measure as a force of the decision is allowed. A code file, an acceptance criterion, a ticket or another ADR cited outside the `Supersedes:` or `Amends:` line is refused by the engine, not by the lens. | medium |
| **F1** | `fitness` | Every quality attribute the story or research states has a design element that answers it. | high |

**Engine checks.** After each `solution-architect` attempt, without a lens
([`design-records`](./run-journal.md#statuses-and-codes)):

| Criterion | Check |
| --- | --- |
| G10 | a `consistency-matrix-<story>.md` in the tracking folder, its `consistency-gate` line reading `PASS` |
| docs-relied-on | the matrix has a `docs-relied-on:` line (comma-separated repository-relative paths, backticks allowed, `/` or `\` separators) listing at least one file under `docs/adr/`, `docs/architecture/`, `docs/domain/event-model/` or `docs/features/`, or a `.feature` wherever its component keeps it, and every listed path is a readable regular file of the working copy. A path counts only from its start (not re-rooted from `mydocs/`, an absolute path or `../docs/`), a path with a `.` or `..` segment is not listed, a trailing `:line`, `#anchor` or period is dropped, and a folder or any other file of `docs/` does not count |
| G14 | no ADR the run wrote named `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` or `*-superseded.md` |
| G2, G12 | every `**Supersedes:** ADR-MMM` of an ADR the run wrote has its row in the `docs/adr/supersessions.md` registry |
| G2 | every ADR the run wrote has its row in `docs/adr/decisions-index.md` |
| G2 | an ADR on the base branch changes only its status lines and is never deleted (`adr-lifecycle`) |

A failure sends the architect back with one line per record; after its last attempt, or two
attempts in a row refused the same way, the run asks the `blocked` question, and `STOP` ends it
with `design-records`. The consistency matrix is also DESIGN's declared output: when it is
missing, `STOP` ends it with `missing-outputs` instead.

## DISTILL <!-- #distill -->

The `distill_review` review: 4 lenses, verdict computed by the engine.

| ID | Lens | Criterion | Severity |
| --- | --- | --- | --- |
| **G1** | `coverage` | Every acceptance criterion has its own scenario; no scenario holds two criteria; no scenario lacks a source criterion; every business value in a scenario equals its criterion's. | blocker |
| **G2** | `coverage` | Every business rule has its boundary conditions and negative or error cases from the story's examples; a Gherkin mapping or example written in a DESIGN document is no story example, and a variant an earlier rule already decides adds no boundary; a technical input case is never asked for. | high |
| **G3** | `business-alignment` | Every term in Given/When/Then steps comes from the story's domain vocabulary; no class, method or framework name. | high |
| **G4** | `business-alignment` | No step carries an implementation detail (HTTP verb or status, ORM or database term, `Repository`, `Service`, `Handler`, `Controller`, `UseCase`, technical input case). | blocker |
| **B1** | `business-alignment` | Every scenario expresses an outcome the story asks for; none describes behaviour it does not ask for. | high |
| **G5** | `testability` | Every step is unambiguous and implementable on its own. | high |
| **G6** | `testability` | Every scenario has an entry in the implementation plan; its group table names each scenario of the test plan once, none the table does not list, S1 in group 1; no two rows of the test plan share a title. | high |
| **G11** | `testability` | Each test lives where its kind puts it: the walking skeleton, a plain test with no Gherkin, in its component's integration-test place (Java: an `*IT` class), entering through the real entry point; the acceptance test of every scenario, S1 included, the binding of its Gherkin, in its language's unit-test place (.NET: the `<Context>.UnitTest`, `<Context>.UnitTests` or `<Context>.Tests` project; Java: a `*Test` class under a module's `src/test`, or a `-unit-test(s)` module; Python, TypeScript, JavaScript, React: `<test path>/unit/`), entering through the use case. | blocker |
| **T1** | `testability` | Each scenario and test checks one behaviour through an observable outcome and depends on no time, order or randomness it does not fix. | high |
| **T2** | `testability` | The patch holds the walking skeleton (unless the story is exempt) and the acceptance test of every scenario, each name starting with its scenario's number; a scenario with no test, or a skipped test, is a finding. Every input and expected value each acceptance test holds equals the `.feature` verbatim; the walking skeleton asserts the status, the shape and one value S1 names, and no value the `.feature` lacks. | blocker |
| **T3** | `testability` | The walking skeleton and the acceptance test of the scenario in progress exist and each fails on an assertion, not on a compile, import or setup error; the patch's production code is a skeleton whose signatures answer the empty value of their type, with, for the walking skeleton, the entry point, ports and adapters of its chain wired in the composition root. | blocker |
| **T4** | `testability` | Well-formed Gherkin: every `.feature` the test plan cites exists under a folder its component's `bdd` names; each scenario says Given, When and Then; an outline's `Examples` fill every placeholder; no two scenarios of a file share a title; keywords in English. | blocker |
| **G7** | `boundary-enforcement` | Every scenario in the test plan targets an Application use case the event model names (one of its Commands or Queries); an implementation-plan step that writes no scenario's acceptance test (an API or HTTP test of a later circle) is out of its scope. | blocker |
| **G8** | `boundary-enforcement` | The story has a walking skeleton walking S1, tagged `@walking-skeleton`, in a back-end component: a plain test with no Gherkin that drives the real entry point through the use case to the real internal gateways, S1 keeping its own acceptance test beside it; or the declared exemption (`library`, `refactoring`, `docs-only`) holds and the story's changes bear it out; S1 alone is tagged `@walking-skeleton`. | blocker |
| **E1** | `boundary-enforcement` | The acceptance test of every scenario, S1 included, drives only its use case; the walking skeleton drives only the real entry point. Neither calls or asserts on a domain internal, a repository or an infrastructure class. Constructing the use case's real collaborators to hand them to its constructor, or the walking skeleton's test host and containers, is wiring, not a finding. | blocker |
| **E2** | `boundary-enforcement` | Test doubles replace only outer-edge dependencies, never a domain object or the use case; DISTILL's skeleton is the real module. | high |

**Engine check.** G11: the engine reads where the patch adds test files and reports, under the
lens `testability#layout` (severity blocker), a test added outside the stack's unit and
integration places, and a component that gains tests with none in its unit place. A test counts
only under a test path the component configures (`paths.tests`); a test path that is itself a
place counts as it (`tests/unit`, `tests/Orders.UnitTests`). .NET names its places
`<Context>.UnitTest(s)`, `<Context>.Unit.Tests` or `<Context>.Tests` and
`<Context>.IntegrationTest(s)` or `<Context>.Integration.Tests`; Java follows the Maven convention,
under a module's `src/test` a `*IT` class (Failsafe) is integration and any other test (Surefire
`*Test`, Cucumber) unit, and accepts `<context>-unit-test(s)` and `<context>-integration-test(s)`
modules too; any other stack `unit/` and `integration/` under the test path.

**The scenarios table.** After each attempt of the plan pass, the engine reads the `## Scenarios`
table of the test plan and refuses it (`scenarios`) only when it cannot read it: no table, rows not
numbered S1, S2… in order, a row with no title, a row naming no component of `skraft-config.json`
([rules and messages](./phases.md#scenarios)). The walking-skeleton tag, the exemption, duplicate
titles and the group table are the lenses' to judge (G8, G6); acceptance-criteria coverage (G1) and
the form of the Gherkin (T4) are the lenses' too: the engine checks neither.

The review runs once, after the pass: the tests hold the walking skeleton and the acceptance test
of every scenario (T2, T3). The engine runs none of these tests: the review reads the tests, the skeleton and the designer's
run log, which shows each test failing on its assertion. The greens of DELIVER are not reviewed by
these lenses; the DELIVER review reads them.

## DELIVER <!-- #deliver -->

DELIVER goes through the software engineer's traced gate runs, then the `deliver_review` call of the `review` workflow, whose `quality-gates` lens reads those runs.
The same lenses judge
a pull request through `skraft review --pr`.

| ID | Lens | Criterion | Severity |
| --- | --- | --- | --- |
| **G7** | `test-integrity` | No test theater: every test can fail when the behaviour it names breaks. | blocker |
| **G9** | `test-integrity` | No test changed to pass: no weakened assertion, no deleted test, no skip or focus added, no acceptance value that drifted from the `.feature`. | blocker |
| **G4** | `architecture-boundaries` | No test double on a Domain or Application type in a unit test. | blocker |
| **G5** | `architecture-boundaries` | Dependencies point inward: Domain → nothing, Application → Domain, API and Infrastructure → Application; skipped for a component whose `architecture` gate has a passing traced run in this attempt. | blocker |
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
| **Q1** | `quality-gates` | Each gate of a touched component has a run line in the trace, or an `absent` line with a reason (never for `test`); a start with no run and a lost run are no run. | blocker |
| **Q2** | `quality-gates` | The last run of the gate passed: not killed, not timed out, exit 0. | blocker |
| **Q3** | `quality-gates` | That run ended on the final commit of the change log. | blocker |
| **Q4** | `quality-gates` | That run started on a clean tree; the commit line's `green` run is the one exception. | high |

`quality-gates` reports nothing on a pull request reviewed outside a run: it has no trace.
`mock-fidelity` runs only on changes that touch mocks (`when="mock"`), `contract-fidelity` only on
changes that touch contracts (`when="contract"`)
([triggers](./workflow-dot.mdx#conditional-lenses)).

The engine also checks, with no gate id, the commits of each attempt (`commits.checked`):
[Commits](#commits).

## Commits <!-- #commits -->

The engine runs no test to check a commit: it judges the Git history alone, every commit of an
attempt in its order; a commit refused stays refused until it leaves the history. The brief gives
the exact message of the red and of the green.

| Type | Kind | Rule |
| --- | --- | --- |
| `test` | red | a failing test of a component (`no-component` otherwise) |
| `feat`, `fix` | green | the code that makes it pass |
| `refactor`, `style`, `perf` | refactor | a change under green |
| `docs`, `chore`, `build`, `ci`, `revert` | other | outside TDD: changes no file of a component's `src` or `tests` paths (`outside-tdd`) |
| anything else | invalid | `not-conventional` |

Every message ends its body with `Refs: #<issue>` when the story has one (`issue-reference-missing`),
cites no other issue (`issue-not-in-story`) and closes none (`issue-closed`).

| Pass | Allowed | Refused |
| --- | --- | --- |
| `distill`, plan pass | one red holding the walking skeleton, the acceptance test of every scenario and the skeleton they call, in the components the scenarios name, and the `.feature` of those components; none for a story exempt of a walking skeleton and tests; `.feature` and Markdown files go with it or in a `docs` commit, wherever they live | a second red (`oracle-split`); a red in a component no scenario names (`oracle-component`); a red with no file of the component's test paths (`oracle-without-test`); a green or refactor (`code-in-oracle`); none at all |
| `deliver`, the story's pass | one green, for the whole story, whatever its subject names, chained: `<test command> && git add <files> && git commit …` in sh or PowerShell 7, `<test command>; if ($?) { git add <files>; if ($?) { git commit … } }` in Windows PowerShell 5.1; the groups of the implementation plan are the order of work, not a count of commits; a change to another component a group needs is accepted and journaled under `green.others` | a red (`test-in-scenario`); a refactor (`refactor-in-scenario`); a second green (`green-split`: squash it into the first); a change to a file of the acceptance-test commit, the walking skeleton's included, outside the component's `src` paths (`oracle-touched`); none at all |
| `deliver` sent back by the review, after the story's pass | on the whole story, each cycle one green holding its test and its code, once it passes; refactors | a red (`test-apart`: squash it into its green); a green with no file of a component's test paths (`green-without-test`); a change to a file of the acceptance-test commit (`oracle-touched`) |

Whether a red fails on an assertion is read, not run: the acceptance designer runs the walking
skeleton and the acceptance tests once through `skraft_repl` with the label `red`, the engine
journals that traced run (`evidence.checked` with `red`), and the DISTILL review (T3) and the human
read its log under `logs/runs/` ([Logs](./run-journal.md#logs)). Whether the green
makes the story pass is the command that commits it: chained with `&&`, it commits only when the
tests pass. A file the tests write in the working copy (a test report) is a change like any other,
held to the write scope: list it in `.gitignore`. A machine that cannot run a command (a program not
installed, a container runtime that does not answer) is an agent's block, which the `environment`
question hands to a human.

A run of an earlier V2 alpha stopped in DELIVER between two groups, whose journal holds one
dispatch per group, is refused at its resume with code `delivery-shape` and the fixed reason
"this run was started by an engine that delivered one group per pass; start the story again".

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
| Keys | only `lens`, `verdict`, `findings`; per finding `id`, `gate`, `severity`, `location`, `description`, `suggestion`, `severityReason`, `drift`, `occurrences`; any other key refuses the answer; a key wrapped in or followed by quotes, backticks or parentheses (`"verdict": fail`, `severityReason"": "…"`) or written as a call (`severityReason("…")`) is read as the key inside, the refuter's answers too |
| Required | `gate`, `description`, `severityReason` (why this severity), `drift` (`label`, `classification` or `structural`) and `occurrences` (every `path:line` of the same fact, as a list or one line separated by `,` or `;`); a missing `id` becomes the first free `F<n>` |
| Values | free texts in double quotes or a literal block scalar; no anchor, alias or tag; case of `verdict` and `severity` normalized |
| Ceiling | at most 20 findings; a `pass` with a blocker, high or medium finding is refused |
| Texts | brought onto one line and cut (description: 500 characters); `location` made relative to the working copy, `/`-separated, `./` dropped, its `:line` kept (a path outside the working copy stays absolute) |
| Refused answer | the lens is asked once more with the reason; a second unreadable answer is an unforeseen incident: the run waits on the `unforeseen` question, its reason in `logs/incident-<step>-<signature>.log`; a retry asks again only the lenses whose answer could not be read |

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
