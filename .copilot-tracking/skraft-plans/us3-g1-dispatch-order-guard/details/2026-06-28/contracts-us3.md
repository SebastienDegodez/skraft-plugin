<!-- markdownlint-disable-file -->
# Interface Contracts — US3 / G1 Dispatch-Order Guard (#49)

Phase: DESIGN · Date: 2026-06-28 · Project slug: us3-g1-dispatch-order-guard
Conventions: Result type (ADR-001, `plugins/skraft-framework/src/domain/result.mjs`), hook decision vocabulary
(`plugins/skraft-framework/src/adapters/api/hooks/decision.mjs`), hexagonal layering (ADR-002). DESIGN artefact —
signatures and shapes only, no implementation.

## Value Objects & shapes

### PipelineState (Value Object — `domain/state-schema.mjs`)
```
PipelineState {
  currentPhase    : string                                  // ∈ config.phaseOrder
  specialistDone  : boolean                                  // specialist artefact present for currentPhase
  reviewerVerdict : 'APPROVED' | 'CHANGES_REQUESTED' | null  // reviewer verdict of currentPhase
  retries         : integer (>= 0)                           // re-runs of the current specialist
  skipPhases      : string[]                                 // ⊆ config.phaseOrder
}
```

### GeneratedConfig (Published Language — read-only, from #48)
```
GeneratedConfig {
  phaseOrder   : string[]                                    // canonical phase sequence
  phaseAgents  : { [phase: string]: { specialist: string, reviewer: string } }
  retryBudget? : integer (>= 1)                              // optional; policy default = 3
}
```

## Contract 1 — `domain/state-schema.mjs` (pure Domain Service)

```
// Pure, no IO. Validates intrinsic shape of the raw recorded state.
validateState(raw: unknown) -> Result
  // success
  Ok(PipelineState)                                          // frozen, normalised VO
  // failure (fail-closed input — ADR-004)
  Err({ code: 'INVALID_STATE', fields: string[], reason: string })
```
Rules: `currentPhase` non-empty string; `specialistDone` boolean; `reviewerVerdict` ∈
`{APPROVED, CHANGES_REQUESTED, null}`; `retries` integer ≥ 0; `skipPhases` array of strings.
Cross-checks against config (`currentPhase ∈ phaseOrder`, agent resolvability) are NOT done here —
they belong to the policy (ADR-005).

## Contract 2 — `domain/pipeline-policy.mjs` (pure Domain Service)

