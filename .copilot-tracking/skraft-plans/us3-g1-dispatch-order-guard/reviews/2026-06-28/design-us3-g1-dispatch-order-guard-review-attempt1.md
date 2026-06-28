<!-- markdownlint-disable-file -->

# DESIGN Review — us3-g1-dispatch-order-guard

**Verdict:** NEEDS_REWORK
**Depth tier:** comprehensive
**Lenses executed:** 4
**Weighted score:** 0.65
**Confidence:** high
**Reviewed artifacts:**
- details/2026-06-28/event-model-us3.md
- details/2026-06-28/contracts-us3.md
- docs/adr/adr-004-pipeline-policy-runtime-guard.md
- docs/adr/adr-005-deny-by-default-dispatch-gate.md
- docs/adr/adr-006-recorded-state-schema.md
- docs/adr/adr-007-config-derived-expected-dispatch.md
- docs/adr/decisions-index.md
- (upstream) plans/2026-06-28/ac-draft-us3.md
**Conventions cross-checked:** plugins/src/domain/result.mjs, plugins/src/adapters/api/hooks/decision.mjs, plugins/src/ports/api/pre-tool-use.mjs, plugins/src/domain/dispatch-policy.mjs

---

## Gate results (architecture-review-criteria)

| Gate | Result | Evidence |
|---|---|---|
| G1 structural→ADR traceability | PASS | Every structural commitment (pipeline-policy, state-schema, pre-tool-use-service, deny-by-default, config-derivation) traces to a Proposed ADR-004..007. `Proposed` is the correct state — ratification is the explicit next gate, not a defect. |
| G2 no contradicting ADRs / supersession integrity | PASS | `supersedes: null` on all four; 004–007 are mutually complementary and do not contradict 001–003. No supersession ⇒ no registry rows required. |
| G3 dependency rule (Domain/App ⊀ Infra/API) | PASS | `domain/pipeline-policy.mjs` and `domain/state-schema.mjs` are pure, IO-free, depend only on `domain/result.mjs`. `application/pre-tool-use-service.mjs` receives `stateReader`/`auditWriter`/`config`/`clock` by injection. |
| G4 interfaces in Application/ports | PASS | `StateReader`/`AuditWriter` are pre-existing driven ports; `PreToolUse` is the driver port. No interface in Infrastructure. |
| G5 aggregate invariants self-contained | PASS | "No new Aggregate, no new Repository." Only VOs + Domain Services; guard reads externally-owned state, never mutates. |
| G6 context map labelled + admissible | PASS | Arrows labelled: Published Language (config→guard, state→guard), Open Host Service (guard→orchestrator). `PipelineGuardContext` is Core. |
| G7 story→trigger | PASS | US3/#49 → Command `RequestAgentDispatch`. |
| G8 command→event | PASS | `RequestAgentDispatch` → `DispatchEvaluated`. |
| G9 YAGNI | PASS | No new aggregate/context, no Event Sourcing, no Saga. Every VO/Service traces to AC-01..04. |
| G10 consistency-matrix per story | THIN | Consistency check is INLINE (event-model Phase 9) rather than a standalone `consistency-matrix-us3.md`. Substance present; canonical artefact absent. |
| G11 complexity-pattern justification | N/A (PASS) | No CQRS/ES/Saga/eventual-consistency/micro-service/ACL adopted. |
| G12 supersession-plan realisation | N/A (PASS) | No supersession plan. |
| G13 escalation gate | PASS | No `decision-drift-*.md` blocker files; 0 open blockers. |
| G14 no verdict-bearing filenames / Rejected traceability | PASS | Filenames name topics only; all carry `Status: Proposed`. |
| G15 no baseline-restating ADR | PASS | 004/005/006/007 are genuine decisions, not restatements of ADR-001/002/003. |

No BLOCKER or HIGH gate violated. Verdict driven by one MEDIUM cross-module clarity flaw plus the G10 deviation.

---

## Lens 1 — Completeness (score 0.5)
- AC-01..AC-04 all architecturally satisfied [OK].
- ADR coverage [OK] — each structural commitment has a matching Proposed ADR.
- Standalone consistency-matrix [THIN] — G10 evidence inline in event-model Phase 9, not in `consistency-matrix-us3.md`.

## Lens 2 — Business Fit (score 1.0)
- Vocabulary [OK], operator intent [OK], no scope creep [OK], persona-observable behaviour [OK].

## Lens 3 — Quality (score 0.5)
- Cross-module function homonym [INCONSISTENT] — Contract 2 names the runtime decision function `validateDispatch(requestedAgent, state, config)` in `domain/pipeline-policy.mjs`, but `domain/dispatch-policy.mjs` already exports `validateDispatch(descriptors)`. Two same-named exports in the same `domain/` folder undercut ADR-004's own *critical* disambiguation goal. Module separation is correct; the **function name** is not.
- Internal consistency [OK] — no CLASSIFICATION_DRIFT / STRUCTURAL_DRIFT.
- ADR template quality [OK] — Context/Decision/Consequences/Alternatives all substantive; frontmatter complete.
- AgentName granularity [INCONSISTENT — LOW] — event model labels `AgentName` a VO; contracts model the agent as primitive `string`.

## Lens 4 — Risk (score 0.5)
- Invariants [OK]; fail-closed posture [OK].
- Downstream confusion risk [AMBIGUOUS_ASSUMPTION] — the `validateDispatch` homonym is a concrete miswiring vector for DELIVER (`import { validateDispatch }` could resolve to the wrong `domain/` module).
- Config dependency [OK] — ADR-007 bounds the assumption.

---

## Synthesis

Strong, deliberately minimal DESIGN: the seven-row AC-01 table is correctly collapsed to a single equality rule, purity is preserved end-to-end, the fail-closed posture satisfies AC-04 by construction, and all four ADRs are genuine, well-templated decisions contradicting neither each other nor ADR-001/002/003. The dominant blocking concern is Quality/Risk, not architecture: the contract reuses the export name `validateDispatch` already owned by the build-time `domain/dispatch-policy.mjs`, undercutting the very disambiguation ADR-004 was written to guarantee. Secondary: the G10 consistency evidence is inline rather than a canonical `consistency-matrix-us3.md`. Weighted score 0.65 ⇒ NEEDS_REWORK (no lens 0.0; no INVARIANT_VIOLATION; not REJECTED).

## Required actions before next attempt

- **(Primary — MEDIUM)** Eliminate the `validateDispatch` cross-module homonym. Rename the runtime decision function in `domain/pipeline-policy.mjs` (e.g. `evaluateDispatch` / `decideDispatch`) and update Contract 2 in `contracts-us3.md`, the event-model decision rule, and ADR-004's Decision/Consequences text accordingly. Keep `expectedNextAgent` as-is.
- **(Secondary — process)** Promote the inline event-model Phase-9 consistency note into a standalone `consistency-matrix-us3.md` (gate line `consistency-gate: PASS`).
- **(Optional — LOW)** Align `AgentName` representation between event model (VO) and contracts (primitive `string`).

## Confirmations for the orchestrator

- ADR-004/005/006/007 all `Status: Proposed`, `ratified_by: null` — NOT prematurely Accepted.
- decisions-index.md rows 001/002/003 unchanged (`Accepted`); 004–007 `Proposed`.
- Runtime (`pipeline-policy.mjs`) vs build-time (`dispatch-policy.mjs`) module separation correct; only residual conflation is the shared function name flagged above.
- All four issue ACs architecturally satisfied.
