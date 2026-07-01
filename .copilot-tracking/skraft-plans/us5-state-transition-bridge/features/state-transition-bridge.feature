# Feature: State Transition Bridge — deterministic state.json mutations
# Issue #60 · us5-state-transition-bridge · 2026-07-01
# Acceptance scope: CLI boundary (node cli/state.mjs)
# Exception: scenarios tagged @domain-only enter through applyTransition() directly
#            and are domain unit tests, not CLI acceptance tests

Feature: State Transition Bridge — deterministic state.json mutations

  # ─── AC1 — Legal phase transition ────────────────────────────────────────────

  @happy-path @ac1
  Scenario: Orchestrator advances from DISCOVER to DISCUSS when verdict is APPROVED
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DISCOVER"
      And the verdict for phase "DISCOVER" is "APPROVED"
    When the orchestrator runs: state transition --to DISCUSS --slug us5-state-transition-bridge
    Then the command exits with code 0
      And state.json shows currentPhase = "DISCUSS"
      And phasesCompleted contains "DISCOVER"
      And stdout contains a JSON object with the modified fields
      And no residual temporary files remain on disk

  # ─── AC2 — Illegal transitions rejected ──────────────────────────────────────

  @error-case @ac2a
  Scenario: Phase skip is rejected when the target is not the immediate next phase
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DISCOVER"
      And the verdict for phase "DISCOVER" is "APPROVED"
    When the orchestrator runs: state transition --to DESIGN --slug us5-state-transition-bridge
    Then the command exits with code 1
      And stderr contains error code "ILLEGAL_PHASE_SKIP"
      And stderr contains "expected DISCUSS, got DESIGN"
      And state.json is unchanged (currentPhase remains "DISCOVER")
      And no backup file is created

  @error-case @ac2b
  Scenario: Advance is rejected when the current phase verdict is not APPROVED
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DISCOVER"
      And the verdict for phase "DISCOVER" is "REJECTED"
    When the orchestrator runs: state transition --to DISCUSS --slug us5-state-transition-bridge
    Then the command exits with code 1
      And stderr contains error code "VERDICT_NOT_APPROVED"
      And state.json is unchanged (currentPhase remains "DISCOVER")
      And no backup file is created

  # ─── AC3 — Idempotent init ────────────────────────────────────────────────────

  @happy-path @ac3a
  Scenario: Init creates state.json with defaults when no file exists
    Given no state.json exists for slug "skraft-demo"
    When the orchestrator runs: state init --slug skraft-demo
    Then the command exits with code 0
      And state.json is created with currentPhase = "DISCOVER"
      And retryCount is initialised to {}
      And phasesCompleted is initialised to []
      And difficulty is null
      And stdout contains JSON with created = true and currentPhase = "DISCOVER"

  @happy-path @ac3b
  Scenario: Init is a no-op when state.json already exists
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DISCUSS"
    When the orchestrator runs: state init --slug us5-state-transition-bridge
    Then the command exits with code 0
      And state.json is unchanged (currentPhase remains "DISCUSS")
      And no backup file is created
      And stdout contains JSON with created = false and currentPhase = "DISCUSS"

  # ─── AC4 — Atomic write + backup rotation ────────────────────────────────────

  @edge-case @ac4a
  Scenario: Successful write rotates backups keeping at most 3 files
    Given a state.json exists for slug "us5-state-transition-bridge"
      And 3 backup files exist: state.json.bak.100, state.json.bak.200, state.json.bak.300
    When a successful write operation is performed (record-verdict --verdict APPROVED --phase DISCUSS)
    Then state.json contains the new state
      And a new backup file state.json.bak.{ts} is created
      And the oldest backup (state.json.bak.100) is deleted
      And exactly 3 backup files remain
      And no residual temporary files remain on disk

  @error-case @ac4b
  Scenario: Corrupted state.json is snapshotted before any write attempt
    Given a corrupted state.json (invalid JSON) exists for slug "skraft-demo"
    When the orchestrator runs: state transition --to DISCUSS --slug skraft-demo
    Then the command exits with code 2
      And stderr contains error code "CORRUPTED_STATE"
      And the corrupt file is preserved as state.json.corrupted.{ts}
      And no partial write has occurred

  # ─── AC5 — Record-verdict ────────────────────────────────────────────────────

  @happy-path @ac5
  Scenario: Verdict APPROVED is recorded for DISCUSS without advancing the phase
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DISCUSS"
      And no verdict is recorded for phase "DISCUSS"
    When the orchestrator runs: state record-verdict --phase DISCUSS --verdict APPROVED --slug us5-state-transition-bridge
    Then the command exits with code 0
      And state.json shows verdict["DISCUSS"] = "APPROVED"
      And currentPhase remains "DISCUSS" (record-verdict does not advance the phase)

  # ─── AC6 — Record-artifact (append-only) ─────────────────────────────────────

  @happy-path @ac6a
  Scenario: Artifact is appended to phaseArtifacts without removing existing entries
    Given a state.json exists for slug "us5-state-transition-bridge"
      And phaseArtifacts["DISCUSS"] contains 1 path
    When the orchestrator runs: state record-artifact --phase DISCUSS --path "plans/2026-07-01/ac-draft.md" --slug us5-state-transition-bridge
    Then the command exits with code 0
      And phaseArtifacts["DISCUSS"] contains both paths
      And no existing artifact is removed (append-only invariant I5)

  @domain-only @ac6b
  Scenario: Attempt to replace phaseArtifacts with a shorter list is rejected
    Given a valid pipeline state with 2 artifacts in phaseArtifacts["DISCUSS"]
    When the state machine receives a RECORD_ARTIFACT event with fewer artifact paths than already stored in phaseArtifacts["DISCUSS"]
    Then the state machine returns a failure result with code "APPEND_ONLY_VIOLATION"
      And the input state is not modified

  # ─── AC7 — Set-difficulty (write-once) ───────────────────────────────────────

  @happy-path @ac7a
  Scenario: First write of difficulty succeeds when field is null
    Given a state.json exists for slug "us5-state-transition-bridge"
      And difficulty is null
    When the orchestrator runs: state set-difficulty --value medium-hard --slug us5-state-transition-bridge
    Then the command exits with code 0
      And state.json shows difficulty = "medium-hard"

  @error-case @ac7b
  Scenario: Re-definition of an already-set difficulty is rejected
    Given a state.json exists for slug "us5-state-transition-bridge"
      And difficulty is "medium-hard"
    When the orchestrator runs: state set-difficulty --value easy --slug us5-state-transition-bridge
    Then the command exits with code 1
      And stderr contains error code "IMMUTABLE_FIELD"
      And state.json shows difficulty = "medium-hard" (unchanged)

  # ─── AC8 — Get field (read-only) ─────────────────────────────────────────────

  @happy-path @ac8
  Scenario: Reading a single field returns only the scalar value without any side effect
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DESIGN"
    When the orchestrator runs: state get --field currentPhase --slug us5-state-transition-bridge
    Then the command exits with code 0
      And stdout contains only "DESIGN" (raw scalar value, not full JSON)
      And state.json is unchanged
      And no backup file is created

  # ─── AC9 — Incr-retry (capped at maxRetriesPerPhase) ─────────────────────────

  @error-case @ac9a
  Scenario: incr-retry is rejected when retryCount has reached maxRetriesPerPhase
    Given a state.json exists for slug "us5-state-transition-bridge"
      And retryCount["DISCUSS"] is 2 (equal to maxRetriesPerPhase)
    When the orchestrator runs: state incr-retry --phase DISCUSS --slug us5-state-transition-bridge
    Then the command exits with code 1
      And stderr contains error code "RETRY_EXHAUSTED"
      And state.json is unchanged (retryCount["DISCUSS"] remains 2)

  @happy-path @ac9b
  Scenario: incr-retry succeeds when retryCount is below maxRetriesPerPhase
    Given a state.json exists for slug "us5-state-transition-bridge"
      And retryCount["DISCUSS"] is 1
    When the orchestrator runs: state incr-retry --phase DISCUSS --slug us5-state-transition-bridge
    Then the command exits with code 0
      And state.json shows retryCount["DISCUSS"] = 2

  # ─── AC10 — DONE is terminal (I8) ────────────────────────────────────────────

  @error-case @ac10a
  Scenario: Transition is rejected when pipeline has reached DONE
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DONE"
    When the orchestrator runs: state transition --to DISCOVER --slug us5-state-transition-bridge
    Then the command exits with code 1
      And stderr contains error code "TERMINAL_STATE"
      And state.json is unchanged (currentPhase remains "DONE")

  @error-case @ac10b
  Scenario: Record-verdict is rejected when pipeline has reached DONE
    Given a state.json exists for slug "us5-state-transition-bridge"
      And currentPhase is "DONE"
    When the orchestrator runs: state record-verdict --phase DONE --verdict APPROVED --slug us5-state-transition-bridge
    Then the command exits with code 1
      And stderr contains error code "TERMINAL_STATE"

  # ─── AC11 — Append-only invariants (domain pure — I4 + I6) ───────────────────

  @domain-only @ac11a
  Scenario: Attempt to reduce phasesCompleted is rejected by the state machine
    Given a valid pipeline state with phasesCompleted = ["DISCOVER", "DISCUSS"]
    When the state machine receives an event that would reduce phasesCompleted from 2 entries to 1
    Then the state machine returns a failure result with code "APPEND_ONLY_VIOLATION"
      And the input state is not modified

  @domain-only @ac11b
  Scenario: Attempt to reduce reviewArtifacts is rejected by the state machine
    Given a valid pipeline state with reviewArtifacts["DISCOVER"] = ["reviews/2026-07-01/discover-review-1.md"]
    When the state machine receives an event that would reduce reviewArtifacts["DISCOVER"] from 1 entry to 0
    Then the state machine returns a failure result with code "APPEND_ONLY_VIOLATION"
      And the input state is not modified

  # ─── AC12 — Backward-compatible coercion ─────────────────────────────────────

  @edge-case @ac12
  Scenario: Pre-existing state.json missing retryCount and phasesCompleted is coerced automatically
    Given a pre-existing state.json (created before issue #60) without fields "retryCount" and "phasesCompleted"
      And currentPhase is "DISCOVER"
    When the orchestrator runs: state record-verdict --phase DISCOVER --verdict APPROVED --slug us5-legacy
    Then the command exits with code 0
      And state.json contains retryCount initialised to {}
      And state.json contains phasesCompleted initialised to []
      And state.json shows verdict["DISCOVER"] = "APPROVED"
