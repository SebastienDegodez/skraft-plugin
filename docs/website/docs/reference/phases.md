---
title: "Phases"
description: "Each phase from DISCOVER to PUBLISH: who drives it, inputs, outputs and their paths, agents, lenses and gates, loop-back edges and human decisions."
persona: software-engineer
---

# Phases

For each phase: what goes in, what comes out and where, who produces, who checks, and what a human decides.

The role of each phase in the journey and the choice between journeys:
[The SKRAFT pipeline](../explanation/pipeline/index.mdx). The syntax of the
workflow that chains them: [The DOT workflow](./workflow-dot.mdx).
The detail of each gate cited: [Gates](./gates.md).

## Overview <!-- #overview -->

| Phase | Plugin | Driven by | Producing agent | Checks | Human decision |
| --- | --- | --- | --- | --- | --- |
| DISCOVER | `skraft-backlog` | the agent, started by the developer | `backlog-discoverer` | 3 lenses, verdict from `review-verdict.mjs` | target repository, capacity |
| DISCUSS | `skraft-backlog` | the agent, started by the developer | `backlog-planner` | 4 lenses, verdict from `review-verdict.mjs` | — |
| RESEARCH | `skraft` | the engine | `solution-researcher` | output filled, research records | — |
| DESIGN | `skraft` | the engine | `solution-architect` | DESIGN records, structural scan, 3-lens review | `adr-ratification` |
| DISTILL | `skraft` | the engine | `acceptance-designer` | `## Scenarios` table, red commits replayed, 4-lens review | `scenario-review` |
| DELIVER | `skraft` | the engine | `software-engineer` | one green commit per scenario, replayed; gates, `review`, mutation | `mutation-plan` when mutation fails |
| PUBLISH | `skraft` | the engine | `pr-writer` | pull request prose | — |

