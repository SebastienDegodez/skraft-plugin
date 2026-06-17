---
layout: doc
lang: en
title: "planning-review-criteria"
description: "Use when reviewing DISCUSS artefacts (stories, acceptance criteria, sprint plans) for INVEST quality, planning cohere..."
persona: tech-lead
---

# planning-review-criteria

> Formal gate definitions and verdict rubric for the `backlog-planner-reviewer`, covering 4 lenses and 8 gates (G1–G8) on DISCUSS artefacts.

## When to use

- Reviewing DISCUSS artefacts (stories, acceptance criteria, sprint plans)
- Evaluating INVEST quality, planning coherence, and DoR compliance
- Applying the 4 lenses: `invest-lens`, `ac-quality-lens`, `planning-coherence-lens`, `dor-compliance-lens`
- Deriving a verdict: `approved`, `changes_requested`, or `rejected`

## Entry contract

- DISCUSS artefacts: stories, `ac-draft-{story}.md` files, sprint plan
- DISCOVER triage report (context, not blocking if absent)

## Exit contract

- Verdict per story (`approved` / `changes_requested` / `rejected`)
- Findings classified by gate (G1–G8) and severity (BLOCKER / HIGH / MEDIUM / LOW)
- Confidence level (`high` / `medium` / `low`) based on artefact completeness
- Remediation recommendations for each finding

## Invariants

- **≥ 1 BLOCKER finding → verdict `rejected`** — without exception
- **≥ 1 HIGH finding, 0 BLOCKER → verdict `changes_requested`** — minimum
- **G4 and G6 are automatic BLOCKERs** — AC ambiguity and dependency cycles
- **G7: 2+ missing DoR items on the same story → `rejected`** — regardless of other findings
- **G8 CRITICAL antipatterns** (Implement-X, Giant Stories, No Examples) → automatic `rejected`
- **Domain vocabulary mandatory** in ACs — HTTP status codes, REST verbs, class names are G4 violations

## Why this shape

The reviewer applies 4 independent lenses to avoid blind spots: INVEST checks independence and value, AC Quality checks ambiguity and completeness, Planning Coherence checks milestone alignment and dependency cycles, DoR Compliance checks the 8 Definition of Ready items and the 8 antipatterns.

> « A story that passes all 8 gates is approved to enter DESIGN. A story with any blocking finding must return to DISCUSS. »

The verdict derivation table transforms findings into a clear, reproducible decision, independent of the reviewer's subjective judgement.

## Allowed customisation

- Minimum AC threshold per story (default: 3) (L1)
- Additional antipattern labels (L2)
- Dependency cycle detection rules (L2)

## See also

- [issue-refinement]({{ "/en/reference/skills/issue-refinement" | relative_url }}) — Produces the DISCUSS artefacts evaluated by this skill
- [bdd-methodology]({{ "/en/reference/skills/bdd-methodology" | relative_url }}) — Gherkin format referenced by gates G3 and G4
- [backlog-planner-reviewer]({{ "/en/reference/agents/backlog-planner-reviewer" | relative_url }}) — Reviewer agent that uses this skill
- [backlog-planner]({{ "/en/reference/agents/backlog-planner" | relative_url }}) — DISCUSS agent whose artefacts are reviewed here
