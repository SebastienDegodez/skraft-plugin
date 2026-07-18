---
layout: doc
lang: en
title: "brownfield-analyst"
description: "Reverse-engineers an existing codebase into an HVE-format PRD. Standalone workflow the human invokes directly, decoupled from the orchestrator."
persona: tech-lead
---

# brownfield-analyst

> Turns an undocumented, existing codebase into an HVE-format PRD that other agents turn into issues and user stories — a standalone workflow, not a pipeline phase.

## When to use

- The human wants to analyze a brownfield/legacy codebase with no docs or backlog
- Bootstrap or reverse-engineer a PRD from existing code
- Document a legacy system before handing it to HVE agents
- Standalone workflow — invoked directly, decoupled from the DISCOVER→DELIVER orchestrator

## Entry contract

- Repository path (required)
- Depth preference (`quick` / `deep` / `exhaustive`; default `deep`)
- Focus directories (optional), product name (optional — asked otherwise)

## Exit contract

- Confidence-scored characterization artifacts under `characterization/{YYYY-MM-DD}/`
- HVE-format PRD: `docs/prds/<kebab-case-name>.md`
- PRD state file: `prd-sessions/<name>.state.json`

## Invariants

- **Never creates issues or user stories** — that is the job of the HVE agents that consume the PRD
- **Never modifies code** — analysis and traceability are entirely read-only
- **Never fabricates confidence** — every claim is a tool-verified FACT or a confidence-tagged INFERENCE (High/Medium/Low)
- **Never skips the confidence gate** — CONCERNS/FAIL verdict → human checkpoint (B10) before composing the PRD

## Why this shape

The analyst separates characterization (understanding the code as it is) from PRD composition, and refuses fabricated certainty: an honest "unknown" beats an invented fact.

> « Legacy code is simply code without tests. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Allowed customisation

- Scan depth (`quick` / `deep` / `exhaustive`)
- Focus directories to narrow deep/exhaustive scans
- Product name (PRD filename)

## See also

- [characterize-brownfield]({{ "/en/reference/skills/characterize-brownfield" | relative_url }}) — Characterization skill run in phase 1
- [compose-brownfield-prd]({{ "/en/reference/skills/compose-brownfield-prd" | relative_url }}) — Skill that composes the PRD from characterization
- [brownfield-harness-builder]({{ "/en/reference/agents/brownfield-harness-builder" | relative_url }}) — Sibling workflow: safety net before refactoring
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
