<!-- markdownlint-disable-file -->
# Consistency Matrix — State Transition Bridge
## us5-state-transition-bridge · 2026-07-01

**consistency-gate: PASS**

---

## Stories verified

| Story | Module | ADR tracing | Interface contract | Finding |
|---|---|---|---|---|
| AC1 — Transition légale | `state-machine.applyTransition(ADVANCE)` | ADR-008 (CLI gateway) | ✓ `ADVANCE` event type, I1+I2 | — |
| AC2 — Transition illégale | `state-machine.applyTransition(ADVANCE)` | ADR-008 | ✓ `ILLEGAL_PHASE_SKIP`, `VERDICT_NOT_APPROVED` | — |
| AC3 — INIT idempotent | `state-service.init()` | ADR-010 | ✓ `init()` operation both branches | — |
| AC4 — Écriture atomique | `json-state-writer.write()` | ADR-009 | ✓ atomicity contract | — |
| AC5 — Record-verdict | `state-machine.applyTransition(RECORD_VERDICT)` | ADR-008 | ✓ `RECORD_VERDICT` event | — |
| AC6 — Record-artifact | `state-machine.applyTransition(RECORD_ARTIFACT)` | ADR-008 | ✓ `RECORD_ARTIFACT` event, I5 | — |
| AC7 — Set-difficulty | `state-machine.applyTransition(SET_DIFFICULTY)` | ADR-008 | ✓ `SET_DIFFICULTY`, `IMMUTABLE_FIELD` | — |
| AC8 — Get | `state-service.get()` | ADR-008 (read-only, no mutation) | ✓ `get()` operation | — |
| AC9 — RETRY_EXHAUSTED | `state-machine.applyTransition(INCR_RETRY)` | ADR-008 | ✓ `RETRY_EXHAUSTED`, I3 | — |
| AC10 — TERMINAL_STATE | `state-machine.applyTransition(*)` on DONE | ADR-008 | ✓ `TERMINAL_STATE`, I8 | — |
| AC11 — Append-only phasesCompleted/reviewArtifacts | `state-machine` domain invariants | ADR-008 | ✓ I4, I6 | domain test only |
| AC12 — Coercion pre-existing | `state-service.applyEvent()` ENOENT path | ADR-010 | ✓ coercion fields manquants | — |

---

## ADR ↔ Design decision traceability

| ADR | Decision | Design module | Consistent? |
|---|---|---|---|
| ADR-008 | `STATE_WRITER_PORT` as sole write gateway | `ports/infrastructure/state-writer.mjs` + `json-state-writer.mjs` | ✓ |
| ADR-008 | Remove `write()` from `json-state-reader.mjs` | Breaking change section in contracts | ✓ |
| ADR-009 | temp+rename atomicity + ≤3 backup rotation | `json-state-writer.mjs` atomicity contract | ✓ |
| ADR-009 | Corruption snapshot to `.corrupted.{ts}` | `json-state-writer.mjs` on JSON.parse failure | ✓ |
| ADR-010 | Idempotent init (create-or-return, exit=0) | `state-service.init()` contract + AC3 | ✓ |

---

## Supersession check

No existing ADR (001–007) is superseded by ADR-008/009/010. ADR-008 extends ADR-002 (Hexagonal) without contradicting it. `supersessions.md` no update required.

---

## Interface gaps addressed (from contracts v2)

| Gap | Resolution |
|---|---|
| `state-schema.mjs` schema incompatibility | New `validatePipelineState()` added (see contracts `[MODIFY]` section) |
| `nextPhaseAfter()` not exported | `pipeline-policy.mjs [MODIFY]` added |
| `record-review-artifact` missing from CLI | Subcommand added to contracts table |
| `json-state-reader.mjs` breaking change undocumented | `[MODIFY]` section added to contracts |
| `maxRetriesPerPhase` source unspecified | Resolved: read from `state.json::userPreferences.maxRetriesPerPhase` |
| `INIT` event type ambiguous | Clarified: service-layer-only, not a `applyTransition` event |

**consistency-gate: PASS** — all 12 ACs trace to ADRs and contracts. No dangling decisions. No orphaned modules.
