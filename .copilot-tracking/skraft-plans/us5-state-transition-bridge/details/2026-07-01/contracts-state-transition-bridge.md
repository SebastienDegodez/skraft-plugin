<!-- markdownlint-disable-file -->
# Interface Contracts — State Transition Bridge
## us5-state-transition-bridge · 2026-07-01

---

## Module: `domain/state-machine.mjs` [NEW]

### Signature

```js
// Pure domain function. No IO. No side effects.
// @param {FrozenState} currentState — validated, frozen state object
// @param {TransitionEvent} event    — typed event (see Event Types)
// @returns {Result<FrozenState>}    — Ok(newFrozenState) | Err({code, reason})
export const applyTransition = (currentState, event) => { /* ... */ }
```

### Event Types

| Event type | Payload fields | Produces |
|---|---|---|
| `ADVANCE` | `{ type, targetPhase: string }` | new `currentPhase`, appends to `phasesCompleted` |
| `RECORD_VERDICT` | `{ type, phase: string, verdict: 'APPROVED'\|'CHANGES_REQUESTED' }` | sets `verdicts[phase]` |
| `RECORD_ARTIFACT` | `{ type, phase: string, path: string }` | appends to `phaseArtifacts[phase]` (I5) |
| `RECORD_REVIEW_ARTIFACT` | `{ type, phase: string, path: string }` | appends to `reviewArtifacts[phase]` (I6) |
| `SET_DIFFICULTY` | `{ type, value: string }` | sets `difficulty` (I7 write-once) |
| `INCR_RETRY` | `{ type, phase: string }` | increments `retryCount[phase]`, capped at `maxRetriesPerPhase` (I3) |

> **Note on `INIT`:** `INIT` is a service-layer concept (`state-service.init()`), not a first-class `applyTransition` event. The service layer handles create-if-missing logic before any event dispatch. `applyTransition` never receives an `INIT` event.

### Error Codes

| Code | Trigger |
|---|---|
| `ILLEGAL_PHASE_SKIP` | `ADVANCE` target ≠ `nextPhaseAfter(currentPhase, phaseOrder, skipPhases)` |
| `VERDICT_NOT_APPROVED` | `ADVANCE` attempted without `verdicts[currentPhase] === 'APPROVED'` |
| `RETRY_EXHAUSTED` | `INCR_RETRY` when `retryCount[phase] >= maxRetriesPerPhase` |
| `IMMUTABLE_FIELD` | `SET_DIFFICULTY` when `difficulty` is already non-null |
| `APPEND_ONLY_VIOLATION` | `RECORD_ARTIFACT` / `RECORD_REVIEW_ARTIFACT` with shorter array than existing |
| `TERMINAL_STATE` | Any mutating event when `currentPhase === 'DONE'` |
| `INVALID_STATE` | Input `currentState` fails schema validation |

### Invariants (I1–I9)

| ID | Invariant |
|---|---|
| I1 | `ADVANCE` requires `verdicts[currentPhase] === 'APPROVED'` |
| I2 | `ADVANCE` target must be `nextPhaseAfter(currentPhase, phaseOrder, skipPhases)` |
| I3 | `retryCount[phase]` capped at `maxRetriesPerPhase`; excess rejected |
| I4 | `phasesCompleted` is append-only |
| I5 | `phaseArtifacts[phase]` is append-only |
| I6 | `reviewArtifacts[phase]` is append-only |
| I7 | `difficulty` is write-once |
| I8 | `DONE` is terminal — all mutating events rejected |
| I9 | `INIT` is idempotent at service level |

### Dependencies (domain only — no IO)

- `domain/result.mjs` — `Ok`, `Err`
- `domain/state-schema.mjs` — `validatePipelineState()` (new function — see MODIFY section below)
- `domain/pipeline-policy.mjs` — `nextPhaseAfter()` (exported — see MODIFY section below)

---

## Module: `domain/state-schema.mjs` [MODIFY]

### What changes

The existing `validateState()` validates the RUNTIME dispatch state shape `{ currentPhase, specialistDone, reviewerVerdict, retries, skipPhases }` used by the hook system (`pre-tool-use-service.mjs`). This function is **unchanged** — backward compatible.

A new `validatePipelineState()` function is added to the same module to validate the PIPELINE ORCHESTRATION state shape:

