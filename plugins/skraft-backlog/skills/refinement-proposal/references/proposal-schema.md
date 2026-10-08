# Proposal schema

`proposal.json` — every text in the issue's language. `check-proposal.mjs` enforces the rules
in the right column; it adds `derived` (readiness, DoR tally, capacity days) itself.

```json
{
  "issue": { "repo": "acme/insurance", "number": 42, "title": "Eligibility check for young drivers" },
  "language": "en",
  "docs": {
    "searched": "docs",
    "used": [{ "path": "docs/prd/eligibility.md", "kind": "PRD", "via": "linked from the issue" }],
    "candidates": [{ "path": "docs/brd/pricing.md", "kind": "BRD", "matched": ["drivers"] }],
    "missing": [],
    "gaps": ["The PRD caps the accident history at 3 years; the issue says 5."]
  },
  "dor": [
    { "item": 1, "pass": true },
    { "item": 3, "pass": false, "note": "No example with a real age or accident count." }
  ],
  "story": {
    "persona": "first-time driver under 25",
    "personaInferred": false,
    "statement": "As a first-time driver under 25, I want … so that …"
  },
  "examples": ["Léa, 22, B licence since 2023, no accident: eligible at standard premium", "…", "…"],
  "acceptanceCriteria": [
    { "id": "AC1", "title": "Eligible young driver", "given": "…", "when": "…", "then": "…", "example": 1 }
  ],
  "acDefects": [{ "ac": "\"The check is fast\"", "kind": "vague", "detail": "No threshold: how fast, measured where?" }],
  "invest": [
    { "criterion": "Independent", "pass": true },
    { "criterion": "Small", "pass": false, "note": "Covers both the check and the premium quote." }
  ],
  "antipatterns": [{ "name": "Technical AC", "severity": "HIGH", "detail": "AC2 names HTTP 422." }],
  "size": { "points": 5, "justification": "4 criteria, one new rule, no integration.", "split": [] },
  "triage": { "type": "feature", "priority": "P1", "justification": "Blocks the Q4 young-driver offer." },
  "related": [{ "number": 51, "title": "Young driver premium", "similarity": "RELATED" }],
  "review": { "verdict": "APPROVED", "attempts": 1, "unresolved": [] }
}
```

| Field | Rule |
|---|---|
| `dor` | the 8 items of `issue-refinement`, once each (`item` 1–8); a failing item has a `note` |
| `story.persona` | a named role, never user, customer, someone, developer |
| `examples` | 3 or more, with real values |
| `acceptanceCriteria` | 3 or more; `given`, `when`, `then` filled; `example` points at an example (1-based) |
| `acDefects[].kind` | `vague`, `untestable`, `duplicate`, `technical`, `antipattern`, `invest`, `missing` |
| `invest` | each of Independent, Negotiable, Valuable, Estimable, Small, Testable, once; a failure has a `note` |
| `antipatterns[].severity` | `CRITICAL` or `HIGH` — a CRITICAL one keeps the issue from READY |
| `size.points` | 1, 2, 3, 5, 8, 13 or 21; above 8, `split` holds 2+ stories of 8 or less and DoR item 6 fails |
| `triage` | `type` feature, bug, tech-debt, docs, question; `priority` P0–P3, a P0 needs a justification |
| `related[].similarity` | `EXACT`, `NEAR`, `RELATED` |
| `docs` | the output of `resolve-docs.mjs`; `gaps` only against a `used` document |
| `review` | `verdict` as printed by `review-verdict.mjs`, `attempts` ≥ 1 |

READY means: the 8 DoR items pass, the size is 8 or less, and no CRITICAL antipattern.
