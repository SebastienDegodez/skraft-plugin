<!-- markdownlint-disable-file -->
# DELIVER Adversarial Review — US3-G1 Dispatch-Order Guard (#49)

Phase: DELIVER · Date: 2026-06-28 · Project slug: us3-g1-dispatch-order-guard
Reviewer: software-engineer-reviewer (read-only) · depthTier: comprehensive (4 lenses + weighted synthesis) · difficulty: medium · Attempt: 1
Baseline asserted: 28/28 GREEN · 100% coverage on new modules · `node scripts/local-ci.mjs` PASS

## Modules under review

| Module | Kind | Verdict |
|---|---|---|
| plugins/skraft-framework/src/domain/state-schema.mjs | pure Domain Service | clean |
| plugins/skraft-framework/src/domain/pipeline-policy.mjs | pure Domain Service | clean |
| plugins/skraft-framework/src/application/pre-tool-use-service.mjs | use case | one contract gap |
| tests/*.unit.test.mjs, *.acceptance.test.mjs | suites | acceptance immutable; minor gaps |

---

## Lens 1 — Test integrity / Iron Rule (weight 0.25) → PASS

- Acceptance literals immutable; CONFIG copied verbatim from `skraft-framework.config.json` (#48); `retryBudget` deliberately omitted to exercise the policy default of 3 — Iron Rule held.
- Tests assert observable behaviour: returned `decision` (`allow`/`deny`/`block`) + `DispatchEvaluated` audit fact. DENY rows assert `message.includes(expectedAgent)` — outcome text, not internals. No production logic in tests; no tautology.
- RED→GREEN authentic: 3 modules created to satisfy a pre-existing RED acceptance file. D1/D2/D3 inner tests cover only `branch_unreachable_via_AC` / `combinatorial_economy` — no double-coverage.
- **low** — AC-01 row g omits `event`/`projectSlug`/`evaluatedAt` audit assertions (covered elsewhere); cosmetic.

## Lens 2 — Clean Architecture / hexagonal (weight 0.25) → PASS

- Domain pure: no I/O, no clock, no fs; both services take config + state only. Application wires `stateReader`/`auditWriter`/`config`/`clock`; no derivation leaks down.
- Deny-by-default holds: `allow()` only on positive `requestedAgent === expectedAgent`. No default-allow path.
- Fail-closed: every `Err` maps to `deny` (OUT_OF_ORDER) or `block` (INVALID_STATE/RETRY_EXHAUSTED/UNREADABLE_STATE/PIPELINE_COMPLETE); reader throw → `unreadableFact` → block (ADR-004).
- Conformist (ADR-005): zero literal phase/agent names; `phaseOrder`/`phaseAgents`/`retryBudget ?? 3` read from injected config. Object Calisthenics satisfied (all functions single-concern, ≤25 lines).

## Lens 3 — Correctness / contract alignment (weight 0.35) → FAIL

- Contract 1 ✓ frozen VO, frozen `skipPhases`, all five field rules exact. Contract 2 ✓ four stages + `?? 3` + PIPELINE_COMPLETE + skip walk; `evaluateDispatch` single-equality deny-by-default. Contract 4 ✓ 8-field shape; decision→harness→audit-code mapping exact; one fact per evaluation.
- **high** — Contract 3 step 6 ("whole `handle` wrapped so any throw ⇒ audit + block") not met: `clock.now()` and `auditWriter.write()` sit OUTSIDE the try/catch. A clock/writer throw escapes unaudited. Mitigated by ADR-004 `type:command` platform fail-closed, but the application-level guarantee is contract-incomplete. → [pre-tool-use-service.mjs](plugins/skraft-framework/src/application/pre-tool-use-service.mjs#L54)
- **medium** — adapter-exception fail-closed unverified (no test for clock/writer throw); AC-04 covers reader/schema only.

## Lens 4 — Risk / mutation readiness (weight 0.15) → PASS (with gap)

- Retry boundary pinned (2 within / 3 exhausted) — kills `>=`/`>` and `?? 3` mutants. `nextPhaseAfter` index+skip off-by-one killed by rows a/e. Object Calisthenics clean.
- **medium** — PIPELINE_COMPLETE has no app-boundary test (domain D2 only); `blockedFact` routing for that code is unmutated. Acknowledged in DISTILL rec 4 as residual; mapping is identical to other block codes, so risk is low but real.

---

## Dissent analysis

Lens 3 (FAIL) is the minority. Upheld, not overridden: the `clock.now()`/`auditWriter.write()` lines are genuinely outside the wrapper. Security is preserved by the platform `type:command` fail-closed posture, so it is not a blocker, but it is a real divergence from Contract 3 step 6 and pairs with Lens 4's PIPELINE_COMPLETE app-boundary gap. Two convergent findings on the application seam justify rework over approval.

## Weighted synthesis

0.35·FAIL + 0.25·PASS + 0.25·PASS + 0.15·PASS. One high + two medium, zero blocker. Severity matrix (≥1 high) → NEEDS_REWORK. Cheap, well-scoped fixes; no design defect.

## FINAL VERDICT

NEEDS_REWORK

## Actionable findings

1. **[high]** Wrap the whole `handle` body — move `clock.now()` and `auditWriter.write()` inside the try, with a catch → `block(...)` + audit fallback, satisfying Contract 3 step 6. [pre-tool-use-service.mjs](plugins/skraft-framework/src/application/pre-tool-use-service.mjs#L54-L62)
2. **[medium]** Add one app-boundary test: DELIVER + APPROVED → `block` / `PIPELINE_COMPLETE`, killing the unmutated `blockedFact` route.
3. **[medium]** Add a fail-closed test for clock/writer throw asserting `block` + audited (or note as accepted residual once #1 lands).
4. **[low]** Complete row g audit assertions (`event`/`projectSlug`/`evaluatedAt`).
