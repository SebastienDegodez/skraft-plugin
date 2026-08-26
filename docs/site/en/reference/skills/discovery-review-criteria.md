---
layout: doc
lang: en
title: "discovery-review-criteria"
description: "Use when reviewing DISCOVER artefacts (triage reports, sprint proposals) for completeness, prioritization quality, an..."
persona: tech-lead
---

# discovery-review-criteria

> Gate definitions and verdict rubric for the DISCOVER reviewer — applied across 3 lenses (completeness, prioritization, duplicate detection) with 6 gates (G1–G6).

## When to use

- When the `backlog-discoverer-reviewer` runs a review pass on DISCOVER artefacts
- To evaluate the quality of triage reports and sprint proposals
- To derive a formal verdict on issue coverage, prioritization coherence, and duplicate handling

## Entry contract

- `triage-report-{date}.md` — triage report with classified issues and sprint proposals
- Read access to the GitHub repository for the G2 sample-check (open P0/P1 issues)
- Declared team capacity (team-days)

## Exit contract

- Formal verdict: `approved`, `changes_requested`, or `rejected`
- Findings per lens with severity (`BLOCKER`, `HIGH`, `MEDIUM`)
- For G2 (BLOCKER): list of P0/P1 issues absent from the triage report

## Invariants

- **G2 is the only BLOCKER gate** — a P0/P1 issue missing from the triage is a critical failure
- **Effective capacity = team-days × 0.7** for P1/P2/P3 issues (P0 always overrides capacity)
- **Issues above 8 points never enter the sprint** — G4 fails if a 13- or 21-point issue is included
- **No P3 before P1** — a P3 in the sprint while a P1 is excluded is a priority inversion

| Gate | Lens | Severity | Definition |
|------|------|----------|-----------|
| G1 | Completeness | HIGH | All 3 discovery modes applied, or skipped modes justified |
| G2 | Completeness | BLOCKER | No open P0/P1 issue absent from the report (top-5 sample-check) |
| G3 | Prioritization | HIGH | No priority inversions; every P0 has a written justification |
| G4 | Prioritization | HIGH | Effective capacity respected; no issue above 8 points in the sprint |
| G5 | Duplicates | HIGH | No undetected duplicate pair (normalised similarity > 80%) |
| G6 | Duplicates | MEDIUM | All 40–80% pairs flagged in the "Duplicates Detected" section |

**Similarity thresholds:**

| Level | Similarity | Action required |
|---|---|---|
| EXACT | > 95% | One issue labelled `status/duplicate` linked to the original |
| NEAR | 80–95% | Merge recommendation; both issues linked and documented |
| RELATED | 40–80% | Flagged as "related", recommendation documented |
| DIFFERENT | < 40% | No action required |

## Why this shape

Discovery is the least visible phase but the most expensive when it fails: a P0 issue absent from the sprint becomes a production incident or critical debt. Gates G2 and G4 protect against the two most frequent failures — invisible critical issues and over-loaded sprints.

> « Maximizing the amount of work not done is essential. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

## Allowed customisation

- Similarity threshold for G5 (L2 — do not lower below 70%)
- Number of issues in the G2 sample-check (L2 — do not lower below 3)
- Severity of G1 and G3 (L2)

## See also

- [adversarial-review-lenses]({{ "/en/reference/skills/adversarial-review-lenses" | relative_url }}) — Independent-lens verdict procedure
- [issue-triage]({{ "/en/reference/skills/issue-triage" | relative_url }}) — Triage skill that produces the artefacts reviewed here
- [backlog-discoverer]({{ "/en/reference/agents/backlog-discoverer" | relative_url }}) — Agent that produces DISCOVER artefacts
