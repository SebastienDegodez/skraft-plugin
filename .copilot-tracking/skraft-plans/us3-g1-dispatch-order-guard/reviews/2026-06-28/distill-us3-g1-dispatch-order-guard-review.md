<!-- markdownlint-disable-file -->

# DISTILL Review — US3 / G1 Dispatch-Order Guard (#49)

**Verdict:** APPROVED
**Confidence:** high
**Depth tier:** comprehensive (4 lenses + weighted synthesis)
**Difficulty:** medium · **Attempt:** 1
**Lenses executed:** 4
**Weighted score:** 1.00
**Reviewed artefacts:**
- `.copilot-tracking/skraft-plans/us3-g1-dispatch-order-guard/features/dispatch-order-guard.feature`
- `.copilot-tracking/skraft-plans/us3-g1-dispatch-order-guard/details/2026-06-28/impl-plan-us3.md`
- `tests/skraft-framework/dispatch-order-guard.acceptance.test.mjs`
- Cross-checked against: `plans/2026-06-28/ac-draft-us3.md`, `details/2026-06-28/contracts-us3.md`, `details/2026-06-28/event-model-us3.md`, ADR-004, ADR-005, `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs`

## Gate summary (acceptance-review-criteria G1–G10)

| Gate | Lens | Result | Note |
|---|---|---|---|
| G1 — AC↔scenario bijection | Coverage | PASS | All 4 ACs covered; rows a–g present; no orphan scenario |
| G2 — Edge/negative representation | Coverage | PASS | Deny rows, retry-exhausted, 4 fail-closed classes |
| G3 — Business vocabulary | Business Fit | PASS | Only domain terms (agents, phases, verdicts, retry budget) |
| G4 — No technical jargon | Business Fit | PASS | No HTTP/ORM/class/DI leaks in Gherkin |
| G5 — Step unambiguity | Quality | PASS | Each step maps to one domain action/state |
| G6 — Impl-plan completeness | Quality | PASS | Every scenario → matrix row with boundary + path |
| G7 — Layer boundary | Risk | PASS | All 14 acceptance rows enter `handle` (Application) |
| G8 — Walking skeleton | Coverage | PASS | Strategy A, AC-01 row a marked in matrix |
| G9 — Acceptance-value fidelity (Iron Rule) | Quality | PASS | Every value verbatim from sources (verified row-by-row) |
| G10 — RED integrity | Quality/Risk | PASS (in spirit — see dissent) | Faithful RED encoding; first failure is canonical missing-module load |

---

## Lens 1 — Completeness (weight 0.30 · score 1.0)

- **AC→scenario bijection [OK]** — Every frozen AC maps to ≥1 scenario, no orphans:
  - AC-01 → `Scenario Outline` allow (rows a/e/f) + deny (rows b/c/d) + `Scenario` retry-exhausted (row g). All 7 rule-table rows present.
  - AC-02 → out-of-sequence block-before-run scenario.
  - AC-03 → determinism (twice→identical) + audit-cardinality outline (allow + deny).
  - AC-04 → 4-class fail-closed outline (missing / unparseable / schema-invalid / phase-out-of-order).
- **Coverage matrix [OK]** — 14 Application rows + D1/D2/D3 Domain extractions; the traceability table closes AC → matrix-rows → scenarios for all four ACs.
- **Impl-plan bijection (G6) [OK]** — Each feature scenario has a matrix entry naming the `handle` boundary and the modules to create; outside-in RED→GREEN slice order is enumerated (7 commits + mutation gate).
- **Mandate-4 discipline [OK]** — AC-01 decision grid explicitly refused a domain test (`M4 negative — saturated by AC`); D1/D2/D3 each carry a valid reason code (`branch_unreachable_via_AC`, `combinatorial_economy`). No double-coverage.

No completeness gaps in the DISTILL deliverable: it fully covers the upstream-frozen AC set.

## Lens 2 — Business Fit (weight 0.30 · score 1.0)

- **Vocabulary (G3) [OK]** — All nouns/verbs are story-lexicon terms: phase names, `specialist`/`reviewer`, verdicts `APPROVED`/`CHANGES_REQUESTED`, `retry budget`, `dispatch-evaluation record`, `published phase order`. Agent identifiers (`solution-architect`, `acceptance-designer`, `solution-architect-reviewer`) are genuine domain names from the `ac-draft` examples, not technical identifiers (Conformist Published Language, ADR-005).
- **No jargon (G4) [OK]** — Zero HTTP verbs, status codes, ORM, DI, or class names in any `Given/When/Then`. The audit fact is surfaced as a “dispatch-evaluation record”; the harness decisions surface as `allowed`/`denied`/`blocked` (gate-domain language, not implementation).
- **Intent fidelity [OK]** — The rule-table rows reproduce `ac-draft` domain examples 1–7 faithfully; the “skipping DESIGN” intent in AC-02 correctly models operator intent against `skipPhases: []`.

## Lens 3 — Quality (weight 0.15 · score 1.0)

- **Iron Rule / value fidelity (G9) [OK]** — Verified verbatim against `ac-draft` + `event-model` + Contract 4:
  - States: row a `{DISCUSS,true,APPROVED,0,[]}`, e `{…,[DESIGN]}`, f `{DISTILL,true,CHANGES_REQUESTED,1,[]}`, b/c/d/g identical to table; retries `0/1/3` exact.
  - Expected agents: a→`solution-architect`, b→`solution-architect`, c→`solution-architect`, d→`backlog-planner`, e→`acceptance-designer`, f→`acceptance-designer`, g→`null` — all match the event-model derivation table.
  - Audit codes: `CONFORMING`/`OUT_OF_ORDER`/`RETRY_EXHAUSTED`/`INVALID_STATE`/`UNREADABLE_STATE` ⊆ Contract 4 enum; decisions `ALLOW`/`DENY` exact. No invented or rounded value.
