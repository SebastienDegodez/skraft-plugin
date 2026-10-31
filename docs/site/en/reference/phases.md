---
layout: doc
lang: en
title: "Phases"
description: "Each phase, from DISCOVER to PUBLISH: who drives it, its inputs, its outputs and their paths, its agents, its lenses and gates, its loop-back edges and the human decisions it asks for."
persona: software-engineer
---

# Phases

> For each phase: what goes in, what comes out and where, who produces, who checks, and what a human decides.

The role of each phase in the journey and the choice between journeys:
[The SKRAFT pipeline]({{ "/en/explanation/pipeline/" | relative_url }}). The syntax of the
workflow that chains them: [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }}).
The detail of each gate cited: [Gates]({{ "/en/reference/gates" | relative_url }}).

## Overview {#overview}

| Phase | Plugin | Driven by | Producing agent | Checks | Human decision |
| --- | --- | --- | --- | --- | --- |
| DISCOVER | `skraft-backlog` | the agent, started by the developer | `backlog-discoverer` | 3 lenses, verdict from `review-verdict.mjs` | target repository, capacity |
| DISCUSS | `skraft-backlog` | the agent, started by the developer | `backlog-planner` | 4 lenses, verdict from `review-verdict.mjs` | — |
| RESEARCH | `skraft` | the engine | `solution-researcher` | output filled | consents `publish-consent`, `reporting-consent` |
| DESIGN | `skraft` | the engine | `solution-architect` | DESIGN records, structural scan, 3-lens review | `adr-ratification` |
| DISTILL | `skraft` | the engine | `acceptance-designer` | red commits replayed, 4-lens review | — |
| DELIVER | `skraft` | the engine | `software-engineer` | TDD commits, gates, `review`, mutation | `mutation-plan` when mutation fails |
| PUBLISH | `skraft` | the engine | `pr-writer` | pull request prose | — |

