---
layout: doc
lang: en
title: "sprint-planning"
description: "Use when planning sprint content, prioritizing stories within milestones, estimating capacity, or analyzing dependenc..."
persona: tech-lead
---

# sprint-planning

> Decides sprint content: which stories enter the milestone, their MoSCoW priority, available capacity, and dependency sequencing order.

## When to use

- After DoR validation of all backlog stories (DISCUSS exit)
- To build or refine the content of a GitHub milestone
- To analyse story dependency graphs and detect DAG cycles

## Entry contract

- DoR-approved stories list from DISCUSS
- Known team size and sprint duration
- Fibonacci point estimates per story (`1`, `2`, `3`, `5`, `8`)

## Exit contract

- Stories labelled MoSCoW (`priority/must`, `priority/should`, `priority/could`, `priority/wont`)
- GitHub milestone created with title `v{major}.{minor}-{theme}`, description and due date
- Validated DAG dependency graph (cycle-free)
- Sprint capacity verified (total story-days ≤ sustainable load)

## Invariants

- **Must-Haves ≤ 60% of capacity** — no sprint overloaded with Musts
- **Should-Haves ≤ 30%** — Could-Haves fill the remainder
- **Above 8 points blocked** — a 13- or 21-point story must be split before entering the sprint
- **Cycle-free DAG** — a circular dependency blocks planning and must be resolved
- **3 to 8 stories per milestone** — outside this range, revisit scope
- **Sustainable capacity = team × duration × 0.7** — the factor accounts for meetings, PR reviews, and incidents

## Why this shape

Sprint planning answers three questions in order: What? How much? In what order? MoSCoW prioritisation explicitly separates value from comfort, and the DAG reveals the natural delivery order without arbitrary decisions.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

A well-planned sprint protects the cadence: cutting Could-Haves is a predictable decision, not an emergency.

## Allowed customisation

- Point to story-days mapping (L1)
- Sustainable capacity factor (default 0.7) (L2)
- Milestone naming convention (`v{major}.{minor}-{theme}`) (L1)

## See also

- [issue-refinement]({{ "/en/reference/skills/issue-refinement" | relative_url }}) — Story refinement (DoR)
- [issue-triage]({{ "/en/reference/skills/issue-triage" | relative_url }}) — Incoming issue triage
- [backlog-planner]({{ "/en/reference/agents/backlog-planner" | relative_url }}) — DISCUSS agent that uses this skill