> **Distinct from build-time `domain/dispatch-policy.mjs` (the #48 build-time module).** Neither imports the other.
> The runtime decision function is named `evaluateDispatch` (NOT `validateDispatch`) so it shares no
> exported symbol with the build-time `dispatch-policy.mjs`'s `validateDispatch(descriptors)`.

```
// Derives the single agent the pipeline expects to run next. Pure, no IO.
// Assumes `state` already passed validateState().
expectedNextAgent(state: PipelineState, config: GeneratedConfig) -> Result
  // success
  Ok({
    agent  : string,                                         // resolved only from config.phaseAgents
    stage  : 'SPECIALIST' | 'REVIEWER' | 'RETRY' | 'ADVANCE',
    reason : string
  })
  // failure (no derivable forward agent -> caller denies, ADR-005)
  Err({
    code   : 'INVALID_STATE' | 'RETRY_EXHAUSTED' | 'PIPELINE_COMPLETE',
    reason : string
  })
```

```
// The single decision rule for the gate (deny-by-default — ADR-004). Pure, no IO.
evaluateDispatch(requestedAgent: string, state: PipelineState, config: GeneratedConfig) -> Result
  // ALLOW — requestedAgent conforms to the expected next agent
  Ok({
    requestedAgent : string,
    expectedAgent  : string,
    stage          : 'SPECIALIST' | 'REVIEWER' | 'RETRY' | 'ADVANCE',
    reason         : string
  })
  // DENY — non-conforming or non-derivable (deny-by-default, ADR-004)
  Err({
    code           : 'OUT_OF_ORDER' | 'INVALID_STATE' | 'RETRY_EXHAUSTED' | 'PIPELINE_COMPLETE',
    requestedAgent : string,
    expectedAgent  : string | null,                          // null when no forward agent derivable
    reason         : string
  })
```
Decision rule: `isOk(expectedNextAgent(...))` AND `requestedAgent === expectedNextAgent(...).agent`
⇒ `Ok` (ALLOW); every other outcome ⇒ `Err` (DENY). Deterministic — same inputs always yield the
same Result (AC-03).

## Contract 3 — `application/pre-tool-use-service.mjs` (use case)

Conforms to the `PreToolUse` driver port (`plugins/skraft-framework/src/ports/api/pre-tool-use.mjs`): exposes
`handle(payload)` and is the `preToolUse` handler wired through `service-factory.mjs` →
`hook-router.mjs`. The hook entry is `type: command` with matcher `Agent` (equivalently `task`) —
per the hooks-reference runtime → Claude tool-name table (`task` → `Agent`). A command hook is
fail-closed (a crash or non-zero exit denies the dispatch), which is load-bearing for AC-04 (ADR-004).

```
// Composition: injects existing driven adapters + generated config + clock.
createPreToolUseService({
  stateReader,   // StateReader port — json-state-reader.read(projectSlug) (throws on missing/unparseable)
  auditWriter,   // AuditWriter port — jsonl-audit-writer.write(entry) (append-only)
  config,        // GeneratedConfig (skraft-framework.config.json)
  clock          // { now(): string }  // ISO-8601 timestamp provider
}) -> { handle(payload): Promise<HarnessDecision> }
```

```
// Input payload (normalised by payload.mjs into camelCase)
PreToolUsePayload {
  requestedAgent : string,                                   // the sub-agent about to run
  projectSlug    : string                                    // selects {basePath}/{slug}/state.json
}

// Output — harness decision vocabulary from decision.mjs
HarnessDecision = allow()            // conforming dispatch -> sub-agent runs
               | deny(message)       // OUT_OF_ORDER         -> normal control-path block
               | block(message)      // UNREADABLE_STATE | INVALID_STATE | RETRY_EXHAUSTED (escalate/security)
```

### Flow (deny-by-default — ADR-004; fail-closed — AC-04)
1. `raw = await stateReader.read(projectSlug)` — on throw ⇒ audit `UNREADABLE_STATE`, return `block(...)`.
2. `validateState(raw)` — on `Err` ⇒ audit `INVALID_STATE`, return `block(...)`.
3. `evaluateDispatch(requestedAgent, state, config)` ⇒ Result.
4. Emit exactly one `DispatchEvaluated` audit entry (step 4 runs for ALLOW and DENY — AC-03).
5. Map: `Ok` ⇒ `allow()`; `Err OUT_OF_ORDER` ⇒ `deny(reason)`;
   `Err INVALID_STATE|RETRY_EXHAUSTED|PIPELINE_COMPLETE` ⇒ `block(reason)`.
6. The whole `handle` is wrapped so any unexpected exception ⇒ audit + `block(...)` (no default-allow path).

`deny`/`block` messages name `expectedAgent` (AC-02) and the cause (AC-04).

## Contract 4 — `DispatchEvaluated` (Domain Event — audit entry)

One entry appended per evaluation via `auditWriter.write(entry)`.

```
DispatchEvaluated {
  event         : 'DispatchEvaluated',
  projectSlug   : string,
  requestedAgent: string,
  expectedAgent : string | null,
  decision      : 'ALLOW' | 'DENY',
  code          : 'CONFORMING' | 'OUT_OF_ORDER' | 'RETRY_EXHAUSTED'
                | 'INVALID_STATE' | 'UNREADABLE_STATE' | 'PIPELINE_COMPLETE',
  reason        : string,
  evaluatedAt   : string                                     // ISO-8601, from clock.now()
}
```

## Traceability

| AC | Satisfied by |
|---|---|
| AC-01 (rule table) | Contract 2 `evaluateDispatch` single-equality rule; rows a–g reproduced in event-model |
| AC-02 (block before execution + names expected agent) | Contract 3 gate returns deny/block pre-run; messages name `expectedAgent` |
| AC-03 (deterministic + audited) | Contract 2 purity/determinism; Contract 4 `DispatchEvaluated` per attempt |
| AC-04 (fail-closed) | Contract 1 `INVALID_STATE`; Contract 3 steps 1/2/6 `UNREADABLE_STATE` ⇒ `block`, no default-allow |
