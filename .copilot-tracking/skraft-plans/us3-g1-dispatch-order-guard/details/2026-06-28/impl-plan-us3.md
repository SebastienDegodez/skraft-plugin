<!-- markdownlint-disable-file -->
# Implementation Plan — US3 / G1 Dispatch-Order Guard (#49)

Phase: DISTILL · Date: 2026-06-28 · Project slug: us3-g1-dispatch-order-guard
Stack: Node.js ESM (`.mjs`, Node 22, zero runtime deps) · Hexagonal Clean Architecture · `Result` (ADR-001)
Sources: ac-draft-us3.md (AC-01..AC-04), event-model-us3.md, contracts-us3.md, ADR-004, ADR-005
Outer loop authored by acceptance-designer (this plan). Inner unit tests + production code: software-engineer (DELIVER).

## Boundary under test

All acceptance scenarios enter through ONE use-case boundary:

```text
createPreToolUseService({ stateReader, auditWriter, config, clock }).handle({ requestedAgent, projectSlug })
```

`application/pre-tool-use-service.mjs` conforms to the `PreToolUse` driver port
(`plugins/src/ports/api/pre-tool-use.mjs`) and returns a harness decision from
`decision.mjs` (`allow` / `deny` / `block`). The test observes (1) the returned decision and
(2) the append-only `DispatchEvaluated` audit fact — never an internal domain object (Mandate 1).

## Walking Skeleton — Strategy A (full in-memory)

The guard performs no persistent I/O of its own: it *reads* externally-owned state through the
injected `StateReader` port and *appends* through the injected `AuditWriter` port. No DB, no network
⇒ **Strategy A** (decision tree: no persistent storage owned here). The walking skeleton is AC-01 row
**a** (conforming forward dispatch → ALLOW) driven boundary-to-boundary with an in-memory state reader
and a collecting audit writer. It proves the whole wire: read → validate → evaluate → audit → map decision.

## Coverage matrix (Mandate 1–4)

Every `Layer = Domain` row carries an `Extraction Reason` code and is authored by the
**software-engineer** in the inner loop (NOT by acceptance-designer). Application rows are the outer
acceptance test in this deliverable.

