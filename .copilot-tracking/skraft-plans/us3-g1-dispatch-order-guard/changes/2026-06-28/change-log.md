<!-- markdownlint-disable-file -->
# Change Log — US3-G1 Dispatch-Order Guard (#49)

Phase: DELIVER · Date: 2026-06-28 · Project slug: us3-g1-dispatch-order-guard
Difficulty: medium (inline TDD, multi-commit) · Depth tier: comprehensive · Pipeline: COMPLETE

## Story

US3-G1 — A deny-by-default `preToolUse` dispatch-order guard that intercepts agent dispatch,
derives the single expected next agent from the published pipeline config, and allows / denies /
blocks fail-closed (ADR-004) as a Conformist consumer of the generated config (ADR-005).

## Modules delivered

| Module | Layer | Responsibility |
|---|---|---|
| plugins/skraft-framework/src/domain/state-schema.mjs | Domain | `validateState(raw) -> Result` — frozen PipelineState VO, fail-closed on bad shape |
| plugins/skraft-framework/src/domain/pipeline-policy.mjs | Domain | `expectedNextAgent` (SPECIALIST/REVIEWER/RETRY/ADVANCE, `retryBudget ?? 3`, PIPELINE_COMPLETE) + `evaluateDispatch` single-equality deny-by-default |
| plugins/skraft-framework/src/application/pre-tool-use-service.mjs | Application | `createPreToolUseService(...).handle()` — read→validate→evaluate→one DispatchEvaluated audit→harness; whole body fail-closed to block |

Stryker mutation scope extended to the three modules (plugins/skraft-framework/src/stryker.config.mjs).

## Tests

| Suite | Tests | Role |
|---|---|---|
| tests/skraft-framework/dispatch-order-guard.acceptance.test.mjs | 14 | Outer loop AC-01..AC-04 (immutable) |
| tests/skraft-framework/pipeline-policy.unit.test.mjs | D1/D2 + retry grid | REVIEWER, PIPELINE_COMPLETE, retry-budget boundary |
| tests/skraft-framework/state-schema.unit.test.mjs | D3 grid | invalid-field reject matrix |
| tests/skraft-framework/pre-tool-use-service.unit.test.mjs | 3 | PIPELINE_COMPLETE block + clock/writer fail-closed |

Final: 31/31 dispatch-guard green, full local CI 155/155 PASS, 100% coverage on new modules.

## Commits

- a5ba570 test(distill): RED acceptance suite + Gherkin + impl-plan (#49)
- 3965a55 feat(dispatch-guard): deny-by-default pre-tool-use dispatch order guard (#49)
- 32c01b9 fix(dispatch-guard): fail-closed wrap of handle + app-boundary tests (#49)
- 768ef28 chore(quality): add dispatch-guard modules to mutation scope (#49)

## Reviewer verdict

DELIVER reviewer (4 lenses, comprehensive): attempt 1 NEEDS_REWORK (1 high Contract 3 step 6 + 2 medium),
attempt 2 APPROVED — high resolved (whole handle fail-closed), both mediums closed, 2 cosmetic lows accepted.

## Evidence

No UI surface — config-time dispatch guard; no Playwright evidence applicable.
