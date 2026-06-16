---
layout: doc
lang: en
title: "adversarial-review-lenses"
description: "Use when a reviewer agent must produce an adversarial verdict via 4 independent lenses and weighted synthesis (Genesi..."
persona: tech-lead
---

# adversarial-review-lenses

> Procedure for executing 4 independent lenses and weighted synthesis to produce a defensible adversarial verdict on a phase artefact.

## When to use

- Every SKRAFT reviewer agent invokes this skill once per review pass, after reading the upstream phase artefact(s)
- The number of lenses executed is governed by the `depthTier` recorded in `state.json`

| Depth tier | Lenses required |
|---|---|
| `basic` | 1 (Completeness only) |
| `standard` | 2 (Completeness + Business Fit) |
| `comprehensive` (default) | 4 (all lenses) |
| `custom` | as configured in `userPreferences.customDepth.reviewerLenses`, minimum 1 |

## Entry contract

- Artefact(s) of the phase under review (relative path)
- The phase's `*-review-criteria` skill (read before executing lenses)
- `state.json::userPreferences.depthTier` to determine the number of lenses to execute

## Exit contract

- Review file under `reviews/{YYYY-MM-DD}/{phase}-{slug}-review.md`
- Verdict: `APPROVED`, `NEEDS_REWORK`, or `REJECTED`
- Weighted score computed from the 4 lenses (fixed weights)
- List of required actions when verdict is `NEEDS_REWORK` or `REJECTED`

## Invariants

- **No cross-lens contamination** — findings from one lens must not influence another
- **A single `INVARIANT_VIOLATION` in Lens 4 forces `REJECTED`** regardless of weighted sum
- **The reviewer never modifies upstream artefacts** — read-only
- **Fixed lens weights:** Completeness 0.30 — Business Fit 0.30 — Quality 0.15 — Risk 0.25

| Lens | Weight | Finding tags |
|------|--------|-------------|
| 1 — Completeness | 0.30 | `MISSING`, `THIN`, `OK` |
| 2 — Business Fit | 0.30 | `MISALIGNED`, `AMBIGUOUS`, `OK` |
| 3 — Quality | 0.15 | `BROKEN`, `INCONSISTENT`, `OK` |
| 4 — Risk | 0.25 | `INVARIANT_VIOLATION`, `HIDDEN_COUPLING`, `AMBIGUOUS_ASSUMPTION`, `OK` |

**Verdict table:**

| Weighted sum | Verdict |
|---|---|
| >= 0.85 and no lens scored 0.0 | `APPROVED` |
| >= 0.55 | `NEEDS_REWORK` |
| < 0.55, or any lens scored 0.0 on an invariant | `REJECTED` |

## Why this shape

Adversarial review draws on the Genesis Step 7 pattern: independent judge panels produce more reliable verdicts than collegial reviews where conformity bias suppresses dissent. The weighted synthesis preserves the dominance of business lenses (Completeness + Business Fit = 60%) over structural ones.

> « Peer reviews consistently find more defects per hour than any other technique. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Allowed customisation

- Depth tier (via `state.json` — L1)
- Minimum lenses for `custom` (minimum 1 — L2)
- Output file format (L1)

## See also

- [acceptance-review-criteria]({{ "/en/reference/skills/acceptance-review-criteria" | relative_url }}) — DISTILL gates
- [architecture-review-criteria]({{ "/en/reference/skills/architecture-review-criteria" | relative_url }}) — DESIGN gates
- [discovery-review-criteria]({{ "/en/reference/skills/discovery-review-criteria" | relative_url }}) — DISCOVER gates
