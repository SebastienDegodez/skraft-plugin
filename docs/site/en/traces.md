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

Everything lives under `.copilot-tracking/skraft-plans/{project-slug}/`. Each phase
writes to a dedicated subdirectory, date-stamped in `YYYY-MM-DD` format.

| Phase | Artifact | Path |
| --- | --- | --- |
| DISCOVER | Triage notes, sprint proposal | `research/{date}/{slug}-research.md` |
| DISCUSS | User stories, acceptance criteria | `plans/{date}/{slug}-plan.instructions.md` |
| DESIGN | Architecture Decision Records | `adrs/ADR-{NNN}-{slug}.md` |
| DESIGN | Supersession registry (append-only) | `adrs/supersessions.md` |
| DESIGN | Component contracts | `details/{date}/{slug}-contracts.md` |
| DISTILL | Implementation details, test plan | `details/{date}/{slug}-details.md` |
| DISTILL | Executable Gherkin scenarios | `features/{slug}.feature` |
| DELIVER | Change log | `changes/{date}/{slug}-changes.md` |
| Reviews (every phase) | Reviewer verdict and findings | `reviews/{date}/{phase}-{slug}-review.md` |

Reviewers write **exclusively** under `reviews/{date}/` — they never modify an upstream
artifact.

## Append-only: why we never overwrite

The directories `research/`, `plans/`, `adrs/`, `details/`, `changes/`, `reviews/`,
`blockers/` are **append-only**. To revise a decision, you write a *new* dated file —
never an edit of the previous one. Two consequences:

- **ADR supersession**: the superseded ADR is not edited; the new ADR carries a
  `**Supersedes:** ADR-MMM` line and a row is *appended* to the
  `adrs/supersessions.md` registry.
- **Blocker resolution**: you do not flip the blocker frontmatter; you drop a sibling
  `…-resolution.md` file. The sibling's presence = resolved.

State recovery and audit depend on this invariant: history never lies.

## Auditability

> « Specification by Example creates a single source of truth that documents what the system does. »
> — Adzic, G., *Specification by Example*, 2011.

The `features/*.feature` files play that living-source-of-truth role; combined with the
ADRs and verdicts, they make every behaviour traceable back to its justification.

## See also

- [The HVE-Core substrate](hve-core.html)
- [The pipeline overview](pipeline/)
- [Review gates](catalogue/gates.html)
