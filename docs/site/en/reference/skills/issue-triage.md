---
layout: doc
lang: en
title: "issue-triage"
description: "Use when triaging GitHub issues by assigning labels, priority, effort estimates, or detecting duplicates. Covers tria..."
persona: tech-lead
---

# issue-triage

> Assigns structured metadata to GitHub issues (type, priority, effort, duplicates) to enable the DISCUSS phase to refine them in priority order.

## When to use

- Classifying newly created GitHub issues (`status/needs-triage`)
- Assigning type, priority, and effort labels to an issue
- Detecting duplicates and related issues
- Building a sprint proposal with calculated capacity
- Flagging issues above 8 points that must be split before entering DISCUSS

## Entry contract

- List of GitHub issues with title and description
- Access to the `mcp_github_issue_write` MCP tool to apply labels

## Exit contract

- Triage table with: number, title, type, priority, effort, notes
- Labels applied to each issue: `type/*`, `priority/*`, `effort/*`, `status/ready` or `status/duplicate`
- Sprint proposal with calculated capacity
- "Must split" notes for every `effort/13` or `effort/21` issue

## Invariants

- **Triage is classification, not refinement** — Acceptance criteria are not written here
- **Every triaged issue must have** a type, a priority, and an effort before `status/ready`
- **P0 requires written justification** — Notes field mandatory: reason, impact, date
- **Above 8 points must be flagged** — Any `effort/13` or `effort/21` issue blocks entry to DISCUSS without a splitting plan
- **Fixed label taxonomy** — `type/feature`, `type/bug`, `type/tech-debt`, `type/docs`, `type/question` for types; `priority/P0–P3` for priority; `effort/1`, `effort/2`, `effort/3`, `effort/5`, `effort/8`, `effort/13`, `effort/21` for effort

## Why this shape

Triage establishes a classification discipline before any refinement work. Separating classification (DISCOVER) from refinement (DISCUSS) avoids wasting energy refining low-priority issues or duplicates. The priority decision tree (P0 → P1 → P2 → P3) guarantees consistency across teams.

> « Triage is classification, not refinement. You are labeling, prioritizing, and estimating to enable the next phase. »

Duplicate detection via title normalisation (lowercase, stop-word removal, alphabetical sort, overlap ratio) reduces backlog noise without losing the context of original issues.

## Allowed customisation

- Area labels (`area/*`) (L1)
- Similarity thresholds for duplicate detection (L2)
- Effort-to-days conversion for sprint capacity (L2)

## See also

- [github-search-protocol]({{ "/en/reference/skills/github-search-protocol" | relative_url }}) — Issue discovery before triage
- [issue-refinement]({{ "/en/reference/skills/issue-refinement" | relative_url }}) — DISCUSS phase: transformation into user stories after triage
- [discovery-review-criteria]({{ "/en/reference/skills/discovery-review-criteria" | relative_url }}) — Gates G1–G6 that evaluate triage quality
- [backlog-discoverer]({{ "/en/reference/agents/backlog-discoverer" | relative_url }}) — DISCOVER agent that uses this skill
