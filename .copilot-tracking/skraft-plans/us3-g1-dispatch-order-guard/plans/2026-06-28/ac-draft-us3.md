<!-- markdownlint-disable-file -->
# US3 — G1 Dispatch-Order Guard (anti wrong-agent)

Issue: #49 · Epic: #42 · Milestone: skraft-framework Phase 1 — MVP
Effort: M (≈1.0 day) · Priority: Must (P1) · DoR: ✅ 8/8

## Story

> As a **SKRAFT pipeline operator** `[PERSONA INFERRED — issue says "orchestrator" (the enforcing component); the human who launches and trusts the run is the value recipient]`,
> I want **every agent dispatch to be validated against the recorded pipeline state before that agent starts**,
> so that **the run can never silently skip a phase, run a reviewer before its specialist, or advance an unapproved phase — protecting me from drifted, wasted token spend and untrustworthy artefacts**.

### Problem statement

When the orchestrator auto-dispatches sub-agents, nothing stops it from invoking the wrong agent: jumping `DISCUSS → DISTILL` (skipping DESIGN), running `solution-architect-reviewer` before `solution-architect`, or advancing while the prior phase was not `APPROVED`. Each wrong dispatch burns tokens producing artefacts built on the wrong upstream input, and the failure is invisible until a human notices the drift. The operator needs a deterministic, fail-closed gate that blocks the dispatch *before* the agent runs.

## Domain Examples (real agent names + recorded state)

Phase order (from generated config): `DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER`; each phase has a `specialist` then a `reviewer`. Retry budget assumed `max = 3`.

1. **Conforming forward dispatch** — State: phase `DISCUSS`, reviewer verdict `APPROVED`, retries 0. Dispatch: `solution-architect` (DESIGN specialist). → **ALLOWED**.
2. **Skipped phase** — State: phase `DISCUSS`, verdict `APPROVED`. Dispatch: `acceptance-designer` (DISTILL specialist), skipping DESIGN. → **BLOCKED** (phase order).
3. **Reviewer before specialist** — State: phase `DESIGN` entered, no `solution-architect` artefact produced yet. Dispatch: `solution-architect-reviewer`. → **BLOCKED** (specialist-before-reviewer).
4. **Advance without approval** — State: phase `DISCUSS`, verdict `CHANGES_REQUESTED`, retries 1. Dispatch: `solution-architect` (next phase). → **BLOCKED** (advance only on `APPROVED`).
5. **Configured skip (skipPhases)** — Config/state `skipPhases: ["DESIGN"]`; State: phase `DISCUSS`, verdict `APPROVED`. Dispatch: `acceptance-designer` (DISTILL specialist). → **ALLOWED** (DESIGN legitimately skipped).
6. **Retry within budget** — State: phase `DISTILL`, verdict `CHANGES_REQUESTED`, retries 1 of 3. Dispatch: `acceptance-designer` (re-run same-phase specialist). → **ALLOWED** (retry).
7. **Retry budget exhausted** — State: phase `DISTILL`, verdict `CHANGES_REQUESTED`, retries 3 of 3. Dispatch: `acceptance-designer` again. → **BLOCKED** (retry exhausted → escalate).
8. **Unreadable / crashed state** — State: `state.json` missing, truncated, or unparseable. Dispatch: any agent. → **BLOCKED** (fail-closed, security).

## Acceptance Criteria

> Decision boundary = the `PreToolUse(Agent)` gate: an **allowed** dispatch lets the agent execute; a **blocked** dispatch denies it and the agent never runs. All ACs are observable at this boundary (allow/deny + audit record) without inspecting internal code.

### AC-01 — Dispatch decision follows the recorded pipeline state (rule table)

```
Given the pipeline state records the values in a row below
When the operator's run requests the dispatch in that row
Then the gate returns the expected decision for the stated reason
```

| # | Recorded phase | Specialist artefact present? | Reviewer verdict | Retry (max 3) | skipPhases | Requested dispatch | Decision | Reason |
|---|---|---|---|---|---|---|---|---|
| a | DISCUSS | yes | APPROVED | 0 | [] | solution-architect | ALLOW | conforming forward to next-phase specialist |
| b | DISCUSS | yes | APPROVED | 0 | [] | acceptance-designer | DENY | skipped DESIGN (phase order) |
| c | DESIGN | no | — | 0 | [] | solution-architect-reviewer | DENY | reviewer before specialist |
| d | DISCUSS | yes | CHANGES_REQUESTED | 1 | [] | solution-architect | DENY | advance only on APPROVED |
| e | DISCUSS | yes | APPROVED | 0 | [DESIGN] | acceptance-designer | ALLOW | DESIGN configured-skipped |
| f | DISTILL | yes | CHANGES_REQUESTED | 1 | [] | acceptance-designer | ALLOW | retry same-phase specialist within budget |
| g | DISTILL | yes | CHANGES_REQUESTED | 3 | [] | acceptance-designer | DENY | retry budget exhausted (escalate) |

(Traces examples 1–7. Each row is an independent test case; the same decision rule parametrises all rows — Scenario-Outline shape, not seven separate stories.)

### AC-02 — Out-of-sequence dispatch is blocked before the sub-agent executes

