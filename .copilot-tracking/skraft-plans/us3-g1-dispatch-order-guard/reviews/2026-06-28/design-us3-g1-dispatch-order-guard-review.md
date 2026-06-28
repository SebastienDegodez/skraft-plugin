<!-- markdownlint-disable-file -->

# DESIGN Review — us3-g1-dispatch-order-guard (#49)

**Verdict:** APPROVED
**Depth tier:** comprehensive
**Lenses executed:** 4
**Weighted score:** 0.93
**Rework attempt:** 2 of 3
**Difficulty:** medium
**Reviewed artifacts:**
- docs/adr/adr-004-deny-by-default-dispatch-gate.md
- docs/adr/adr-005-config-published-language.md
- docs/adr/decisions-index.md
- .copilot-tracking/skraft-plans/us3-g1-dispatch-order-guard/details/2026-06-28/event-model-us3.md
- .copilot-tracking/skraft-plans/us3-g1-dispatch-order-guard/details/2026-06-28/contracts-us3.md
- .copilot-tracking/skraft-plans/us3-g1-dispatch-order-guard/details/2026-06-28/consistency-matrix-us3.md

**Escalation gate (G13):** PASS — consistency matrix reports `open blockers: 0`; no `decision-drift-*.md` awaiting a sibling `-resolution.md`. Review not short-circuited.

---

## Attempt-1 regression check (the two flagged issues)

| Attempt-1 finding | Status in attempt 2 | Evidence |
|---|---|---|
| ADR-inflation (4 story ADRs, 2 restating baseline) | **RESOLVED** | old ADR-004 (pipeline-policy purity → hexagonal baseline ADR-002) and old ADR-006 (recorded-state schema → DDD tactical baseline) retired; kept the 2 genuine trade-offs, renumbered contiguously (ADR-004 deny, ADR-005 config). Consolidation note + back-prop journal round 2 document it. |
| Hook-event concern | **RESOLVED** | `preToolUse` + matcher `Agent`/`task` + `type: command` pinned and reasoned across ADR-004, event-model, and contracts; `http` explicitly rejected as fail-open. |

### Task-specified verification points

- **(a) No lingering retired-ADR references except retirement notes — CONFIRMED.** ADR-006/ADR-007 appear *only* in the consistency-matrix consolidation note and the `retired_adrs` registry entry. `event-model-us3.md` and `contracts-us3.md` cite only ADR-001/002/004/005 — zero retired-ADR citations.
- **(b) Kept ADRs are genuine cross-cutting trade-offs — CONFIRMED.** ADR-004 ratifies a fail-closed *security posture* (over-blocking accepted vs. silent security hole) — not a baseline. ADR-005 ratifies a *context-mapping* decision (Conformist chosen over ACL on technical merit) — not a baseline. Both carry `Alternatives Rejected` tables with the "do without" option evaluated (G11/G15 satisfied; the two baseline-restating ADRs were correctly removed).
- **(c) `preToolUse` + `Agent`/`task` + `type: command` grounding correct and load-bearing — CONFIRMED (internal).** `preToolUse` is the only documented pre-execution, deny-capable event; `subagentStart` "cannot block creation", `subagentStop`/`agentStop` fire after the turn. `type: command` is fail-closed (crash/non-zero exit → deny); `type: http` is fail-open — so AC-04 holds **only** under `type: command`. The pin is genuinely load-bearing and consistently threaded through all three artefacts.
- **(d) Consistency gate PASS and supersessions=0 justified — CONFIRMED.** `consistency-gate: PASS`, `open blockers: 0`, canonical-label table identical across artefacts, back-propagation journal filled. `supersessions: 0` is correctly justified: the retired ADRs were `Proposed` and never ratified/indexed, so they are *removed*, not *superseded* (supersession applies only to `Accepted` ADRs — G2/G12 satisfied).

---

## Lens 1 — Completeness (score 1.0)

- AC-01 (advance / skip / reviewer / retry / skipPhases derivation) [OK] — covered by the expected-next-agent derivation table (7 stages) and the AC-01 rows a–g reproduction; `skipPhases` handled via "next non-skip phase" (row e: DESIGN skipped).
- AC-02 (block before execution, names expected agent) [OK] — `preToolUse` returns deny/block pre-run; `deny`/`block` messages name `expectedAgent` (Contract 3).
- AC-03 (deterministic + append-only audit) [OK] — pure `evaluateDispatch`; exactly one `DispatchEvaluated` per evaluation (Contract 4), runs on ALLOW and DENY.
- AC-04 (fail-closed) [OK] — `type: command`; `UNREADABLE_STATE`/`INVALID_STATE` → `block`; `handle` wrapped so any exception → `block`; no default-allow path.
- Mandatory artefacts [OK] — ADRs, event-model, contracts, consistency-matrix all present; component diagram + context map embedded in event-model (separate `diagrams-us3.md` absence explicitly noted and acceptable).

## Lens 2 — Business Fit (score 1.0)

