# Verdict Rubric — DISCOVER Review

Verdict derivation rules, confidence levels, dissent resolution, and three example verdict outputs for `backlog-discoverer-reviewer`.

---

## Verdict Derivation Table

| Condition | Verdict |
|---|---|
| G2 fails — a P0 or P1 issue is absent from triage | `rejected` |
| G1 fails — discovery modes not covered or justified | `changes_requested` |
| G3 fails — priority inversion or P0 without justification | `changes_requested` |
| G4 fails — capacity violated or XL in sprint | `changes_requested` |
| G5 fails — undetected near-duplicate issues (>80% similarity) | `changes_requested` |
| G6 fails only — related issues (40–80%) not flagged | `changes_requested` |
| All gates pass | `approved` |

**Severity hierarchy**: BLOCKER > HIGH > MEDIUM

- ≥1 BLOCKER gate fails → `rejected` regardless of other lens results
- ≥1 HIGH gate fails, 0 BLOCKERs → `changes_requested`
- MEDIUM failures only → `changes_requested` (not rejected)
- All pass (or MEDIUM with documented justification) → `approved`

---

## Confidence Levels

| Level | When to use |
|---|---|
| `high` | G2 was verified live against GitHub — MCP query confirmed all sampled P0/P1 present |
| `medium` | G2 verification relied on triage report data only — no live GitHub confirmation |
| `low` | Artefacts were incomplete (missing Discovery Mode section, partial triage table); review is partial; verdict may change with complete data |

---

## Dissent Resolution

When lens findings conflict — e.g., completeness-lens passes but prioritization-lens reveals a P0 missing from the sprint — the **strictest outcome wins**.

Document dissent under the `dissent` key in the verdict output:
- If all lenses agree: `"No lens disagreement."`
- If lenses disagree: describe which lens is stricter and why its verdict takes precedence

---

## Example 1 — Approved

All 6 gates pass. Discovery was thorough and sprint is well-formed.

```yaml
verdict: approved
confidence: high
reviewed_at: 2026-05-14T11:45:00Z
artefacts_reviewed:
  - .skraft/sdlc/discover/triage-2026-05-14.md
  - .skraft/sdlc/discover/sprint-proposal.md
lenses:
  completeness:
    status: pass
    gates:
      G1: pass
      G2: pass
    findings:
      - "All 3 modes applied. User-assigned (6 issues), artifact-driven (2 additional), search-based (1 additional)."
      - "G2 sample: top 5 oldest P0/P1 issues verified — all present in triage (#43, #42, #31, #28, #19)."
  prioritization:
    status: pass
    gates:
      G3: pass
      G4: pass
    findings:
      - "Issue #43 (P0) has justification: 'NullReferenceException on age < 0 — blocks all submissions'."
      - "Sprint totals 5.0d against effective capacity of 4.9d. P0 override documented for #43."
      - "No XL issues in sprint. No P2 before P1."
  duplicate-detection:
    status: pass
    gates:
      G5: pass
      G6: pass
    findings:
      - "Pairwise similarity computed for all 8 issue pairs. No pair exceeds 80% similarity."
      - "Pair #42 / #75 at 45% similarity correctly documented as 'related — different scope'."
synthesis:
  blocking_findings: []
  recommendations:
    - "Consider running a second artifact-driven pass after the next commit batch to stay current."
  dissent: "No lens disagreement."
```

**Human-readable summary**:

```
## Review Summary

Verdict: APPROVED

### What passed
- All 3 discovery modes applied and documented
- Top 5 oldest P0/P1 issues verified present in triage
- P0 justification complete for issue #43
- Sprint capacity respected; P0 override documented
- No undetected duplicates or near-duplicates

### What needs to change
- Nothing blocking.

### Recommended next step
- Approved — proceed to DISCUSS with the triaged issues.
```

---

## Example 2 — Changes Requested (G3 fail — priority inversion)

P3 issue appears in sprint before a P1 issue with available capacity.

