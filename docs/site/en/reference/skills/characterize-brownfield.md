---
layout: doc
lang: en
title: "characterize-brownfield"
description: "Reverse-engineers a codebase into confidence-scored artifacts: stack, features, integrations, contracts, coverage traceability, tech debt."
persona: tech-lead
---

# characterize-brownfield

> Reverse-engineers a codebase into structured, confidence-scored artifacts — every claim is a FACT (tool call) or a confidence-tagged INFERENCE (High/Medium/Low). Honesty about confidence is the point.

## When to use

- Before composing a PRD, or standalone to understand a legacy system with no docs
- "characterize this codebase", "what does this system do", "map the architecture", "find existing contracts", "assess tech debt"
- Loaded by [brownfield-analyst]({{ "/en/reference/agents/brownfield-analyst" | relative_url }}) in phase 1

## Entry contract

- Repository path (required)
- Depth: `quick` (2-5 min) / `deep` (10-30 min, default) / `exhaustive` (30-120 min, opt-in)
- Focus directories (optional)

## Exit contract

- Artifacts under `characterization/{YYYY-MM-DD}/`: `index.md`, `structure.md`, `features.md`, `integration.md`, `contracts.md`, `coverage.md`, `tech-debt.md`
- Confidence gate verdict (PASS/CONCERNS/FAIL) in `index.md`

## Invariants

- **Read-only** — never edits code, never writes a PRD, never creates issues
- **FACT vs INFERENCE** — every FACT claim comes from a tool call (S7), never from recall; every inference carries its confidence inline
- **Coverage traceability** — FULL (direct assertion) / PARTIAL (indirect) / NONE; never FULL without reading an actual assertion
- **Confidence gate (S4)** — CONCERNS/FAIL → explicit validation checklist to the human

## Why this shape

Characterization classifies every feature Core/Secondary/Legacy-unused and every coverage FULL/PARTIAL/NONE, with a synthetic oracle (Low confidence) when no test exists — a blank is never acceptable, but neither is invented certainty.

> « Code without tests is bad code. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Allowed customisation

- Scan depth (`quick` / `deep` / `exhaustive`)
- Opt-in facets: contract discovery, coverage traceability
- Focus directories to narrow deep/exhaustive scans

## See also

- [compose-brownfield-prd]({{ "/en/reference/skills/compose-brownfield-prd" | relative_url }}) — Consumes these artifacts to compose the PRD
- [brownfield-analyst]({{ "/en/reference/agents/brownfield-analyst" | relative_url }}) — Agent that loads this skill
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
