<!-- markdownlint-disable-file -->

# DESIGN Review — us4-g2g3-skill-loading (#50)

**Verdict:** NEEDS_REWORK
**Confidence:** high · **Adversarial weighted score:** 0.50 · **Attempt:** 1 of 3
**Reviewed artefacts:** event-model, contracts, ADR-006, ADR-007, decisions-index

## Gates

| Gate | Result | Severity |
|---|---|---|
| G1 Structural commitments traceable to Accepted ADRs | PASS | — |
| G2 No contradicting ADRs | PASS | — |
| G3 Domain/App have zero infra/API imports | PASS | — |
| G4 Application interfaces in Application layer | PASS | — |
| G5 No cross-aggregate enforcement | PASS | — |
| G6 Context map declares every inter-context relationship | FAIL | HIGH |
| G7 Every story maps to Command/Query | PASS | — |
| G8 Every Command has domain event | PASS | — |
| G9 No YAGNI elements | PASS | — |
| G10 Consistency matrix present and gated PASS | FAIL | BLOCKER |
| G11 Complexity-adding patterns cited with admissible forces | N/A | — |
| G12 Every planned supersession realised | PASS | — |
| G14 No verdict-bearing filenames | PASS | — |
| G15 No ADR restates enforced baseline | PASS | — |

## Required Actions

1. **G10 BLOCKER — create consistency matrix.** Write `details/2026-06-29/consistency-matrix-us4-g2g3-skill-loading.md` with all 13 concepts labeled and consistency-gate verdict.

2. **G6 HIGH — add context map section to event model.** Add "Context map (Phase 5)" section declaring the Conformist relationship: Config Context (#48) → [Published Language/OHS upstream] → Skill-Loading Context [Conformist] with reference to ADR-005.

3. **Recommendation — add EagerReadFailed shape to shared types in contracts.** Currently specified only in Contract 3 flow prose.

4. **Recommendation — add block-on-first note in Contract 4.** DISTILL must not assert all missing skills in block message — only `missing[0]` is reported.

```yaml
verdict: NEEDS_REWORK
confidence: high
weighted_score: 0.50
blocking_gates: [G10]
high_gates: [G6]
```
