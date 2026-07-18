---
layout: doc
lang: en
title: "compose-brownfield-prd"
description: "Composes an HVE-format PRD (17 sections) from characterization artifacts, with FR/NFR IDs and full traceability."
persona: tech-lead
---

# compose-brownfield-prd

> Maps `characterize-brownfield` output into the exact HVE-format PRD (17 sections) that HVE agents consume directly — never re-scans the repo, never creates an issue.

## When to use

- After characterization, to produce the HVE-format PRD
- Loaded internally by [brownfield-analyst]({{ "/en/reference/agents/brownfield-analyst" | relative_url }}) (`disable-model-invocation`), or directly if artifacts already exist
- "write the PRD", "compose the PRD from characterization"

## Entry contract

- Path to characterization artifacts (`index.md` + siblings)
- Product name (kebab-case filename)
- Modernization goals (optional)

## Exit contract

- `docs/prds/<kebab-case-name>.md` — 17 sections, `FR-001`/`NFR-001` IDs, markers, no YAML frontmatter
- State file: `prd-sessions/<name>.state.json` (`currentPhase: brownfield-extraction`)

## Invariants

- **Reloads the artifacts (B4)** — never re-scans the repo, never relies on the agent's recall
- **Traceability** — every `FR` links to a Goal ID from Section 1
- **Never fabricates a PASS** — NFR with no measured evidence → default CONCERNS (Status/Threshold/Actual/Evidence shape)
- **Schema gate (S4)** — 17 headers in order, unique IDs, no YAML frontmatter, markers present
- Every Low-confidence claim and every NONE-coverage Core feature → one S14 Open Questions row

## Why this shape

The PRD applies an explicit schema gate before writing — 17 ordered sections, unique IDs, every `FR` traced to a goal — so HVE agents consume it without ambiguity.

> « Define explicit review criteria before the review begins. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Allowed customisation

- Modernization goals folded into Section 1 (otherwise derived from `tech-debt.md` signals)
- Conditional sections (Data & Analytics, Rollout) per characterization signals

## See also

- [characterize-brownfield]({{ "/en/reference/skills/characterize-brownfield" | relative_url }}) — Produces the artifacts consumed here
- [brownfield-analyst]({{ "/en/reference/agents/brownfield-analyst" | relative_url }}) — Agent that chains characterization → composition
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