| # | Scenario | Use Case Boundary | Layer | Extraction Reason | Double | Walking Skeleton | Priority |
|---|---|---|---|---|---|---|---|
| 1 | AC-01 a — ALLOW (advance to next-phase specialist) | `handle` | Application | — | InMemory stateReader + collecting auditWriter | A | P1 |
| 2 | AC-01 e — ALLOW (DESIGN configured-skipped) | `handle` | Application | — | InMemory | A | P1 |
| 3 | AC-01 f — ALLOW (retry within budget) | `handle` | Application | — | InMemory | — | P2 |
| 4 | AC-01 b — DENY (skipped DESIGN, names expected) | `handle` | Application | — | InMemory | — | P2 |
| 5 | AC-01 c — DENY (reviewer before specialist, names expected) | `handle` | Application | — | InMemory | — | P2 |
| 6 | AC-01 d — DENY (advance only on APPROVED, names expected) | `handle` | Application | — | InMemory | — | P2 |
| 7 | AC-01 g — BLOCK (retry budget exhausted → escalate) | `handle` | Application | — | InMemory | — | P2 |
| 8 | AC-02 — deny before run, no DISTILL artefact, names expected | `handle` | Application | — | InMemory | — | P1 |
| 9 | AC-03 — deterministic (twice → identical) + one audit per attempt | `handle` | Application | — | InMemory collecting auditWriter | — | P1 |
| 10 | AC-03 — one audit record per evaluation on allow AND deny | `handle` | Application | — | InMemory | — | P2 |
| 11 | AC-04 — missing/unreadable state → block (UNREADABLE_STATE) | `handle` | Application | — | throwing stateReader | — | P1 |
| 12 | AC-04 — truncated/unparseable state → block (UNREADABLE_STATE) | `handle` | Application | — | throwing stateReader | — | P2 |
| 13 | AC-04 — schema-invalid state → block (INVALID_STATE) | `handle` | Application | — | InMemory bad-shape | — | P1 |
| 14 | AC-04 — phase outside published order → block (INVALID_STATE) | `handle` | Application | — | InMemory out-of-order phase | — | P2 |
| D1 | REVIEWER stage — specialist done, verdict null → expect reviewer | `expectedNextAgent(state, config)` | Domain | `branch_unreachable_via_AC` | None (pure) | — | P2 |
| D2 | PIPELINE_COMPLETE — APPROVED on the last phase → no forward agent | `expectedNextAgent(state, config)` | Domain | `branch_unreachable_via_AC` | None (pure) | — | P3 |
| D3 | state-schema invalid-field grid (each field's reject branch) | `validateState(raw)` | Domain | `combinatorial_economy` | None (pure) | — | P2 |

### Mandate 4 rationale (why D1–D3 are extracted, why nothing else is)

- **D1 REVIEWER & D2 PIPELINE_COMPLETE — Gate (a) `branch_unreachable_via_AC`.** The event-model
  derivation defines a REVIEWER branch (`specialistDone = true`, `verdict = null`) and a
  PIPELINE_COMPLETE branch (`APPROVED` on the last phase). No AC-01 row exercises either, and the AC
  is immutable in DISTILL — so the AC physically cannot observe these branches. They are decided
  design branches, not undecided business cases ⇒ inner-loop domain test, not an escalation.
- **D3 state-schema grid — Gate (b) `combinatorial_economy`.** `validateState` has one reject branch
  per field (currentPhase empty, specialistDone non-boolean, reviewerVerdict outside the set, retries
  non-integer / negative, skipPhases non-array). AC-04 case 3 reaches ONE representative invalid shape;
  sweeping the full field grid through Gherkin would explode scenario count past the 10–15 threshold ⇒
  delegate the sweep to one parameterized domain test.
- **No domain test for the AC-01 decision grid.** The 7 AC-01 rows (< 10–15) reach ADVANCE (a/b/e),
  SPECIALIST (c), RETRY (d/f) and RETRY_EXHAUSTED (g) via the acceptance boundary. `A(P) ⊇` those
  branches and the count is under threshold ⇒ a dedicated `evaluateDispatch` decision-grid domain test
  would be **DOUBLE-COVERAGE**. Record: `M4 negative — saturated by AC`.

## Modules to create (event-model reuse table)

| Module | Kind | Notes |
|---|---|---|
| `plugins/src/domain/state-schema.mjs` | pure Domain Service | `validateState(raw) -> Result<PipelineState>` (Contract 1). No I/O. |
| `plugins/src/domain/pipeline-policy.mjs` | pure Domain Service | `expectedNextAgent(state, config)` + `evaluateDispatch(requestedAgent, state, config)` (Contract 2). No I/O. **Distinct from build-time `domain/dispatch-policy.mjs` — no shared symbol.** |
| `plugins/src/application/pre-tool-use-service.mjs` | use case | `createPreToolUseService(...).handle(payload)` (Contract 3). Wires read → validate → evaluate → audit → map. Deny-by-default; whole `handle` wrapped so any throw ⇒ `block` (ADR-004). |

Reused as-is: `result.mjs`, `decision.mjs`, `json-state-reader.mjs` (#47), `jsonl-audit-writer.mjs`,
generated `skraft-framework.config.json` (#48), `pre-tool-use.mjs` port. **Do not touch**
`domain/dispatch-policy.mjs` (build-time invariant, different lifecycle).

## Decision → harness mapping (Contracts 3 + 4)

| Policy outcome | Harness decision | Audit `decision` | Audit `code` |
|---|---|---|---|
| conforming (requested === expected) | `allow()` | `ALLOW` | `CONFORMING` |
| `OUT_OF_ORDER` | `deny(reason)` (names expected agent) | `DENY` | `OUT_OF_ORDER` |
| `RETRY_EXHAUSTED` | `block(reason)` (escalate) | `DENY` | `RETRY_EXHAUSTED` |
| `INVALID_STATE` (schema or phase∉order) | `block(reason)` | `DENY` | `INVALID_STATE` |
| state reader throws (missing/unparseable) | `block(reason)` | `DENY` | `UNREADABLE_STATE` |
| `PIPELINE_COMPLETE` | `block(reason)` | `DENY` | `PIPELINE_COMPLETE` |

There is **no code path that defaults to allow** (ADR-004). The audit fact is appended for ALLOW and
for every DENY/BLOCK cause (AC-03).

## Outside-in RED → GREEN sequence

The full acceptance file is RED now (production modules absent → load failure). The software-engineer
drives it GREEN slice by slice; values in the acceptance test are immutable (Iron Rule).

1. **Walking skeleton (matrix #1, AC-01 a).** GREEN by creating the three modules with the thinnest
   ADVANCE + equality slice: `state-schema` normalises/validates the happy shape, `pipeline-policy`
   derives ADVANCE and `evaluateDispatch` returns `Ok` on equality, `pre-tool-use-service` wires
   read → validate → evaluate → audit(`CONFORMING`) → `allow()`. Commit.
2. **Deny mapping (matrix #4–#6, #8 AC-02).** Drive SPECIALIST + RETRY derivation and the
   `OUT_OF_ORDER` → `deny(reason-naming-expected)` mapping. Commit.
3. **Retry budget (matrix #3 ALLOW, #7 BLOCK).** Add `RETRY` within `budget = config.retryBudget ?? 3`
   and `RETRY_EXHAUSTED` → `block`. Commit.
4. **Configured skip (matrix #2, AC-01 e).** ADVANCE skips `state.skipPhases` when choosing the next
   non-skipped phase. Commit.
5. **Determinism + audit cardinality (matrix #9, #10, AC-03).** Confirm pure re-evaluation and exactly
   one audit fact per attempt on allow and deny. Commit.
6. **Fail-closed (matrix #11–#14, AC-04).** Wrap `handle`: reader throw ⇒ audit `UNREADABLE_STATE` +
   `block`; `validateState` `Err` ⇒ audit `INVALID_STATE` + `block`; policy `INVALID_STATE`
   (phase ∉ order) ⇒ `block`; any other throw ⇒ audit + `block`. Commit.
7. **Inner-loop domain tests (matrix D1–D3).** Software-engineer authors `expectedNextAgent` REVIEWER /
   PIPELINE_COMPLETE branch tests and the `validateState` invalid-field grid (their RED drives any
   remaining domain shape). Commit.
8. **Mutation testing.** Run the `mutation-testing` skill (Stryker) on `pipeline-policy.mjs` +
   `state-schema.mjs`; 100% on business logic, equivalent mutants only accepted survivors.

## Running the tests (resolving-stack-commands)

Per the `resolving-stack-commands` skill the stack resolves to the Node built-in runner (`node --test`),
not `dotnet`:

- Single acceptance file (fast RED/GREEN loop):
  `node --test tests/skraft-framework/dispatch-order-guard.acceptance.test.mjs`
- Full framework suite + coverage (mirrors CI):
  `node scripts/local-ci.mjs`  (alias `npm run ci:local`)
- From `plugins/src`: `npm test`  (`node --test ../../tests/skraft-framework/*.test.mjs`)
- Mutation gate: `node scripts/local-ci.mjs --mutation`

## Traceability

| AC | Matrix rows | Scenarios |
|---|---|---|
| AC-01 | 1–7 (+ D1/D2 unreachable branches) | rule-table outlines + retry-exhausted scenario |
| AC-02 | 8 | deny-before-run names expected agent |
| AC-03 | 9, 10 | determinism + one audit per attempt (allow + deny) |
| AC-04 | 11–14 (+ D3 grid) | four fail-closed input classes |
