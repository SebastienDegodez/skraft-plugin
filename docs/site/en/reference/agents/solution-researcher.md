---
layout: doc
lang: en
title: "solution-researcher"
persona: tech-lead
---

# solution-researcher

> Investigates a codebase and external sources to produce a verified, cited research document BEFORE any design or code is written.

## When to use

- RESEARCH phase of the pipeline (first phase dispatched by the orchestrator)
- Before any architecture decision or ADR is written
- Trigger: dispatch by the orchestrator, or directly on 'research', 'investigate', 'spike', 'prior art', 'evidence before building'

## Entry contract

- Refined and approved story (DISCUSS validated), or a topic to investigate
- Existing codebase and instruction files (`.github/copilot-instructions.md`, relevant instructions)
- Optional: prior research already present under `.copilot-tracking/skraft-plans/{projectSlug}/research/`

## Exit contract

- One research document: `.copilot-tracking/skraft-plans/{projectSlug}/research/{date}/{slug}-research.md`
- Document includes: scope, assumptions, evaluated approaches, ONE recommended approach with evidence, handoff surface for DESIGN

## Invariants

- **Research only** — writes exclusively to `research/{date}/`; never to `plans/`, `adrs/`, source, or tests
- **Evidence over assertion** — every finding cites a workspace-relative file path with line range, or an external URL
- **No design, no decisions of record** — surfaces alternatives and a recommended approach; the DESIGN phase owns ADRs
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

The researcher produces truth, not plausible code. Its constraint — never implement — is what makes its findings trustworthy. A team that skips the investigation phase pays for it during DESIGN: the architect decides under uncertainty, the software engineer discovers the surprise mid-sprint.

> « Prototype to learn. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

Gathering evidence before committing to an approach delays the decision to the last responsible moment, when information is richest.

> « We should minimize the cost of decisions by making them at the last responsible moment, when we have the most information. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

## Allowed customisation

- Research document template layout (L1)
- Tracking layout (`namespaced` vs `bare`) via `skraft-config.json::trackingLayout` (L1)
- Investigation depth (number of evaluated approaches) (L2)

## See also

- [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }}) — DESIGN phase (consumes this research)
- [Pipeline DESIGN]({{ "/en/explanation/pipeline/design" | relative_url }}) — Phase description
- [skraft-orchestrator]({{ "/en/reference/agents/skraft-orchestrator" | relative_url }}) — Dispatches this agent
- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — Pipeline overview