DISCOVER and DISCUSS do not go through the engine: no journal, no command gate. RESEARCH to
PUBLISH are the phases of `workflows/pipeline.skraft.dot`; an ejected workflow may add more. In
any engine phase, a human may get the `environment` and `blocked` questions
([below](#human-questions)).

Every relative path sits under the tracking folder `.copilot-tracking/skraft-plans/<slug>/`;
`{date}` is a `YYYY-MM-DD` folder. A path that starts with `docs/` sits in the repository, outside
the tracking folder: it is the repository's durable documentation
([Durable documentation]({{ "/en/reference/run-journal" | relative_url }}#durable-docs)).

## DISCOVER {#discover}

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

## DISCUSS {#discuss}

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
`plans/{date}/stories-{milestone}.md` ([CLI]({{ "/en/reference/cli" | relative_url }})).

## RESEARCH {#research}

| Node | Kind | Role |
| --- | --- | --- |
| `publish_consent` | question `publish-consent` | consent to push the branch, open the pull request, comment on the issue |
| `visuals_consent` | question `reporting-consent` | consent to publish a front end's screenshots and videos |
| `research` | agent `solution-researcher` | the research document |

| | |
| --- | --- |
| Inputs | the story (`plans/{date}/issue-<number>.md` when the run started with `--issue`); the durable documentation under `docs/`, read first |
| Output | `research/{date}/{slug}-research.md`, pre-created from `research.template.md` |
| Allowed writes | the tracking folder only |
| `docs/` already covers the story | the research document says so and cites the files of `docs/`; the engine checks only that the document exists |
| Check | output filled: not empty, different from the template, no {% raw %}`{{…}}`{% endraw %} left |
| Attempts | 3 (the `max_attempts` default); then `missing-outputs` |

## DESIGN {#design}

| Node | Kind | Role |
| --- | --- | --- |
| `design` | agent `solution-architect` | event model, strategic and tactical design, ADRs, contracts, consistency matrix |
| `design_review` | review | lenses `consistency`, `architecture-compliance`, `fitness` |
| `adr` | question `adr-ratification` | ratification of the `Proposed` ADRs |

| | |
| --- | --- |
| Inputs | the durable documentation under `docs/`, read first; research document; `details/{date}/structural-scan.json`, written by the engine before each attempt; story |
| Declared output | `details/{date}/consistency-matrix-{slug}.md` |
| Other outputs | in the tracking folder: `details/{date}/contracts-{story}.md`, `supersession-plan-{story}.md` (when an `Accepted` ADR is replaced); in the repository: `docs/architecture/context-map.md`, `docs/architecture/{bounded-context}.md` (tactical design), `docs/domain/event-model/{bounded-context}.md`, `docs/adr/adr-{NNN}-{subject}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| Allowed writes | the tracking folder, `docs/adr/`, `docs/architecture/` and `docs/domain/event-model/` |
| Existing documentation | instruction to the agent: a file of `docs/` is completed, not rewritten. When `docs/` already covers the story, the consistency matrix says so and cites the files of `docs/`, and the phase moves on. Engine check: the matrix's `docs-relied-on:` line lists at least one file of `docs/adr`, `docs/architecture`, `docs/domain/event-model` or `docs/features`, and each listed file exists in the working copy |
| Engine checks | DESIGN records after each attempt: a consistency matrix reading `consistency-gate: PASS` (G10), no ADR named `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` or `*-superseded.md` (G14), each `**Supersedes:**` with its registry row (G2, G12), the `docs-relied-on:` line of the matrix (files of the durable `docs/` folders that exist); lifecycle of unpublished ADRs (`adr-lifecycle`) |
| Persistent failure | `missing-outputs` when the consistency matrix is missing after the last attempt, `design-records` otherwise |

| Lens | Gates |
| --- | --- |
| `consistency` | G1, G2, G10, G12, G14, C1 |
| `architecture-compliance` | G3, G4, G5, G6, G16 |
| `fitness` | G7, G8, G9, G11, G15, F1 |

| Edge | Label | `max_visits` |
| --- | --- | --- |
| `design_review -> design` | `NEEDS_REWORK` | 3 |
| `design_review -> adr` | `APPROVED` | — |
| `adr -> distill` | `RATIFIED` | — |
| `adr -> design` | `REJECTED` (reason required, sent back to the architect) | 3 |

`RATIFIED` turns each ADR `Accepted` (`status: Accepted`, `ratified_by: "human YYYY-MM-DD"`, the
`**Status:**` line, its row in `docs/adr/decisions-index.md`) and commits them alone as
`docs(adr): ratify ADR-001, ADR-002`. With no `Proposed` ADR, the question is skipped.

## DISTILL {#distill}

| Node | Kind | Role |
| --- | --- | --- |
| `distill` | agent `acceptance-designer` | scenarios, test plan, failing acceptance tests and skeleton |
| `distill_review` | review | lenses `coverage`, `business-alignment`, `testability`, `boundary-enforcement` |

| | |
| --- | --- |
| Inputs | stories, DESIGN documents (in the tracking folder and under `docs/`) |
| Declared output | `details/{date}/test-plan-{slug}.md` |
| Other outputs | `details/{date}/impl-plan-{story}.md`; `docs/features/{bounded-context}/{feature}.feature` (Gherkin scenarios, not executable); in the components: failing acceptance tests (`tests` paths) and the skeleton they call (`src` paths) |
| Allowed writes | the tracking folder, `docs/features/`, each component's `src` and `tests` paths, and the files at those components' roots |
| Commits | `red` mode: only failing `test(<story>): …` commits, each replayed by its component's `test` command ([`tdd.replay`]({{ "/en/reference/skraft-config" | relative_url }}#tdd)) |
| Engine check | where added test files sit (`testability#layout`, G11) |

| Lens | Gates |
| --- | --- |
| `coverage` | G1, G2 |
| `business-alignment` | G3, G4, B1 |
| `testability` | G5, G6, G11, T1, T2, T3 |
| `boundary-enforcement` | G7, G8, E1, E2 |

| Edge | Label | `max_visits` |
| --- | --- | --- |
| `distill_review -> distill` | `NEEDS_REWORK` | 3 |
| `distill_review -> deliver` | `APPROVED` | — |

## DELIVER {#deliver}

| Node | Kind | Role |
| --- | --- | --- |
| `deliver` | agent `software-engineer` | the story's code, in red / green cycles |
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
| Declared output | `changes/{date}/change-log.md` |
| Proposals | `proposals/kill_proposal-<visit>-g<n>.md`, one per file of survivors, created by the engine with a section per mutant; each {% raw %}`{{outcome}}`{% endraw %} line becomes `test: …`, `delete: …` or `equivalent: …` |
| Evidence | `gates/<component>/<gate>-<n>.log`; `visuals/<component>/e2e-<n>.log` |
| Allowed writes | `deliver`, `kill_mutants`: the tracking folder, each component's `src` and `tests` paths, and the files at their roots; `kill_proposal`: the tracking folder only, no commit |
| Commits | `deliver` in `cycle` mode: failing `test(<story>): …` (red, replayed), then `feat` or `fix` (green), `refactor`; `kill_mutants` in `kill` mode: tests that kill mutants and pass; each conventional message ends with `Refs: #<issue>` and closes no issue |
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
| `deliver_review -> deliver` | `NEEDS_REWORK` | 3 |
| `deliver_review -> mutation` | `APPROVED` | — |
| `mutation -> visuals` | `PASS` | — |
| `mutation -> kill_proposal` | `FAIL` | 5 |
| `kill_proposal -> mutation_plan` | — | — |
| `mutation_plan -> kill_mutants` | `APPLY` (an instruction takes this edge too) | — |
| `mutation_review -> kill_mutants` | `NEEDS_REWORK` | 3 |
| `mutation_review -> mutation_gates` | `APPROVED` | — |
| `mutation_gates -> kill_mutants` | `FAIL` | 3 |
| `mutation_gates -> mutation` | `PASS` | — |

## PUBLISH {#publish}

| Node | Kind | Role |
| --- | --- | --- |
| `pr_writer` | agent `pr-writer` | the pull request prose |
| `publish` | publication `pull-request` | pushes the branch, opens or updates the pull request |

| | |
| --- | --- |
| Declared output | `details/{date}/pull-request-prose-{slug}.md`, pre-created from `pull-request-prose.template.md` |
| Allowed writes | the tracking folder only |
| Engine check | a summary line of at most 72 characters, no empty section |
| Publication | with `publish.pullRequest` accepted: a draft pull request (unless `publish.draft: false`), described from the journal; without consent, a remote or `gh`: `pull-request.md` stays, and `skraft publish` opens it later |
| End | `run.finished` `completed`, reason `PUBLISH closed` |

## Questions to a human {#human-questions}

| Question | Asked by | Options | Refusal (reason required) | Header |
| --- | --- | --- | --- | --- |
| `publish-consent` | node `publish_consent` | `ACCEPTED`, `DECLINED` | — | `Pull request` |
| `reporting-consent` | node `visuals_consent` | `ACCEPTED`, `DECLINED` | — | `Reporting` |
| `adr-ratification` | node `adr` | `RATIFIED`, `REJECTED` | `REJECTED` | `ADR` |
| `mutation-plan` | node `mutation_plan` | `APPLY`, an instruction, or `STOP` | — | `Mutation plan` |
| `environment` | the engine, when a step cannot run on the machine | `RETRY`, `ABORT` | — | `Environment` |
| `blocked` | the engine, when an agent answers `blocked`, a loop reaches its `max_visits` or a lens answers `inconclusive` | an instruction, or `STOP` | — | `Blocked` |
| `review-consent` | `skraft review --pr --publish` | `ACCEPTED`, `DECLINED` | — | `Review comment` |

A consent already given in `skraft-config.json` (`publish.pullRequest`, `publish.visuals`) is not
asked again, unless the text of its question changed since (`publish.questionVersions`).
`reporting-consent` is skipped when no component is a front end. Keys, answers and journal:
[Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}#human-questions).

## See also {#see-also}

- [The SKRAFT pipeline]({{ "/en/explanation/pipeline/" | relative_url }})
- [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }})
- [Gates]({{ "/en/reference/gates" | relative_url }})
- [Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }})
- [Agent and skill catalogue]({{ "/en/dashboard/" | relative_url }})

Terms to know: **phase**, **lens**, **gate**, **ADR**, **DoR** — see the
[glossary]({{ "/en/reference/glossary" | relative_url }}).