```
Given the pipeline state records phase DISCUSS with reviewer verdict APPROVED
When the run requests the DISTILL specialist (acceptance-designer), skipping DESIGN
Then the dispatch is blocked
And the acceptance-designer agent does not start (no DISTILL artefact is produced)
And the operator receives a blocked-dispatch outcome naming the expected next agent (solution-architect)
```

(Traces issue AC1 + example 2. Observable property: timing — block precedes execution; the skipped agent produces nothing.)

### AC-03 — Decision is deterministic from recorded state and is audited

```
Given a fixed recorded pipeline state
When the same dispatch is requested twice against that unchanged state
Then both attempts yield the identical allow/deny decision (no run-to-run variation, no inference beyond the recorded state)
And each attempt records an audit event capturing the requested agent, the expected agent, and the decision
```

(Traces issue AC3 + examples 1/4. Observable: repeatability + an audit entry per attempt.)

### AC-04 — Fail-closed when state cannot be read

```
Given the recorded pipeline state is missing, truncated, or unparseable
When any dispatch is requested
Then the dispatch is blocked
And the blocked-dispatch outcome reports an unreadable-state cause
And no sub-agent is started
```

(Traces issue AC4 + example 8. Security property: absence of a valid decision input denies, never allows.)

## Issue-AC → Acceptance-Criteria Coverage

| Issue #49 AC | Covered by | Examples |
|---|---|---|
| (1) out-of-order BLOCKED before sub-agent execution | AC-01 rows b/c/d/g + AC-02 | 2, 3, 4, 7 |
| (2) conforming dispatch ALLOWED | AC-01 rows a/e/f | 1, 5, 6 |
| (3) deterministic from state.json (no inference) + audit event | AC-03 | 1, 4 |
| (4) fail-closed on hook crash / unreadable state | AC-04 | 8 |

All four issue ACs are covered by testable, boundary-observable criteria.

## Technical Notes (constraints for DESIGN/DELIVER — not part of the story body)

- **Naming disambiguation (critical):** the new runtime module is `domain/pipeline-policy.mjs` exposing `expectedNextAgent(state, config)` + `validateDispatch(requestedAgent, state, config)`. Do **NOT** conflate with the existing `plugins/skraft-framework/src/domain/dispatch-policy.mjs`, which is a **build-time** structural-presence invariant (`is_root XOR dispatched_by`) run at `config:check`. Different lifecycle, different signature, different file.
- **Purity:** `pipeline-policy.mjs` must be a pure domain function — no IO. State is read through the existing driven adapter `plugins/skraft-framework/src/adapters/infrastructure/json-state-reader.mjs` (#47, present) and passed in.
- **Config source:** consumes the generated `plugins/skraft-framework/skraft-framework.config.json` — `phaseOrder` and `phaseAgents.{phase}.{specialist,reviewer}` (#48, present). The guard derives "expected next agent" from these; it must not hardcode agent names or order.
- **New artefacts in scope:** `domain/state-schema.mjs` (state shape: current phase, specialist-done flag, reviewer verdict, retry counter, `skipPhases`) and `application/pre-tool-use-service` wiring the pure policy onto the `PreToolUse(Agent)` hook with a **deny-by-default** posture.
- **Fail-closed:** any exception in reading/parsing state or evaluating the policy must resolve to DENY (AC-04). Never default-allow.
- **Retry budget:** retry semantics (re-run same-phase specialist on `CHANGES_REQUESTED` up to max) live in the policy; exhaustion blocks and signals escalation (AC-01 g).
- **Testing:** boundary-to-boundary tests at the `PreToolUse(Agent)` gate (allow/deny + audit), driven by the AC-01 table as parametrised cases. Reuses proven genesis A9/S4/S7 patterns. Labels: `clean-architecture`, `tests`, `area/domain`.
- **Reference:** `.specs/plans/2026-06-20-skraft-framework-guardrails-plan.md` Task 3 == this US.

## Dependencies

- **#47** — Foundation Clean Architecture (ports/adapters + `json-state-reader.mjs`) — **DONE/merged** (SATISFIED).
- **#48** — Config generator (`phaseOrder` + `phaseAgents`) — **DONE/merged** (SATISFIED).
- Epic **#42** — open umbrella, non-blocking.
- Downstream dependents (NOT this story): **#10** (G6 continuation), **#11** (G7/G8 session) consume this guard.

## Definition of Ready — 8/8 ✅

- [x] **1. Problem statement** — concrete operator pain (silent wrong/skipped dispatch, wasted tokens), not "implement X".
- [x] **2. Specific persona** — SKRAFT pipeline operator (named role; inference flagged).
- [x] **3. 3+ domain examples** — 8 concrete examples with real agent names and recorded-state values.
- [x] **4. UAT scenarios** — Given/When/Then ACs validatable at the dispatch boundary.
- [x] **5. AC derived from UAT** — coverage table maps every AC to examples and to the four issue ACs.
- [x] **6. Right-sized** — M (≈1 day); 4 ACs (table-parametrised), single coherent guard behaviour; not XL.
- [x] **7. Technical notes** — naming disambiguation, purity, config/state sources, fail-closed, retry budget, test boundary.
- [x] **8. Dependencies** — #47, #48 (both DONE); epic + downstream dependents listed.
