<!-- markdownlint-disable-file -->
# DELIVER Adversarial Review — US3-G1 Dispatch-Order Guard (#49)

Phase: DELIVER · Date: 2026-06-28 · Project slug: us3-g1-dispatch-order-guard
Reviewer: software-engineer-reviewer (read-only) · depthTier: comprehensive (4 lenses + weighted synthesis) · difficulty: medium · Attempt: 2
Baseline asserted: 31/31 dispatch-guard GREEN · full `node scripts/local-ci.mjs` PASS (155/155, B12 clean) · 100% coverage on the three new modules · stryker scope updated
Prior verdict: NEEDS_REWORK (1 high, 2 medium, 0 blocker)

## Modules under review

| Module | Kind | Verdict |
|---|---|---|
| plugins/skraft-framework/src/domain/state-schema.mjs | pure Domain Service | clean (unchanged) |
| plugins/skraft-framework/src/domain/pipeline-policy.mjs | pure Domain Service | clean (unchanged) |
| plugins/skraft-framework/src/application/pre-tool-use-service.mjs | use case | high resolved |
| tests/skraft-framework/pre-tool-use-service.unit.test.mjs | new app-boundary suite | mediums closed |

## Attempt-1 finding disposition

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | high | clock.now()/auditWriter.write() outside try (Contract 3 step 6) | RESOLVED — whole body wrapped; catch → fallback unreadableFact + block; fallback audit throw swallowed, still block |
| 2 | medium | PIPELINE_COMPLETE block route had no app-boundary test | CLOSED — DELIVER+APPROVED → block, code PIPELINE_COMPLETE, expectedAgent null |
| 3 | medium | adapter-exception fail-closed unverified | CLOSED — clock-throws→block, writer-throws→block |
| 4 | low | AC-01 row g audit assertions | accepted residual — acceptance file immutable; covered elsewhere |

---

## Lens 1 — Test integrity / Iron Rule (weight 0.25) → PASS

- Acceptance literals untouched; new unit CONFIG copied verbatim from the acceptance fixture; `retryBudget` still omitted to exercise the policy `?? 3` default. Iron Rule held.
- Three new tests assert only observable behaviour: returned `decision` (`block`) and the `DispatchEvaluated` audit fact (`code`, `expectedAgent`, `decision`). No production logic mirrored; no tautology; throwing clock/writer are honest fakes, not stubs of the unit-under-test.
- New tests cover routes the immutable acceptance suite cannot reach (PIPELINE_COMPLETE final-phase block; clock/writer fail-closed) — additive, no double-coverage.

## Lens 2 — Clean Architecture / hexagonal (weight 0.25) → PASS

- Domain stays pure; rework is confined to the application seam. `handle` wraps clock + read + decide + write; catch maps any fault to `unreadableFact` → `block`, inner try swallows fallback-audit failure and still returns block. No I/O or clock leaks into Domain.
- Deny-by-default + fail-closed intact: positive single-equality match is the only `allow`; every Err and every throw routes to deny/block (ADR-004).
- Conformist (ADR-005): zero literal phase/agent names; config-driven throughout. Object Calisthenics held — `handle` single-concern, ≤25 lines.

## Lens 3 — Correctness / contract alignment (weight 0.35) → PASS

- Contract 3 step 6 now satisfied: a throw from `clock.now()`, `read`, `decide`, or `write` is caught, audited as a fallback record, and returns block — application-level guarantee complete, no longer leaning on platform posture.
- Contracts 1/2/4 unchanged and conformant: frozen VO + skipPhases; four-stage policy with `?? 3`, PIPELINE_COMPLETE, skip-walk; 8-field audit, one fact per evaluation.
- low — on writer-throw the fallback code is UNREADABLE_STATE though state was readable; acceptable since the contract demands only block+audit, not fault discrimination.

## Lens 4 — Risk / mutation readiness (weight 0.15) → PASS

- PIPELINE_COMPLETE app-boundary route now pinned: asserting code + null expectedAgent kills `blockedFact` routing mutants. Retry boundary, skip off-by-one, `?? 3` remain killed.
- Fail-closed wrap exercised both ways (clock + writer throw) and fallback-audit suppression covered by the disk-full case. low — throw tests assert decision only, not fallback code, leaving the UNREADABLE_STATE literal partially unmutated; minor.

---

## Dissent analysis

No dissent — all four lenses pass. Attempt-1 minority FAIL (Lens 3) is now upheld-then-resolved: clock/write are inside the try and the catch fails closed.

## Weighted synthesis

0.35·PASS + 0.25·PASS + 0.25·PASS + 0.15·PASS. Zero blocker, zero high, zero medium; two low residuals only. Severity matrix (low only) → APPROVED.

## FINAL VERDICT

APPROVED