```js
// NEW — validates the full orchestrator state.json shape
export const validatePipelineState = (raw) => {
  // required fields: currentPhase, retryCount (object), phasesCompleted (array),
  // verdicts (object), phaseArtifacts (object), reviewArtifacts (object)
  // optional: difficulty (string|null), userPreferences.maxRetriesPerPhase (number)
}
```

`applyTransition()` uses `validatePipelineState()`. The hook system continues using `validateState()`. No migration required — two validators coexist on two state shapes.

---

## Module: `domain/pipeline-policy.mjs` [MODIFY]

### What changes

`nextPhaseAfter` is currently a private `const` (line 7). It must be exported:

```js
// BEFORE (private)
const nextPhaseAfter = (currentPhase, config, skipPhases) => { /* ... */ }

// AFTER (exported)
export const nextPhaseAfter = (currentPhase, config, skipPhases) => { /* ... */ }
```

`expectedNextAgent` is unchanged. No behavioral change — export only.

---

## Module: `ports/infrastructure/state-writer.mjs` [NEW]

```js
export const STATE_WRITER_PORT = 'StateWriter'

// Duck-typed contract for the adapter:
// { write(projectSlug: string, state: object): Promise<Result<void>> }
// Ok(undefined) on success.
// Err({ code: 'IO_ERROR' | 'CORRUPTED_STATE', reason }) on failure.
// MUST NOT throw — exceptions caught and wrapped as Err.
```

**ADR:** ADR-008

---

## Module: `adapters/infrastructure/state/json-state-writer.mjs` [NEW]

### Signature

```js
export const createJsonStateWriter = (basePath) => ({
  write: async (projectSlug, state) => { /* atomicity contract below */ }
})
```

### Atomicity contract (event-model — cross-platform Windows + macOS)

```
1. serialize(state) → JSON string
2. writeFile({stateDir}/state.json.tmp.{Date.now()})   ← temp, same dir
3. copy state.json → state.json.bak.{Date.now()}        ← backup current
4. if backups > 3: delete oldest by timestamp suffix
5. rename(.tmp → state.json)                            ← cross-platform
→ Ok(undefined)

On JSON.parse failure during read:
  copy corrupt file → state.json.corrupted.{ts}
→ Err({ code: 'CORRUPTED_STATE', reason })

On any fs error:
→ Err({ code: 'IO_ERROR', reason: err.message })
```

**Cross-platform (Windows + macOS) — hard requirement :**
- `fs.rename()` Node.js : atomic POSIX sur macOS/Linux, `MoveFileExW` sur Windows
- Source et destination doivent être sur le même volume. Erreur `EXDEV` → `Err({ code: 'IO_ERROR', reason: 'cross-device rename' })`
- Pas de `writeFile(path, content)` direct — non-atomique sur les deux plateformes

### Constraints

- Temp file and `state.json` MUST reside on the same filesystem (same `basePath`)
- Maximum 3 `.bak` files; oldest deleted when 4th would be created
- No temp files left on disk after success or error before rename

### Dependencies

- `node:fs/promises` (`readFile`, `writeFile`, `rename`, `unlink`, `readdir`, `mkdir`)
- `node:path` (`dirname`, `join`)

---

## Module: `application/state-service.mjs` [NEW]

```js
export const createStateService = ({ stateReader, stateWriter }) => ({
  init:       (projectSlug)           => Promise<Result<FrozenState>>,
  applyEvent: (projectSlug, event)    => Promise<Result<FrozenState>>,
  get:        (projectSlug, field?)   => Promise<Result<unknown>>,
})
```

### `init(projectSlug)` — ADR-010

- ENOENT → create default state → write → Ok(defaultState)
- Exists + valid JSON → Ok(existingState), no write
- Exists + corrupt JSON → Err({ code: 'CORRUPTED_STATE' })

### `applyEvent(projectSlug, event)`

1. read → validate → `applyTransition(state, event)` → write
2. ENOENT on read → auto-init defaults → replay event
3. `Err` from state-machine propagates unchanged (no write)
4. Write only on `Ok` from state-machine

### `get(projectSlug, field?)`

- Read-only. No write, no backup.
- With `field`: `Ok(state[field])`
- Without `field`: `Ok(state)`

