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
| DESIGN | Architecture Decision Records (project-global — see note) | `docs/adr/adr-{NNN}-{slug}.md` |
| DESIGN | ADR supersession registry (append-only) | `docs/adr/supersessions.md` |
| DESIGN | Component contracts, interface sketches | `details/{YYYY-MM-DD}/{slug}-contracts.md` |
| DESIGN | Consistency matrix (Phase 9 output) | `details/{YYYY-MM-DD}/consistency-matrix-{story}.md` |
| DESIGN | Supersession plan (Phase 3.5 output, when non-empty) | `details/{YYYY-MM-DD}/supersession-plan-{story}.md` |
| DESIGN | Human-escalation blocker (Phase 9 HALT) | `blockers/{YYYY-MM-DD}/decision-drift-{story}-{NNN}.md` |
| DESIGN | Human resolution of a blocker (sibling file) | `blockers/{YYYY-MM-DD}/decision-drift-{story}-{NNN}-resolution.md` |
| DISTILL | Implementation details, test plan | `details/{YYYY-MM-DD}/{slug}-details.md` |
| DISTILL | Executable Gherkin scenarios | `features/{slug}.feature` |
| DELIVER | Change log, commit summary | `changes/{YYYY-MM-DD}/{slug}-changes.md` |
| Reviews (every phase) | Reviewer verdict and findings | `reviews/{YYYY-MM-DD}/{phase}-{slug}-review.md` |

ADRs are **project-global institutional memory**: they do NOT live under the per-run `skraft-plans/{project-slug}/` namespace but in the repository's `docs/adr/` directory, committed alongside the code. The filename is lowercase `adr-{NNN}-{slug}.md` where `{NNN}` is a three-digit zero-padded sequence number unique across the whole project (the in-text identifier `ADR-{NNN}` stays uppercase). `docs/adr/` is itself append-only with its own supersession registry — see below. `features/` is not date-stamped because Gherkin scenarios are long-lived and may evolve across runs.

## Append-only directories

The following directories are **append-only**. Existing files must never be modified by a later phase or run:

* `research/`, `plans/`, `details/`, `changes/`, `reviews/`, `blockers/` (per-run, under `skraft-plans/{project-slug}/`)
* `docs/adr/` — project-global, outside the run namespace, also append-only

When an artifact needs revision, write a new dated file rather than editing the prior one. State recovery and audit depend on this invariant.

### Supersession registry (`docs/adr/supersessions.md`)

Because `docs/adr/` is append-only, the **superseded ADR's body is never edited** when a new decision replaces it. Instead, the new ADR carries a body line `**Supersedes:** [ADR-MMM](./adr-MMM-{slug}.md) — {reason}`, AND the registry file `docs/adr/supersessions.md` is **appended** with a row:

```markdown
| date | superseded ADR | new ADR | reason |
|---|---|---|---|
| {YYYY-MM-DD} | ADR-MMM | ADR-NNN | {one-line reason} |
```

The registry is itself append-only — entries are added, never removed or edited. Reviewers reconstruct the supersession graph by reading both the registry and every `**Supersedes:**` body line.

### Blocker resolution (sibling-file pattern)

Because `blockers/` is append-only, the **blocker file's frontmatter is never flipped** to record resolution. Instead, the human (or orchestrator on the human's behalf) writes a sibling file `decision-drift-{story}-{NNN}-resolution.md` next to the blocker. The persona detects "resolved" by file presence — sibling `-resolution.md` exists ⇒ resolved.

## Reviewer write-isolation

Reviewers (`backlog-discoverer-reviewer`, `backlog-planner-reviewer`, `solution-architect-reviewer`, `acceptance-designer-reviewer`, `software-engineer-reviewer`) write **only** to `reviews/{YYYY-MM-DD}/`. They never modify upstream phase artifacts. They never write to `blockers/` — blocker creation is a `solution-architect` persona responsibility (Phase 9 HALT), not a reviewer responsibility. Their verdict is communicated through:

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
