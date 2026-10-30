---
layout: doc
lang: en
title: "Traces & auditability"
description: "The dated tree of SKRAFT artifacts: what each phase writes, where, and why the pipeline is auditable."
---

# Traces & auditability

> Every phase leaves a written, dated, immutable trace. In the end the pipeline is not
> a black box: every decision can be replayed from the files it dropped.

## Why trace

A pipeline that leaves only final code is impossible to audit: you cannot tell *why* a
decision was made, nor *who* validated it. By writing each artifact as the phases
unfold, SKRAFT makes the reasoning verifiable — for human review, for compliance, and
for resuming after an interruption.

## The dated tree

Everything lives under `.copilot-tracking/skraft-plans/{slug}/`, in the working copy that
starts the run. A phase's documents go in a subfolder dated `YYYY-MM-DD`; the engine gives
the agent the path of each expected output, and pre-creates it when it has a template.

| Phase | Artifact | Path |
| --- | --- | --- |
| DISCOVER (skraft-backlog) | Triage report, sprint proposal | `research/{date}/triage-{date}.md`, `research/{date}/sprint-proposal.md` |
| DISCUSS (skraft-backlog) | Stories, acceptance-criteria drafts | `plans/{date}/stories-{milestone}.md`, `plans/{date}/ac-draft-{story}.md` |
| RESEARCH | Research document | `research/{date}/{slug}-research.md` |
| DESIGN | Context map, then the event model, diagrams, contracts and consistency matrix beside it | `details/{date}/context-map.md`, `details/{date}/consistency-matrix-{story}.md`… |
| DESIGN | Architecture Decision Records (in the repository, outside the tracking folder) | `docs/adr/adr-{nnn}-{subject}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| DISTILL | Test plan | `details/{date}/test-plan-{slug}.md` |
| DISTILL | Executable Gherkin scenarios | `features/{context}-{feature}.feature` |
| DELIVER | Change log | `changes/{date}/change-log.md` |
| DELIVER | Evidence of each gate | `gates/{component}/{gate}-{n}.log` |
| PUBLISH | Pull request prose and description | `details/{date}/pull-request-prose-{slug}.md`, `pull-request.md` |
| DESIGN, DISTILL, DELIVER reviews | The lenses' inputs and the verdict the engine writes | `reviews/{node}-{visit}/verdict.yaml` |
| Whole run | Chained journal, reports recomputed after each step | `events.jsonl`, `run-report.md`, `qa-report.md`, `WORKFLOW.md` |

Lenses write no file: they return findings, and the engine writes
`reviews/{node}-{visit}/verdict.yaml`. Each file is detailed in the
[tracking folder reference]({{ "/en/reference/run-journal" | relative_url }}).

## What is never overwritten

The `events.jsonl` journal only grows: each line carries the hash of the previous one, and an
edited line breaks the chain, which the engine sees on its next read. The run state is
recomputed from this journal; no state file is rewritten.

For ADRs, the rule depends on whether they are published:

- **ADR not on the base branch yet**: it is fixed in place, stays `Proposed`, and the engine
  refuses a history of drafts (git already keeps it).
- **Published ADR**: it is not edited; the new ADR carries a `**Supersedes:** ADR-MMM` line
  and a row is *appended* to the `docs/adr/supersessions.md` registry. The engine checks this
  registry at the end of DESIGN.

Resume and audit depend on these invariants: history never lies.

## Auditability

> « Specification by Example creates a single source of truth that documents what the system does. »
> — Adzic, G., *Specification by Example*, 2011.

The `features/*.feature` files play that living-source-of-truth role; combined with the
ADRs and verdicts, they make every behaviour traceable back to its justification.

## See also

- [State and recovery]({{ "/en/explanation/hve-core" | relative_url }})
- [The pipeline overview]({{ "/en/explanation/pipeline/" | relative_url }})
- [Review gates]({{ "/en/reference/gates" | relative_url }})
