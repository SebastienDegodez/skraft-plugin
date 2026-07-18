---
description: "Imposes SKRAFT INVEST/DoR story-quality rigor on HVE backlog artifacts"
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
- A story **CANNOT** be marked ready if any INVEST dimension or DoR item is unmet — **block** and list the exact gaps.

## Coexistence

- HVE's own story-quality conventions remain the prose authority. `issue-refinement` **adds** the INVEST/DoR structure and antipattern checks on top; it does not replace HVE rules.