- ADR consolidation [OK] — the eligibility audit correctly distinguished baseline re-declarations (removed) from genuine trade-offs (kept). Faithful to the ADR-inflation gate.
- Domain vocabulary [OK] — `expected next agent`, `dispatch decision`, `deny/block`, `out-of-order`, `audit fact` align with the anti-drift guard intent (#49).
- Scope discipline [OK] — explicitly "no new Aggregate, no new Repository"; reuses `StateReader`/`AuditWriter`/`PreToolUse` ports and `decision.mjs`. No invented requirements, no scope creep (YAGNI/G9 honoured).
- Conformist choice serves intent [OK] — conforming to the published config makes phase reorders / agent renames / skip changes propagate without a policy edit, which is exactly the business outcome AC-01 needs.

## Lens 3 — Quality (score 0.5)

- Cross-references resolve [OK] — ADR-001/002/003 indexed `Accepted`; ADR-004/005 indexed `Proposed`, story #49 — matches frontmatter. Reused modules verified to exist (`decision.mjs` exposes `allow/deny/block`; `ports/api/pre-tool-use.mjs` present).
- Label coherence [OK] — `evaluateDispatch` (runtime) deliberately distinct from build-time `dispatch-policy.mjs::validateDispatch(descriptors)`; `AgentName` relabelled to primitive `string` consistently across all artefacts; canonical-label table internally consistent.
- DDD label tension [INCONSISTENT] — `PipelineGuardContext` is declared a **Core** subdomain, while ADR-005 casts it as a **Conformist** downstream of the config Published Language. Per the project's own G6 / V-DDD-09 rule, a Core subdomain should protect its Ubiquitous Language via an ACL rather than conform. The design is *defensible* (the guard conforms only to generic config vocabulary — phase/agent names — while its core decision language `expected-next-agent / deny-block` is fully owned and never conformed; no translation occurs, so it is genuinely Conformist, not a disguised ACL per V-DDD-10), and the context-map arrows themselves are correctly labelled `Published Language` / `Open Host Service`. But the Core+Conformist pairing is left implicit and reads as a tension. Non-blocking; one clarifying sentence resolves it.

## Lens 4 — Risk (score 1.0)

- Clean Architecture invariants [OK] — `PipelinePolicy` and `state-schema` are pure Domain Services (no IO); cross-config checks deferred to the policy; the use case injects driven adapters. No Domain→Infrastructure/API import (G3); interfaces are ports (G4).
- Hook-event grounding assumptions explicit and bounded [OK] — ADR-004 names the exact event, matcher, hook type, and the fail-open/fail-closed semantics, and rejects each alternative with its verbatim limitation. The AC-04-critical assumption is stated and bounded, not hidden.
- Determinism + audit integrity [OK] — pure decision rule + single `DispatchEvaluated` per attempt; deterministic Result.
- supersessions=0 risk [OK] — no dangling supersession; retired ADRs leave no source-of-truth references in descriptive artefacts.
- No INVARIANT_VIOLATION, no HIDDEN_COUPLING that the artefact silently violates.

---

## Weighted synthesis

| Lens | Score | Weight | Contribution |
|---|---|---|---|
| Completeness | 1.0 | 0.30 | 0.300 |
| Business Fit | 1.0 | 0.30 | 0.300 |
| Quality | 0.5 | 0.15 | 0.075 |
| Risk | 1.0 | 0.25 | 0.250 |
| **Total** | | | **0.925** |

Weighted score **0.93 ≥ 0.85** and no lens scored 0.0 → **APPROVED**. The dominant strength is the clean resolution of both attempt-1 findings: the ADR set is now two genuine cross-cutting trade-offs (G15 inflation cleared), and the `preToolUse` + `Agent`/`task` + `type: command` chain is correctly grounded and load-bearing for AC-04. The only non-OK signal is a single Quality `INCONSISTENT` finding — a defensible-but-implicit Core/Conformist DDD label tension — which is advisory and does not justify a third rework cycle. All 15 gates (G1–G15) plus the escalation gate (G13) pass.

**No dissent:** all four lenses concur on a passing outcome; no lens fails.

---

## FINAL VERDICT: APPROVED

---

## Advisory notes (non-blocking — fold into ratification, not a rework cycle)

1. **Quality / G6 (DDD label clarity).** In ADR-005, add one sentence distinguishing the **Core** decision logic (`expected-next-agent` rule — owned, never conformed) from the **generic config vocabulary** (phase/agent names — conformed-to). This removes the apparent Core-subdomain-as-Conformist tension without changing the design.
2. **Risk / traceability.** Pin the exact GitHub Copilot hooks-reference URL + anchor (the runtime→Claude tool-name table and the command-vs-http fail semantics) inside ADR-004, so the AC-04-critical grounding is independently verifiable by DISTILL/DELIVER rather than asserted.
3. **Lifecycle.** ADR-004/005 are `Proposed`; on this APPROVED verdict, ratify them to `Accepted` and set `ratified_by` in both frontmatter and `decisions-index.md` before DISTILL consumes them as source of truth.
