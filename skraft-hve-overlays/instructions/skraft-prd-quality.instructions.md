---
description: "Imposes SKRAFT INVEST/testability story-quality rigor on HVE PRD artifacts (FR-/NFR- quality, traceability)"
applyTo: '**/.copilot-tracking/prd-sessions/**, **/docs/prds/**'
---
<!-- markdownlint-disable-file -->
<!-- PORTABILITY: overlay carried by the skraft-hve-overlays plugin. `applyTo:` above is
     Copilot auto-load metadata (belt): it attaches to HVE PRD artifacts. On harnesses
     without path-scoped auto-load (e.g. Claude Code), read this file on demand when working
     under those paths (suspenders). Harness-neutral. Skills resolve only if the `skraft`
     plugin is installed. -->

# SKRAFT PRD Story-Quality Overlay

Applies when working on HVE PRD artifacts (PRD sessions, `docs/prds/`).

## Imposed rigor (fail-closed)

- Before finalizing a PRD under these artifacts you **MUST** load and apply the SKRAFT `issue-refinement` skill:
  - every functional requirement (`FR-`) is INVEST-compatible and testable;
  - every non-functional requirement (`NFR-`) is measurable;
  - each requirement carries a traceable `FR-`/`NFR-` ID.
- A PRD **CANNOT** be marked ready if a requirement is ambiguous, untestable, missing a traceable ID, or is a disguised solution (antipattern) — **block** and list the exact gaps.

## Coexistence

- HVE's own PRD format (17 sections, `FR-`/`NFR-` IDs) remains the structural authority. `issue-refinement` **adds** the INVEST/testability/antipattern checks on top; it does not replace the HVE PRD template.