### Dependencies

- `STATE_READER_PORT` (injected)
- `STATE_WRITER_PORT` (injected) — ADR-008
- `domain/state-machine.mjs` — `applyTransition`
- `domain/state-schema.mjs` — `validatePipelineState` (new function)

### `maxRetriesPerPhase` source

Read from `state.json::userPreferences.maxRetriesPerPhase`. Default: `2`. The `state-service` passes it to `applyTransition` via the state object — no separate injection needed.

---

## Module: `cli/state.mjs` [NEW]

### Subcommands

| Subcommand | Required | Domain event |
|---|---|---|
| `init` | `--slug` | `INIT` (via service.init) |
| `transition` | `--to`, `--slug` | `ADVANCE` |
| `record-verdict` | `--phase`, `--verdict`, `--slug` | `RECORD_VERDICT` |
| `record-artifact` | `--phase`, `--path`, `--slug` | `RECORD_ARTIFACT` |
| `set-difficulty` | `--value`, `--slug` | `SET_DIFFICULTY` |
| `incr-retry` | `--phase`, `--slug` | `INCR_RETRY` |
| `record-review-artifact` | `--phase`, `--path`, `--slug` | `RECORD_REVIEW_ARTIFACT` |
| `get` | `--field`, `--slug` | (read only) |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (including idempotent no-op) |
| 1 | Domain invariant violation (state unchanged) |
| 2 | IO error |
| 3 | Schema validation failure |

### Stdout/stderr contract

**Stdout (exit=0):** minimal JSON of changed fields only.  
**Stdout `get`:** raw scalar value (not full state).  
**Stdout `init` (created):** `{ "created": true, "currentPhase": "DISCOVER" }`  
**Stdout `init` (no-op):** `{ "created": false, "currentPhase": "<existing>" }`  
**Stderr (exit≠0):** `{ "code": "ILLEGAL_PHASE_SKIP", "reason": "expected DISCUSS, got DESIGN" }`

### Composition root wiring

```js
const stateReader = createJsonStateReader(basePath)   // STATE_READER_PORT
const stateWriter = createJsonStateWriter(basePath)   // STATE_WRITER_PORT (ADR-008)
const stateService = createStateService({ stateReader, stateWriter })
```

`basePath` = `SKRAFT_TRACKING_ROOT` env var OR `.copilot-tracking/skraft-plans` relative to `process.cwd()`.

---

## Breaking Change: `json-state-reader.mjs` [MODIFY: remove write()]

```js
// BEFORE
export const createJsonStateReader = (basePath) => ({
  read:  async (projectSlug) => { /* ... */ },
  write: async (projectSlug, state) => { /* REMOVED */ }
})

// AFTER
export const createJsonStateReader = (basePath) => ({
  read: async (projectSlug) => { /* unchanged */ }
})
```

### Callsite inventory

| Caller | Impact |
|---|---|
| `application/pre-tool-use-service.mjs` | Read-only — no change needed |
| `application/post-tool-use-service.mjs` | Read-only — no change needed |
| `cli/hook.mjs` (composition root) | Wire `STATE_WRITER_PORT` → `createJsonStateWriter(basePath)` separately |
| Tests mocking `write()` on reader | Update test doubles to remove `write` |

All existing `read()` callers are unaffected.

```js
// BEFORE
export const createJsonStateReader = (basePath) => ({
  read:  async (projectSlug) => { /* ... */ },
  write: async (projectSlug, state) => { /* REMOVED */ }
})

// AFTER
export const createJsonStateReader = (basePath) => ({
  read: async (projectSlug) => { /* unchanged */ }
})
```

### Impact on callers

| Caller | Action |
|---|---|
| `application/pre-tool-use-service.mjs` | Read-only → no action |
| `application/post-tool-use-service.mjs` | Read-only → no action |
| `cli/hook.mjs` | Wire `STATE_WRITER_PORT` → `createJsonStateWriter(basePath)` separately |
| Tests mocking `write()` on reader | Update test doubles |

---

> *Note : ADR-008/009/010 initialement proposés ont été disqualifiés par le gate adr-eligibility (Q1/Q2/Q3 — baseline hexagonal + good practice + technique d'implémentation). Les décisions sont capturées dans ce fichier contracts et dans l'event-model.*
