---
name: discovery-review-criteria
description: "Use when reviewing DISCOVER artefacts (triage reports, sprint proposals) for completeness, prioritization quality, and duplicate handling. Contains gate definitions G1-G6 and scoring rubric for the backlog-discoverer-reviewer lenses."
---

# Discovery Review Criteria

## Overview

Formal gate definitions and verdict rubric for the `backlog-discoverer-reviewer`. Applied across **3 lenses** with **6 gates** (G1–G6).

| Lens | Gates | What it checks |
|---|---|---|
| Completeness | G1, G2 | Was the discovery thorough? Were important issues missed? |
| Prioritization | G3, G4 | Is prioritization coherent and the sprint realistic? |
| Duplicate Detection | G5, G6 | Are duplicates correctly identified and linked? |

---

## Gate Definitions (G1–G6)

### Lens 1: Completeness

| ID | Definition | Pass Condition | Severity |
|---|---|---|---|
| G1 | All 3 discovery modes were considered, or the triage report explicitly documents why a mode was skipped (e.g., "no recent commits → artifact-driven skipped"). | All modes accounted for in the report. | HIGH |
| G2 | No P0 or P1 issues exist in the repository but are absent from the triage report. Verify by sampling: query for `label:priority/P0,priority/P1 is:open is:issue sort:created-desc`, take top 5, check each appears in the triage report. | Zero critical issues absent from triage. | BLOCKER |

### Lens 2: Prioritization

| ID | Definition | Pass Condition | Severity |
|---|---|---|---|
| G3 | All P0 issues have a written justification in the Notes field. P1–P3 follows descending business value order. No priority inversions (a P2 that is clearly more urgent than a P1 in the same domain). | No priority inversions. All P0 justified. | HIGH |
| G4 | Sprint proposal respects declared capacity. Total effort ≤ effective capacity (team-days × 0.7) for non-P0 issues. No P2/P3 issue occupies a sprint slot while a P0/P1 issue is excluded. XL issues are not in the sprint. | Capacity respected; XL issues excluded. | HIGH |

### Lens 3: Duplicate Detection

| ID | Definition | Pass Condition | Severity |
|---|---|---|---|
| G5 | No two issues in the triage report describe the same problem (normalized title similarity > 80%). Normalize: lowercase, remove stop words, sort words alphabetically, compare overlap ratio. | Zero undetected exact or near-duplicate pairs. | HIGH |
| G6 | All issue pairs with 40–80% normalized title similarity are noted in the "Duplicates Detected" section with a recommendation (merge, link, or keep separate). | All similar pairs flagged with recommendation. | MEDIUM |

---

## Completeness Scoring

Discovery is considered **sufficient** when:

1. All 3 modes were applied — or skipped modes are justified in the report
2. No P0 or P1 issues are missing from the triage (G2 sample check passes)
3. Coverage is >80% of open issues in the target area (mode-specific):
   - User-assigned: all @me issues are in the report
   - Artifact-driven: issues related to the modified domain are represented
   - Search-based: all issues matching the declared query are in the report

**Completeness is not about finding every issue** — it is about ensuring critical issues are not hidden.

---

## Priority Coherence Rules

| Rule | Description |
|---|---|
| P0 always in sprint | Every P0 issue must appear in the sprint proposal, even if over capacity |
| P0 justification required | Every P0 issue must have a written justification in the Notes field |
| No P3 before P1 | A P3 issue cannot be in the sprint if any P1 issue is excluded |
| P2 after all P1 | Sprint fills P1 before P2 unless P1 is already covered |
| XL never in sprint | XL issues must be split — they cannot enter DISCUSS as-is |
| No priority inversion | A P2 issue with more urgency than a P1 in the same domain = G3 fail |

---

## Duplicate Similarity Thresholds

| Level | Similarity | Action Required |
|---|---|---|
| EXACT | > 95% | One issue must be labeled `status/duplicate` and linked to the original |
| NEAR | 80–95% | Recommendation to merge. Both issues linked. Documented in triage. |
| RELATED | 40–80% | Flagged in triage as "related". Recommendation documented. No merge required. |
| DIFFERENT | < 40% | No action required |

**G5 threshold**: > 80% = must flag (covers both EXACT and NEAR)
**G6 threshold**: 40–80% = should flag (covers RELATED)

---

## Sprint Capacity Rules

| Rule | Applies To |
|---|---|
| P0 overrides capacity | P0 issues enter sprint regardless of effective capacity |
| Effective capacity = team-days × 0.7 | Applies to P1/P2/P3 issues |
| Over-capacity P0 must be documented | Triage report must note "P0 override" |
| XL exclusion is absolute | No XL issue enters sprint — G4 fail if present |
| P2/P3 after all P1 | P2/P3 issues fill remaining capacity after all P1s |

---

## Verdict Derivation Table

| Condition | Verdict |
|---|---|
| G2 fails (BLOCKER: P0/P1 missing from triage) | `rejected` |
| G1 fails (HIGH: modes not covered) | `changes_requested` |
| G3 fails (HIGH: priority inversions or missing P0 justification) | `changes_requested` |
| G4 fails (HIGH: capacity violated or XL in sprint) | `changes_requested` |
| G5 fails (HIGH: undetected near-duplicates) | `changes_requested` |
| G6 fails only (MEDIUM: related pairs not flagged) | `changes_requested` |
| All gates pass | `approved` |

---

## References

- [gate-definitions.md](references/gate-definitions.md) — step-by-step gate checklists with auto-insurance examples
- [completeness-heuristics.md](references/completeness-heuristics.md) — when to stop discovering; coverage signals; anti-patterns
- [verdict-rubric.md](references/verdict-rubric.md) — verdict derivation with 3 example verdict outputs (approved, changes_requested, rejected)