```yaml
verdict: changes_requested
confidence: high
reviewed_at: 2026-05-14T12:10:00Z
artefacts_reviewed:
  - .skraft/sdlc/discover/triage-2026-05-14.md
  - .skraft/sdlc/discover/sprint-proposal.md
lenses:
  completeness:
    status: pass
    gates:
      G1: pass
      G2: pass
    findings:
      - "All modes covered. G2 sample passed — all 5 sampled P0/P1 present."
  prioritization:
    status: fail
    gates:
      G3: fail
      G4: pass
    findings:
      - "G3 FAIL: Issue #89 (P3, tooltip cosmetic fix, effort/XS) is included in the sprint proposal."
      - "Issue #67 (P1, incorrect premium calculation, effort/M) is excluded from the sprint."
      - "Remaining capacity after P0/P1 issues = 0.9 days. #89 uses 0.25 days. #67 requires 1.0 day."
      - "P3 issue should not enter sprint while a P1 issue remains excluded — priority inversion."
  duplicate-detection:
    status: pass
    gates:
      G5: pass
      G6: pass
    findings:
      - "No undetected duplicates."
synthesis:
  blocking_findings: []
  recommendations:
    - "Remove issue #89 (P3) from the sprint proposal."
    - "Add issue #67 (P1) to the sprint proposal; note it puts the sprint slightly over capacity — document as P1 stretch goal."
    - "Re-submit triage report with corrected sprint proposal."
  dissent: "No lens disagreement."
```

**Human-readable summary**:

```
## Review Summary

Verdict: CHANGES REQUESTED

### What passed
- Discovery coverage complete — all P0/P1 issues surfaced
- Duplicate detection thorough

### What needs to change
- Remove issue #89 (P3 tooltip) from the sprint proposal
- Add issue #67 (P1 premium bug) — it has higher priority and the capacity difference is only 0.25 days
- A P3 issue cannot occupy a sprint slot while a P1 issue is excluded

### Recommended next step
- Correct the sprint proposal and re-submit for review.
```

---

## Example 3 — Rejected (G2 BLOCKER — P0 missing from triage)

A P0 issue blocking the core flow was not discovered and is absent from the triage report.

```yaml
verdict: rejected
confidence: high
reviewed_at: 2026-05-14T12:30:00Z
artefacts_reviewed:
  - .skraft/sdlc/discover/triage-2026-05-14.md
  - .skraft/sdlc/discover/sprint-proposal.md
lenses:
  completeness:
    status: fail
    gates:
      G1: pass
      G2: fail
    findings:
      - "G1 pass: all 3 modes documented."
      - "G2 BLOCKER: Live GitHub query for top 5 oldest P0/P1 issues returned issue #31."
      - "Issue #31 title: 'Eligibility check returns null for drivers over 70'. Labels: priority/P0, type/bug."
      - "Issue #31 was created 21 days ago. It is NOT present in the triage report."
      - "This issue would have been caught by search-based mode with query: 'label:priority/P0 is:open is:issue'."
      - "Root cause: search-based mode was applied with milestone qualifier only — did not include P0 label check."
  prioritization:
    status: pass
    gates:
      G3: pass
      G4: pass
    findings:
      - "Prioritization of discovered issues is coherent."
      - "Sprint capacity respected."
  duplicate-detection:
    status: pass
    gates:
      G5: pass
      G6: pass
    findings:
      - "No undetected duplicates among the 8 discovered issues."
synthesis:
  blocking_findings:
    - "G2 BLOCKER: Issue #31 (P0 — eligibility returns null for drivers over 70) is absent from the triage. This is a blocking condition — the sprint cannot be planned without addressing this critical issue."
  recommendations:
    - "Add a P0 label spot-check to the search-based mode: 'label:priority/P0 is:open is:issue sort:created-asc'. Always run this regardless of other search themes."
    - "Re-run discovery including issue #31. Re-triage and update the sprint proposal."
    - "Issue #31 is likely P0 S effort (targeted bug fix). It should enter the sprint with P0 override."
  dissent: "No lens disagreement. G2 BLOCKER overrides all other lens results."
```

**Human-readable summary**:

```
## Review Summary

Verdict: REJECTED

### What passed
- Discovery modes documented
- Prioritization coherent for discovered issues
- No duplicates

### Why rejected
- G2 BLOCKER: Issue #31 (P0) — "Eligibility check returns null for drivers over 70" — was not discovered
- This P0 issue has been open for 21 days and blocks a core eligibility flow
- The sprint cannot be approved with a P0 missing from the triage

### Recommended next step
- Always include a P0 spot-check query in search-based mode: `label:priority/P0 is:open is:issue sort:created-asc`
- Re-run discovery, add #31 to triage as P0/S, include in sprint with P0 override
- Re-submit for review after correcting the triage report
```