- **Contract alignment [OK]** — Boundary `createPreToolUseService({stateReader,auditWriter,config,clock}).handle({requestedAgent,projectSlug})` is Contract 3 verbatim. `result.decision`/`result.message` match the real `decision.mjs` shape (`allow()→{decision:'allow'}`, `deny/block→{decision,message}`). `DispatchEvaluated` asserted fields ⊆ Contract 4. `retryBudget ?? 3` exercised by omitting the key from `CONFIG` while `Background` pins budget 3.
- **RED integrity (G10) [OK]** — All three production modules (`application/pre-tool-use-service.mjs`, `domain/pipeline-policy.mjs`, `domain/state-schema.mjs`) confirmed absent → import load failure → suite RED by construction. The test is boundary-to-boundary, instantiates **no** internal domain object (Mandate 1), and carries no production logic. The AC-04 `INVALID_STATE` cases are layer-agnostic (assert only the boundary audit code), correctly surviving the schema-vs-policy split in Contract 1.
- **Cross-reference integrity [OK]** — `pipeline-policy.mjs`/`evaluateDispatch` (runtime) vs build-time `dispatch-policy.mjs`/`validateDispatch` disambiguation is consistent across event-model, contracts, and impl-plan — no shared symbol.

## Lens 4 — Risk (weight 0.25 · score 1.0)

- **Immutable invariants [OK]** — Outside-in TDD (RED-first), Clean Architecture boundary (enter `handle`, assert at decision + audit port), test integrity (immutable verbatim values), dated paths (`2026-06-28`), reviewer read-only — all respected.
- **Deny-by-default / fail-closed (ADR-004) [OK]** — Mapping table has no default-allow path; reader-throw and schema-`Err` both resolve to `block` with an audit fact; AC-04 asserts `notEqual(decision,'allow')` before asserting `block`, encoding the security property by construction.
- **Conformist config (ADR-005) [OK]** — Expected agents resolved only from `config.phaseAgents`; no hardcoded order/name in the test fixture beyond the published config copy.
- **Bounded residual (D1/D2 boundary wiring) [AMBIGUOUS_ASSUMPTION — bounded/documented]** — The REVIEWER (`specialistDone:true, verdict:null`) and PIPELINE_COMPLETE branches are reached only by inner-loop domain tests (D1/D2), so the boundary mapping `REVIEWER→allow/CONFORMING` and `PIPELINE_COMPLETE→block/PIPELINE_COMPLETE` is not asserted at the acceptance boundary. This is a correct Mandate-4 Gate (a) delegation (the frozen AC-01 table contains no such row, and the reviewer cannot expand ACs), but it leaves those two specific decision→audit mappings without an acceptance-level guard. Carried forward as a DELIVER watch item, not a DISTILL defect. No `INVARIANT_VIOLATION`.

---

## Weighted synthesis

| Lens | Weight | Score | Contribution |
|---|---|---|---|
| Completeness | 0.30 | 1.0 | 0.30 |
| Business Fit | 0.30 | 1.0 | 0.30 |
| Quality | 0.15 | 1.0 | 0.15 |
| Risk | 0.25 | 1.0 | 0.25 |
| **Weighted sum** | | | **1.00** |

All ten gates pass. The Gherkin is purely business-readable with full AC↔scenario bijection; the `.mjs` outer test is a faithful, verbatim, boundary-to-boundary RED encoding of the four frozen ACs with no invented values; and the contract/ADR alignment (decision vocabulary, `DispatchEvaluated` shape, deny-by-default, `retryBudget ?? 3`, Conformist config) is exact. The dominant lenses (Completeness + Business Fit, 0.60) are clean; the only observations are LOW, non-blocking recommendations for DELIVER. Weighted sum 1.00 ≥ 0.85 with no lens at 0.0.

## FINAL VERDICT: APPROVED

---

## Dissent / nuance (documented per dissent rule)

- **G10 literal vs. spirit.** The first failure is a missing-module *load* error, not yet a business-assertion failure. Strict-literal G10 wants a business-assertion RED. **Upheld as PASS in spirit:** at the DISTILL→DELIVER handoff no production module exists by design, so the canonical first RED of an outside-in outer loop is exactly this load failure; the test body is a faithful AC encoding and will fail on the business assertion the moment the walking-skeleton stub is created. This is the intended sequence, not a spurious setup error — so G10 is not a blocker.

## Recommendations (LOW — non-blocking, for DELIVER)

1. **Assert the AC-01 row g escalation message.** The `block` decision + `RETRY_EXHAUSTED` audit code are asserted, but the harness `result.message` “retry budget exhausted / must escalate” text (feature `And` step) is not. Consider adding a `result.message.includes(...)` assertion when the software-engineer strengthens the GREEN slice.
2. **Assert the AC-04 harness-visible cause.** The test verifies the audit-record `code`; the feature’s “blocked-dispatch outcome reports the cause” step (harness `result.message`) is not asserted. Optional strengthening.
3. **Tag the walking skeleton `@smoke`.** Row a is identified via the matrix (Strategy A); adding `@smoke` to the AC-01 happy outline would enable the fast smoke subset (G8 already passes via the matrix marking).
4. **Cover D1/D2 boundary wiring in the inner loop.** When authoring the D1 REVIEWER and D2 PIPELINE_COMPLETE domain tests, also confirm the `handle` boundary emits the correct audit code + decision for those branches (guard against TBU on the `PIPELINE_COMPLETE→block` and `REVIEWER→allow` mappings, which no acceptance row exercises).