DISCOVER and DISCUSS do not go through the engine: no journal, no command gate. RESEARCH to
PUBLISH are the phases of `workflows/pipeline.skraft.dot`; an ejected workflow may add more. In
any engine phase, a human may get the `environment` and `blocked` questions
([below](#human-questions)).

Every relative path sits under the tracking folder `.copilot-tracking/skraft-plans/<slug>/`;
`{date}` is a `YYYY-MM-DD` folder. A path that starts with `docs/` sits in the repository, outside
the tracking folder: it is the repository's durable documentation
([Durable documentation](./run-journal.md#durable-docs)).

Every agent's brief says to send what the commands it runs print to files under `logs/` and to
keep its temporary files under `.tmp/`, writing nothing under `/tmp` nor outside the working copy.
Neither folder is a document of a phase: no lens nor review gets them
([Logs](./run-journal.md#logs)).

## DISCOVER <!-- #discover -->

| | |
| --- | --- |
| Agent | `backlog-discoverer` (`user-invocable`, outside the engineering pipeline) |
| Modes | `user-assigned` (default, `assignee:@me is:open is:issue`), `artifact-driven` (terms taken from `git log` of the last 7 days), `search-based` (labels, milestone, keywords) |
| Inputs | GitHub issues (GitHub MCP tools); context: milestones, `git log` |
| Outputs | `research/{date}/triage-{date}.md`, `research/{date}/sprint-proposal.md` |
| Review | `reviews/{date}/discover-lens-<lens>-<N>.yaml` (one answer per lens), `reviews/{date}/discover-review-<N>.md` |
| GitHub effects | type, priority and effort labels; `status/ready`; never creates an issue nor edits a body |
| Cap | 20 issues per run |

| Lens | Gates |
| --- | --- |
| `discovery-completeness-lens` | G1, G2 |
| `discovery-prioritization-lens` | G3, G4 |
| `discovery-duplicate-lens` | G5, G6 |

Verdict: `node <backlog-review-lenses skill>/scripts/review-verdict.mjs --phase discover …`.
`APPROVED` ends; `NEEDS_REWORK` or `REJECTED` runs the triage again, 3 attempts at most, then the
unresolved findings are reported to the developer.

## DISCUSS <!-- #discuss -->

| | |
| --- | --- |
| Agent | `backlog-planner` (`user-invocable`, outside the engineering pipeline) |
| Required inputs | `research/{date}/triage-{date}.md`, issues carrying the triage labels |
| Context | `research/{date}/sprint-proposal.md`, `research/{date}/triage-ingest-{date}.md` (DISCOVER skipped through an upstream handoff) |
| Outputs | `plans/{date}/stories-{milestone}.md`, `plans/{date}/ac-draft-{story}.md` |
| Review | `reviews/{date}/discuss-lens-<lens>-<N>.yaml`, `reviews/{date}/discuss-review-<N>.md` |
| GitHub effects | label `status/ready` (DoR passed) or `status/needs-refinement` |
| Stop | required input missing: `missing_artefact` blocker |

| Lens | Gates |
| --- | --- |
| `planning-invest-lens` | G1, G2 |
| `planning-ac-quality-lens` | G3, G4 |
| `planning-coherence-lens` | G5, G6 |
| `planning-dor-lens` | G7, G8 |

Verdict: `review-verdict.mjs --phase discuss`, same rules and same budget as DISCOVER.

`skraft init <slug> --from-artifacts` starts an engine run in DESIGN from
`plans/{date}/stories-{milestone}.md` ([CLI](./cli.md)).

## RESEARCH <!-- #research -->

| Node | Kind | Role |
| --- | --- | --- |
| `research` | agent `solution-researcher` | the research document |

| | |
| --- | --- |
| Inputs | the story (`plans/{date}/issue-<number>.md` when the run started with `--issue`); the durable documentation under `docs/`, read first |
| Output | `research/{date}/{slug}-research.md`, pre-created from `research.template.md` |
| Allowed writes | the tracking folder only |
| `docs/` already covers the story | the research document says so and cites the files of `docs/` with `#file:`; the engine reads those citations, so a file they name must exist |
| Check | output filled: not empty, different from the template, no `{{…}}` left. Research records after each attempt: the document cites a file of the working copy as `#file:<path from the repository root>[:start[-end]]` (an external source by its URL). Each `#file:` citation — forward or back slashes, a path named once however often it is cited — names a readable file of the working copy (an absolute path, a path with a `..` segment or one in `.copilot-tracking/` is read nowhere and fails the same way), and its `start` and `end` lines sit within that file's length. A path written from a component root (`#file:src/…` for the `web` component) fails with its path from the repository root (`#file:web/src/…`), every component inside the repository that holds it named. Text without `#file:` is no citation and is never checked (`research-records`) |
| Attempts | 3 (the `max_attempts` default); then `missing-outputs`, or `research-records` when the document is there and its citations still fail |

## DESIGN <!-- #design -->

| Node | Kind | Role |
| --- | --- | --- |
| `design` | agent `solution-architect` | event model, strategic and tactical design, ADRs, consistency matrix |
| `design_review` | review | lenses `consistency`, `architecture-compliance`, `fitness` |
| `adr` | question `adr-ratification` | ratification of the `Proposed` ADRs |

| | |
| --- | --- |
| Inputs | the durable documentation under `docs/`, read first; research document; `details/{date}/structural-scan.json`, written by the engine before each attempt; story |
| Declared output | `details/{date}/consistency-matrix-{slug}.md` |
| Other outputs | in the tracking folder: `details/{date}/supersession-plan-{story}.md` (when an `Accepted` ADR is replaced); in the repository: `docs/architecture/context-map.md`, `docs/architecture/{bounded-context}.md` (tactical design), `docs/domain/event-model/{bounded-context}.md`, `docs/adr/adr-{NNN}-{subject}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| Allowed writes | the tracking folder, `docs/adr/`, `docs/architecture/` and `docs/domain/event-model/` |
| Commits | none by the architect, which has no shell: once `design` is done, the engine commits what it changed under its allowed paths as `docs(<story>): design <story>`, ending with `Refs: #<issue>` when the story has one, and journals it as `committed` on the step's `step.recorded` |
| Existing documentation | instruction to the agent: a file of `docs/` is completed, not rewritten. When `docs/` already covers the story, the consistency matrix says so and cites the files of `docs/`, and the phase moves on. Engine check: the matrix's `docs-relied-on:` line lists at least one file of `docs/adr`, `docs/architecture`, `docs/domain/event-model` or `docs/features`, or a `.feature` wherever its component keeps it, and each listed file exists in the working copy |
| Engine checks | DESIGN records after each attempt: a consistency matrix reading `consistency-gate: PASS` (G10), no ADR named `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` or `*-superseded.md` (G14), each `**Supersedes:**` with its registry row (G2, G12), the `docs-relied-on:` line of the matrix (files of the durable `docs/` folders, and the `.feature` files wherever their component keeps them, that exist); an index row for each ADR written (`design-records`); draft ADRs: `Proposed`, no version, no code file, acceptance criterion identifier, ticket or other ADR cited (only the ADR it replaces, on its `Supersedes:`/`Amends:` line), a one-sentence `decision`, no draft history; ADRs on the base: only their status lines change, `Accepted` only to `Superseded by ADR-NNN` or `Deprecated`, never deleted; a status of the closed set (`adr-lifecycle`) |
| Persistent failure | `missing-outputs` when the consistency matrix is missing after the last attempt, `design-records` otherwise |

| Lens | Gates |
| --- | --- |
| `consistency` | G1, G2, G10, G12, G14, C1 |
| `architecture-compliance` | G3, G4, G5, G6, G16 |
| `fitness` | G7, G8, G9, G11, G15, G17, G18, F1 |

| Edge | Label | `max_visits` |
| --- | --- | --- |
| `design_review -> design` | `NEEDS_REWORK` | 2 |
| `design_review -> adr` | `APPROVED` | — |
| `adr -> distill` | `RATIFIED` | — |
| `adr -> design` | `REJECTED` (reason required, sent back to the architect) | 1 |

`RATIFIED` turns each ADR `Accepted` (`status: Accepted`, `ratified_by: "human YYYY-MM-DD"`, the
`**Status:**` line, its row in `docs/adr/decisions-index.md`) and commits them alone as
`docs(adr): ratify ADR-001, ADR-002`. With no `Proposed` ADR, the question is skipped.

## DISTILL <!-- #distill -->

| Node | Kind | Role |
| --- | --- | --- |
| `distill` | agent `acceptance-designer`, `each="scenario"` | first pass: every scenario of the story, the test plan with its `## Scenarios` table, the failing acceptance test of S1 and its skeleton; then, before each next scenario is delivered, that scenario's failing acceptance test |
| `distill_review` | review | lenses `coverage`, `business-alignment`, `testability`, `boundary-enforcement`; runs once, on the first pass |
| `scenario_review` | question `scenario-review` | a human reads the scenarios and S1's acceptance test before DELIVER builds them |

| | |
| --- | --- |
| Inputs | stories, DESIGN documents (in the tracking folder and under `docs/`); from the second pass, the scenario to write (`- Scenario: k of N — "<title>" (component <c>, tags …)`) |
| Declared output | `details/{date}/test-plan-{slug}.md` |
| Other outputs | `details/{date}/impl-plan-{story}.md`; the `.feature` of the component's own folder (`bdd`), as `{bounded-context}/{feature}.feature` (Gherkin scenarios, keywords in English, not executable); in the components: the failing acceptance test of the scenario in progress (`tests` paths) and the skeleton it calls (`src` paths) |
| Brief | the scenario in progress, the exact `git commit` of its red, and the effective [infrastructure policy](./skraft-config.md#infrastructure) of each component |
| Allowed writes | the tracking folder, the features folders the components' `bdd` names, each component's `src` and `tests` paths, and the files at those components' roots |
| Commits | `red` mode, at most one per pass: `test(<story>): <scenario title>`, the acceptance test and its skeleton together (on the first pass, with the scenarios), in the scenario's component only, no `feat`, `fix` or `refactor`; replayed, a failing assertion required ([Commits and replays](./gates.md#commits)); a change to scenarios alone, outside the components' `src` and `tests` paths, in a `docs(<story>): …` commit; a change left uncommitted is refused (`uncommitted`) |
| Engine checks | where added test files sit (`testability#layout`, G11); the `## Scenarios` table of the test plan ([below](#scenarios), `scenarios`); the scenarios the test plan names (`gherkin-records`): every `.feature` cited in its coverage matrix is a file of a folder the component's `bdd` names, each of whose scenarios says Given, When and Then, fills from its examples every placeholder it opens, and is titled once in its file; and the story holds at least one scenario per acceptance criterion of its `ac-draft-{story}.md`. A coverage matrix row that names no Gherkin writes `—`, and a story whose `ac-draft` declares no criterion is asked for no scenario. The check runs only where a component declares `bdd`: one that writes its tests without Gherkin is asked for no `.feature`, and a component that decided neither way refuses the run before its first agent. The keywords are English, whatever language the sentences are in: a `.feature` declaring another language is sent back naming it |

| Lens | Gates |
| --- | --- |
| `coverage` | G1, G2 |
| `business-alignment` | G3, G4, B1 |
| `testability` | G5, G6, G11, T1, T2, T3 |
| `boundary-enforcement` | G7, G8, E1, E2 |

| Edge | Label | `max_visits` |
| --- | --- | --- |
| `distill_review -> distill` | `NEEDS_REWORK` | 2 |
| `distill_review -> scenario_review` | `APPROVED` | — |
| `scenario_review -> deliver` | `APPROVED` | — |
| `scenario_review -> distill` | `REVISE` (corrections required, sent back to the acceptance designer) | 2 |

After `APPROVED`, no edge leads the scenarios: the engine runs `deliver` on S1, then `distill` on
S2 and `deliver` on S2, and so on, each pass a visit of its own; after the last scenario,
`deliver` leaves by its edge to `gates`. A pass of `distill` after the first is not reviewed. An
interrupted run resumes on the scenario in progress.

### The `## Scenarios` table <!-- #scenarios -->

The test plan lists the scenarios in the order DELIVER builds them:

```text
## Scenarios

| # | Scenario | Component | Tags |
|---|---|---|---|
| S1 | Customer pays an order by card | api | @walking-skeleton @happy-path |
| S2 | Customer is refused an expired card | api | @error-case |

Walking skeleton exemption: none
```

| Rule | Refused with |
| --- | --- |
| no `## Scenarios` heading followed by a table with the columns `#`, `Scenario`, `Component`, `Tags` | `<plan> lists no scenario: write …` |
| ids `S1`, `S2`, … in row order | `<plan>: row <n> is not S<n>; number the scenarios S1, S2, … in the order DELIVER builds them` |
| a title on each row, never twice | `<plan>: S<n> has no title`; `<plan>: two scenarios are titled "<title>"` |
| `Component`: a component name of `skraft-config.json` | `<plan>: S<n> names component "<c>", which is none of <components>` |
| exemption `none` (default when the line is absent): S1, and S1 only, tagged `@walking-skeleton` | `<plan>: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library \| refactoring \| docs-only"` |
| the walking skeleton in a component that is not `react` | `<plan>: the walking skeleton S1 runs in a back-end component; <c> is a react front end` |
| exemption `library`, `refactoring` or `docs-only`: no scenario tagged `@walking-skeleton` | `<plan>: the story declares its walking skeleton exempt (<exemption>), and S<n> carries @walking-skeleton` |
| any other exemption | `<plan>: walking skeleton exemption "<value>" must be none, library, refactoring, docs-only` |
| `docs-only`: no commit of the story changes a component's `src` paths | `the story declares its walking skeleton exempt as docs only, and commit <sha> changes <file>, source of <component>; remove the exemption and tag S1 @walking-skeleton` |

Each failure sends the agent of the pass back with the line; after its last attempt, the run stops
with `scenarios`. Why S1 is a walking skeleton: [Walking Skeleton](../explanation/deep-dive/walking-skeleton.md).

## DELIVER <!-- #deliver -->

| Node | Kind | Role |
| --- | --- | --- |
| `deliver` | agent `software-engineer`, `each="scenario"` | makes each scenario pass in turn, one green commit each; after the last, the passes the gates or the review send back, on the whole story |
| `gates` | gates `build,format,lint,test,architecture,coverage`, `goal_gate`, `locked` | commands of the changed components, then of all |
| `deliver_review` | call `workflow="review"` | lenses `test-integrity`, `architecture-boundaries`, `cold-reader`, `mock-fidelity` (`when="mock"`), `contract-fidelity` (`when="contract"`) |
| `mutation` | gate `mutation`, `goal_gate`, `locked` | once, on the code `deliver_review` approved; bar 100 % core (Domain, Application), 80 % boundary |
| `kill_proposal` | agent `software-engineer`, `each="survivor-file"`, `proposal=true` | one dispatch per file holding surviving mutants; writes a proposal, changes no code |
| `mutation_plan` | question `mutation-plan` | the developer chooses: `APPLY`, an instruction of their own, or `STOP` |
| `kill_mutants` | agent `software-engineer`, `each="survivor-file"` | applies the choice, in one dispatch |
| `mutation_review` | review | lens `test-integrity` |
| `mutation_gates` | gates `build,format,lint,test,architecture,coverage`, `goal_gate` | runs the gates again after `kill_mutants`, before a new mutation run |
| `visuals` | publication `playwright-visuals`, `when="frontend"` | each front end's `e2e` command, screenshots committed |

| | |
| --- | --- |
| Brief on a scenario | the scenario (`- Scenario: k of N — "<title>" (component <c>, tags …)`); the acceptance tests DISTILL committed so far (`<sha> "<subject>": <files>`), which the agent never changes (a wrong one: it stops `blocked`, naming it); the commit, exactly: `<test command> && git add <each file you changed> && git commit -s -m "feat(<story>): <title>" -m "Refs: #<issue>"` |
| Declared output | `changes/{date}/change-log.md` |
| Proposals | `proposals/kill_proposal-<visit>-g<n>.md`, one per file of survivors, created by the engine with a section per mutant; each `{{outcome}}` line becomes `test: …`, `delete: …` or `equivalent: …` |
| Evidence | `gates/<component>/<gate>-<n>.log`; `visuals/<component>/e2e-<n>.log` |
| Allowed writes | `deliver`, `kill_mutants`: the tracking folder, each component's `src` and `tests` paths, and the files at their roots; `kill_proposal`: the tracking folder only, so nothing to commit; a change outside it is refused |
| Commits | `deliver` on a scenario: exactly one `feat(<story>): <scenario title>` (or `fix`), chained in bash to the test command as the brief writes it; no `test`, `refactor`, `style` or `perf` commit, the inner TDD loop staying uncommitted; no change to the scenario's acceptance tests outside the component's `src` paths, nor to another component; the engine replays the tests at it ([Commits and replays](./gates.md#commits)). `deliver` sent back by the gates or the review: each `feat` or `fix` after a `test(<story>): …` since the last green, the gate failure standing for that red on a pass the gates sent back, `refactor` allowed, reds not replayed. `kill_mutants` in `kill` mode: tests that kill mutants and pass. Each conventional message ends with `Refs: #<issue>` and closes no issue; a change left uncommitted is refused (`uncommitted`) |
| Mutation bar | 100 % on the core, 80 % on the boundary; not configurable |

| Answer to `mutation-plan` | Effect |
| --- | --- |
| `APPLY` | `kill_mutants` gets `Apply the proposals in <paths>` |
| an instruction | `kill_mutants` gets the instruction and the proposals it departs from |
| `STOP` | `run.finished` `blocked`, code `stopped` |

| Lens (`review`) | Gates |
| --- | --- |
| `test-integrity` | G7, G9; plus the G9 findings the engine reads in the patch (`test-integrity#patch`) |
| `architecture-boundaries` | G4, G5, G10 |
| `cold-reader` | G11 |
| `mock-fidelity` | M1, M2, M3, M4 |
| `contract-fidelity` | K1, K2, K3, K4, K5 |

| Edge | Label | `max_visits` |
| --- | --- | --- |
| `gates -> deliver` | `FAIL` | 3 |
| `gates -> deliver_review` | `PASS` | — |
| `deliver_review -> deliver` | `NEEDS_REWORK` | 2 |
| `deliver_review -> mutation` | `APPROVED` | — |
| `mutation -> visuals` | `PASS` | — |
| `mutation -> kill_proposal` | `FAIL` | 5 |
| `kill_proposal -> mutation_plan` | — | — |
| `mutation_plan -> kill_mutants` | `APPLY` (an instruction takes this edge too) | — |
| `mutation_review -> kill_mutants` | `NEEDS_REWORK` | 2 |
| `mutation_review -> mutation_gates` | `APPROVED` | — |
| `mutation_gates -> kill_mutants` | `FAIL` | 3 |
| `mutation_gates -> mutation` | `PASS` | — |

## PUBLISH <!-- #publish -->

| Node | Kind | Role |
| --- | --- | --- |
| `pr_writer` | agent `pr-writer` | the pull request prose |
| `publish` | publication `pull-request` | pushes the branch, opens or updates the pull request |

| | |
| --- | --- |
| Declared output | `details/{date}/pull-request-prose-{slug}.md`, pre-created from `pull-request-prose.<language>.template.md` (`en` or `fr`, the story's language) |
| Allowed writes | the tracking folder only |
| Engine check | a summary line of at most 72 characters, no empty section |
| Publication | with `publish.pullRequest` accepted: a draft pull request (unless `publish.draft: false`), described from the journal; without consent, a remote or `gh`: `pull-request.md` stays, and `skraft publish` opens it later |
| End | `run.finished` `completed`, reason `PUBLISH closed` |

## Questions to a human <!-- #human-questions -->

| Question | Asked by | Options | Refusal (reason required) | Header |
| --- | --- | --- | --- | --- |
| `adr-ratification` | node `adr` | `RATIFIED`, `REJECTED` | `REJECTED` | `ADR` |
| `scenario-review` | node `scenario_review` | `APPROVED`, `REVISE` | `REVISE` | `Scenarios` |
| `mutation-plan` | node `mutation_plan` | `APPLY`, an instruction, or `STOP` | — | `Mutation` |
| `environment` | the engine, when a step cannot run on the machine or with what `skraft-config.json` gives it, a replay included (no Docker or Podman answers, a runner that writes no report); its text names the cause and the log ([causes](./run-journal.md#environment-question)) | `RETRY`, `ABORT` | — | `Environment` |
| `blocked` | the engine, when an agent answers `blocked`, a loop reaches its `max_visits`, a gate step fails the same way 3 times since it last passed or a lens answers `inconclusive` | an instruction, or `STOP` | — | `Blocked` |
| `review-consent` | `skraft review --pr --publish` | `ACCEPTED`, `DECLINED` | — | `PR comment` |

No run asks for a publication consent: `/skraft-init` settles them before any run, in
`skraft-config.json` (`publish.pullRequest`, `publish.visuals`, each with the version of the
question it answers under `publish.questionVersions`). A run whose workflow publishes is refused
before its first agent while a consent it needs is unanswered, or answers an earlier version of
its question; `publish.visuals` is needed only when a component is a front end. Keys, answers and
journal: [Tracking folder and journal](./run-journal.md#human-questions).

## See also <!-- #see-also -->

- [The SKRAFT pipeline](../explanation/pipeline/index.mdx)
- [The DOT workflow](./workflow-dot.mdx)
- [Gates](./gates.md)
- [Tracking folder and journal](./run-journal.md)
- [Agent and skill catalogue](pathname:///dashboard/)

Terms to know: **phase**, **lens**, **gate**, **ADR**, **DoR** — see the
[glossary](./glossary.md).
