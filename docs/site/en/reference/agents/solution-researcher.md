---
layout: doc
lang: en
title: "solution-researcher"
persona: researcher
---

# solution-researcher

> Investigates a codebase or external sources to produce a verified, cited research document BEFORE any design or implementation — the RESEARCH phase of the SKRAFT pipeline.

## When to use

- RESEARCH phase of the pipeline
- Before any architecture or implementation decision
- Triggers: `research`, `investigate`, `find existing patterns`, `evidence before building`, `what does the codebase already do`, `spike`, `prior art`
- Dispatch by the orchestrator at RESEARCH entry
- Persona: researcher

## Entry contract

- Topic or story to investigate
- Accessible codebase and available instructions
- Optional: `.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/stories-{milestone}.md`

## Exit contract

- Cited research document: `.copilot-tracking/skraft-plans/{projectSlug}/research/{date}/{slug}-research.md`
- Recommended approach + rejected alternatives with justifications
- Open questions for the DESIGN phase

## Invariants

- **Research only** — writes only under `research/{date}/`; never into `plans/`, `details/`, `adrs/`, source code, or tests
- **Evidence over assertion** — every finding cites a file (workspace-relative path + line numbers) or an external URL
- **No architecture decisions** — surfaces alternatives and a recommendation; the DESIGN phase (solution-architect) decides
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

The researcher is a verification specialist. The non-implementation constraint is precisely what makes its findings trustworthy — it optimises for *verified truth*, not *plausible code*.

> « Keep knowledge in plain text. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

The RESEARCH / DESIGN separation applies the Evidence Before Building principle: no decision is made without data. The researcher supplies the facts; the architect draws the conclusions.

## Allowed customisation

- Tracking layout (`namespaced` vs `bare`) via `skraft-config.json::trackingLayout` (L1)
- External sources to consult (L2)
- Investigation depth (L2)

## See also

- [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }}) — Next phase (DESIGN)
- [Pipeline DESIGN]({{ "/en/explanation/pipeline/design" | relative_url }}) — DESIGN phase description
- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — Pipeline overview
