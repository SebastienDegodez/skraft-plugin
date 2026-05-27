---
layout: default
lang: en
title: "backlog-discoverer"
persona: tech-lead
---

# backlog-discoverer

> Discovers and triages GitHub issues to feed the pipeline with prioritised work items.

## When to use

- DISCOVER phase of the pipeline
- When a user assigns an issue or a milestone
- Automatic trigger via the orchestrator

## Entry contract

- Assigned GitHub issue or milestone identifier
- Access to the GitHub repository (labels, issues, history)

## Exit contract

- Triage report with labels, priority, and effort estimate
- Artifact written to the pipeline tracking directory

## Invariants

- **Single-issue scope** — Processes one issue at a time, never batched
- **Evidence-based triage** — Every decision (label, priority, effort) is backed by observable data
- See [Customisation](/en/customisation) for the full list

## Why this shape

The discoverer applies explicit review criteria for every triage decision. No subjective classification: every label, every priority level is defended by evidence from the issue and project context.

> « Define explicit review criteria before the review begins. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Single-issue scope (one issue = one cycle) prevents the batching that dilutes attention and produces superficial triages.

> « The best XP teams treat scope, time, cost, and quality as variables to be consciously managed. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

## Allowed customisation

- Priority criteria and label taxonomy (L1)
- Analysis depth (quick vs thorough) (L2)
- Triage report template (L1)

## See also

- [backlog-discoverer-reviewer](/en/reference/agents/backlog-discoverer-reviewer) — DISCOVER artifact review
- [Pipeline DISCOVER](/en/pipeline/discover) — Phase description
- [backlog-planner](/en/reference/agents/backlog-planner) — Next phase (DISCUSS)
