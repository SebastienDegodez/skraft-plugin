---
description: "SKRAFT artifact path conventions aligned with HVE-Core dated subdirectories"
applyTo: '**/.copilot-tracking/skraft-plans/**'
---
<!-- markdownlint-disable-file -->

# SKRAFT Artifact Path Conventions

These conventions define where every SKRAFT phase agent and reviewer writes its output. They mirror the dated-subdirectory layout used by all HVE-Core planners.

## Namespace root

All SKRAFT artifacts for a single pipeline run live under:

```
.copilot-tracking/skraft-plans/{project-slug}/
```

`{project-slug}` is the kebab-case identifier recorded in `state.json::projectSlug`.

## Phase → subdirectory mapping

Each phase writes to a phase-specific subdirectory. Date-stamped directories use the ISO format `YYYY-MM-DD`.

| Phase | Artifact | Path |
|---|---|---|
| DISCOVER | Triage notes, sprint proposal, evidence | `research/{YYYY-MM-DD}/{slug}-research.md` |
| DISCUSS | User stories, acceptance criteria draft | `plans/{YYYY-MM-DD}/{slug}-plan.instructions.md` |
| DESIGN | Architecture Decision Records | `adrs/ADR-{NNN}-{slug}.md` |
| DESIGN | Component contracts, interface sketches | `details/{YYYY-MM-DD}/{slug}-contracts.md` |
| DISTILL | Implementation details, test plan | `details/{YYYY-MM-DD}/{slug}-details.md` |
| DISTILL | Executable Gherkin scenarios | `features/{slug}.feature` |
| DELIVER | Change log, commit summary | `changes/{YYYY-MM-DD}/{slug}-changes.md` |
| Reviews (every phase) | Reviewer verdict and findings | `reviews/{YYYY-MM-DD}/{phase}-{slug}-review.md` |

`ADR-{NNN}` uses a three-digit zero-padded sequence number unique within the project. `features/` is not date-stamped because Gherkin scenarios are long-lived and may evolve across runs.

## Append-only directories

The following directories are **append-only**. Existing files must never be modified by a later phase or run:

* `research/`, `plans/`, `adrs/`, `details/`, `changes/`, `reviews/`

When an artifact needs revision, write a new dated file rather than editing the prior one. State recovery and audit depend on this invariant.

## Reviewer write-isolation

Reviewers (`backlog-discoverer-reviewer`, `backlog-planner-reviewer`, `solution-architect-reviewer`, `acceptance-designer-reviewer`, `software-engineer-reviewer`) write **only** to `reviews/{YYYY-MM-DD}/`. They never modify upstream phase artifacts. Their verdict is communicated through:

1. The file written under `reviews/{YYYY-MM-DD}/`.
2. The corresponding entry in `state.json::reviewerVerdicts[phase]` (updated by the orchestrator, not by the reviewer itself).

## Markdown header requirement

Every markdown file written anywhere under `.copilot-tracking/skraft-plans/` must begin with the following header on its very first line:

```
<!-- markdownlint-disable-file -->
```

This matches the HVE-Core convention for agent-generated tracked content.

## Cross-references to neighbor planners

When a SKRAFT pipeline interoperates with a sibling HVE planner (Security, RAI, SSSC), the linked plan file is recorded in `state.json::neighborPlanners.*`. SKRAFT artifacts referencing a neighbor's output use the path relative to the workspace root (for example `.copilot-tracking/security-plans/{slug}/security-plan.md`). SKRAFT never writes into a neighbor planner's directory.
