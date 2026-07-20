---
description: "Imposes SKRAFT INVEST/DoR story-quality, triage and planning-review rigor on HVE backlog artifacts"
applyTo: '**/.copilot-tracking/workitems/**, **/.copilot-tracking/github-issues/**, **/.copilot-tracking/jira-issues/**'
---
<!-- markdownlint-disable-file -->
<!-- PORTABILITY: overlay carried by the skraft-hve-overlays plugin. `applyTo:` above is
     Copilot auto-load metadata (belt): it attaches to HVE backlog artifacts. On harnesses
     without path-scoped auto-load (e.g. Claude Code), read this file on demand when working
     under those paths (suspenders). Harness-neutral. Skills resolve only if the `skraft`
     plugin is installed. -->

# SKRAFT Backlog Story-Quality Overlay

Applies when working on HVE backlog artifacts (ADO work items, GitHub issues, Jira issues).

## Imposed rigor (fail-closed)

- Before finalizing any story under these artifacts you **MUST** load and apply the SKRAFT `issue-refinement` skill (INVEST, Definition of Ready 8-item gate, story-splitting, antipatterns).
- You **MUST** also apply `issue-triage` — assign type / priority / effort classification and flag duplicates before the item is considered triaged.
- You **MUST** self-check the item against `planning-review-criteria` (INVEST quality, AC quality, planning coherence, DoR compliance) — the same gates the DISCUSS reviewer applies.
- A story **CANNOT** be marked ready if any INVEST dimension or DoR item is unmet, if it is untriaged, or if a planning-review gate fails — **block** and list the exact gaps.

## Coexistence

- HVE's own story-quality conventions remain the prose authority. `issue-refinement`, `issue-triage` and `planning-review-criteria` **add** the INVEST/DoR structure, classification and gate checks on top; they do not replace HVE rules.
