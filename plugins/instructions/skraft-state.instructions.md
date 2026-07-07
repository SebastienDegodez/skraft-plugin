---
description: "SKRAFT pipeline state: write-through model (native todo working set + deterministic CLI writes), schema, and once-per-session rehydration aligned with HVE-Core conventions"
applyTo: '**/.copilot-tracking/skraft-plans/**'
---
<!-- markdownlint-disable-file -->
<!-- PORTABILITY: orchestrator-owned. Only the skraft-orchestrator loads this file
     (it owns pipeline state); sub-agents never read or write state.json. `applyTo:`
     above is Copilot auto-load metadata (belt); on harnesses without path-scoped
     auto-load (e.g. Claude Code) the orchestrator loads it via the explicit read
     declared in its "Companion instructions" block (suspenders). Harness-neutral;
     per-harness tool syntax lives inline where noted. -->

# SKRAFT Pipeline State Conventions

These conventions govern every SKRAFT agent (orchestrator, phase agents, reviewers) that reads or writes pipeline state. State persists at `.copilot-tracking/skraft-plans/{project-slug}/state.json`. JSON only — never markdown.

## Write-through model (token economy)

The durable `state.json` is a **safety snapshot**, not a per-turn scratchpad. The token cost of state is driven by *frequency* (re-reading and re-writing the whole file every turn), not by file size. This model eliminates that frequency:

1. **Rehydrate ONCE per session.** Read `state.json` a single time when a session starts or resumes (Phase 0). Do NOT re-read the whole file on every turn.
2. **Native todo list is the in-session working set.** After rehydration, the orchestrator projects the pipeline into the harness-native todo list (see `#file:plugins/instructions/skraft-todo-sync.instructions.md`). Every turn consults the todo list (near-zero token), never the JSON file.
3. **Writes are deterministic and go through the CLI.** Every invariant-bearing mutation (verdict, phase advance, artifact append, difficulty, retry) is applied by the `state.mjs` CLI, which validates, preserves ALL fields, backs up, and writes atomically. The agent never hand-edits those fields.
4. **The file is the reconciliation point, never the hot path.** The native todo list does not persist across sessions or harnesses; the snapshot does. It is written at checkpoints and read once at the next rehydration.

The snapshot remains authoritative on disk; the todo list is a disposable in-session projection, always regenerated from the snapshot at rehydration and never the source of truth.

## State CLI (deterministic writes — S7 bridge)

Invoke the state CLI for every invariant-bearing mutation. Portable invocation (same env var on Claude Code and Copilot CLI; falls back to the plugin cache glob when unset):

```bash
node "$CLAUDE_PLUGIN_ROOT/src/cli/state.mjs" <subcommand> --slug {projectSlug} [flags]
```

`basePath` defaults to `.copilot-tracking/skraft-plans` under the current working directory (override with `SKRAFT_TRACKING_ROOT`). The CLI prints the updated state (or a scalar for `get --field`) as JSON to stdout, and a `{ "code", "reason" }` object to stderr on failure. Exit codes: `0` success · `1` domain rejection (e.g. `VERDICT_NOT_APPROVED`, `ILLEGAL_PHASE_SKIP`, `RETRY_EXHAUSTED`, `IMMUTABLE_FIELD`) · `2` IO/corrupted · `3` invalid state.

| Subcommand | Flags | Effect (domain event) |
|---|---|---|
| `init` | `--slug` | Create default `state.json` if absent (idempotent). |
| `get` | `--slug` `[--field X]` | Read-only. Full state, or one field. Safe; never writes. |
| `transition` | `--slug --to {PHASE}` | Advance `currentPhase` (requires APPROVED verdict + legal next phase). |
| `record-verdict` | `--slug --phase {P} --verdict {APPROVED\|CHANGES_REQUESTED}` | Set `verdicts[phase]`. |
| `record-artifact` | `--slug --phase {P} --path {rel}` | Append to `phaseArtifacts[phase]` (append-only). |
| `record-review-artifact` | `--slug --phase {P} --path {rel}` | Append to `reviewArtifacts[phase]` (append-only). |
| `set-difficulty` | `--slug --value {tier}` | Set `difficulty` (write-once; rejects if already set). |
| `incr-retry` | `--slug --phase {P}` | Increment `retryCount[phase]` (capped at `maxRetriesPerPhase`). |

Orchestrator-owned metadata that the CLI has no subcommand for — `entryPoint` (written once at Phase 0), `adrRatification` (written at the DESIGN human checkpoint), and `phaseHistory` / `neighborPlanners` / `nextActions` / `referencesProcessed` — is edited directly on the snapshot. This is safe: the CLI's validator preserves every field on rewrite (round-trip fidelity), so a later CLI write never drops a hand-edited field. Everything invariant-bearing (verdicts, phase advance, artifacts, difficulty, retry) goes through the CLI.

## Schema

State is a JSON document. The state machine owns the invariant-bearing subset; all other fields are orchestrator-owned and preserved verbatim on every CLI write.

```json
{
  "projectSlug": "string",
  "skraftPlanFile": "string (relative path to plan instructions file)",
  "currentPhase": "DISCOVER | DISCUSS | DESIGN | DISTILL | DELIVER | DONE",
  "entryMode": "capture | from-issue | from-prd | null",
  "entryPoint": {
    "skipPhases": ["string (phase names skipped because an upstream artefact already satisfies them)"],
    "handoffSource": "hve-ado | hve-jira | hve-github | null",
    "handoffArtifacts": ["string (relative paths to the detected HVE backlog/sprint artefacts)"]
  },
  "issueNumber": "number | null",
  "difficulty": "simple | medium | medium-hard | challenging | null",
  "phasesCompleted": ["string (phase names)"],
  "phaseArtifacts": {
    "DISCOVER": ["string (relative paths)"]
  },
  "verdicts": {
    "DISCOVER": "APPROVED | CHANGES_REQUESTED | null"
  },
  "reviewArtifacts": {
    "DISCOVER": ["string (relative paths under reviews/)"]
  },
  "retryCount": {
    "DISCOVER": "number"
  },
  "referencesProcessed": ["string (file paths)"],
  "phaseHistory": {
    "DISCOVER": { "status": "done | inProgress", "startedAt": "string", "completedAt": "string" }
  },
  "nextActions": ["string"],
  "userPreferences": {
    "autonomyTier": "full | partial | manual",
    "maxRetriesPerPhase": "number"
  },
  "neighborPlanners": {
    "securityPlanFile": "string | null",
    "raiPlanFile": "string | null",
    "ssscPlanFile": "string | null"
  },
  "adrRatification": {
    "checkpointStatus": "none | awaiting_human | resolved",
    "pending": [
      { "adr": "string (NNN)", "title": "string", "recommended": "accept | reject", "status": "Proposed" }
    ],
    "ratified": [
      { "adr": "string (NNN)", "verdict": "Accepted | Rejected", "by": "string (human + date)" }
    ]
  }
}
```

### Canonical shapes and legacy migration

* `verdicts` is a phase-keyed map (`{ "DESIGN": "APPROVED" }`). Verdict values are `APPROVED`, `CHANGES_REQUESTED`, or `null`. The legacy field `reviewerVerdicts` (older hand-authored files) is migrated to `verdicts` automatically on read and the alias is dropped — do not write `reviewerVerdicts`.
* `reviewArtifacts` and `phaseArtifacts` are phase-keyed **maps** of relative paths (`{ "DESIGN": ["reviews/..."] }`), appended through the CLI. A legacy *flat array* on an older file is preserved verbatim under `reviewArtifactsLegacy` / `phaseArtifactsLegacy`; the canonical map restarts empty for future appends. Do not author flat arrays.

### Field semantics

* `projectSlug` — kebab-case identifier derived from the originating issue title or user-provided project name.
* `currentPhase` — single phase the pipeline is currently executing. Advances only when the reviewer verdict for that phase is `APPROVED`. `DONE` indicates the full pipeline has completed.
* `entryMode` — how the pipeline was started. `from-issue` requires `issueNumber`; `from-prd` requires entries in `referencesProcessed`; `capture` requires neither.
* `entryPoint` — records which phases the orchestrator skips because an upstream HVE handoff already satisfies their checklist, evaluated at pipeline start (Phase 0) by `skraft-difficulty-routing`. `skipPhases` is empty by default (every phase runs). `handoffSource` names the detected HVE producer (`hve-ado`, `hve-jira`, `hve-github`) or `null`. `handoffArtifacts` lists the relative paths of the ingested backlog/sprint artefacts. When `skipPhases` contains `"DISCOVER"`, the ingestion step writes the substitute DISCOVER artefacts (`research/{date}/triage-ingest-{date}.md`, `research/{date}/sprint-proposal.md`) so DISCUSS can start without re-triaging. Written directly on the snapshot once, at Phase 0.
* `difficulty` — per-work-item. Set once at the exit of DISCOVER (or, when DISCOVER is skipped, at pipeline start) via `state.mjs set-difficulty`. Write-once. Drives the DELIVER execution model. Never reassessed mid-pipeline.
* Depth tier — NOT in this file. It is a repo-wide property held in `skraft-config.json` (managed by the `skraft-config` configurateur; read with `config.mjs get --key depthTier`). Defaults to `comprehensive`. It is the pipeline's **cost governor** (genesis B16 / B11): it sets reviewer fan-out (1/2/4 lenses), mutation-run count, and the Gherkin gate. See `plugins/skills/skraft-difficulty-routing/SKILL.md`.
* `userPreferences.maxRetriesPerPhase` — default `2`. When `retryCount[phase] >= maxRetriesPerPhase` and the verdict is not `APPROVED`, the orchestrator escalates to the user.
* `reviewArtifacts` — append-only map of relative paths under `reviews/{YYYY-MM-DD}/`. Reviewers append here exclusively, through `record-review-artifact`.
* `neighborPlanners` — interop with sibling HVE planners (Security, RAI, SSSC). `null` when no plan exists.
* `adrRatification` — persists the DESIGN human-ratification gate (genesis B10 HUMAN CHECKPOINT + B4 PLAN MEMENTO) so it survives turns and session resumes. `checkpointStatus` is `none` until DESIGN produces `Proposed` ADRs, `awaiting_human` while the orchestrator has HALTed for a verdict, `resolved` once every ADR is `Accepted`/`Rejected`. `pending` mirrors the `docs/adr/decisions-index.md` rows still `Proposed`; `ratified` accumulates the verdicts. The orchestrator reads the decision index (NOT full ADR bodies) to populate this block. Written directly on the snapshot at the DESIGN checkpoint. Defaults to `{ "checkpointStatus": "none", "pending": [], "ratified": [] }`.

## Per-turn protocol (write-through)

On a turn that changes pipeline state:

1. **DETERMINE** the next action from the **native todo working set** (not by re-reading the file). If a scalar not carried by the todo list is needed (e.g. `difficulty`, `entryPoint`), fetch just that field: `state.mjs get --slug {slug} --field difficulty`.
2. **EXECUTE** the action (dispatch a phase agent, dispatch a reviewer, request user input, etc.).
3. **RECORD** the result through the CLI — one deterministic call per mutation:
   * reviewer verdict → `record-verdict --phase {P} --verdict {V}`
   * artifact produced → `record-artifact` / `record-review-artifact`
   * phase advance → `transition --to {NEXT}` (only after an APPROVED verdict for the current phase)
   * difficulty set → `set-difficulty --value {tier}`
   * phase re-dispatched after a non-APPROVED verdict → `incr-retry --phase {P}`
   The CLI persists the snapshot atomically. `entryPoint` / `adrRatification` are the only direct-edit exceptions.
4. **REFLECT** the change into the native todo list (mark a todo done / in-progress, add the next). The todo list and the snapshot now agree; no whole-file re-read occurs.

### Transition rules

* `currentPhase` transitions only on `APPROVED` reviewer verdict — enforced by `transition` (rejects with `VERDICT_NOT_APPROVED`).
* **DESIGN is the one phase with a second gate after `APPROVED`:** it advances to `DISTILL` only when `adrRatification.checkpointStatus == "resolved"` (zero `Proposed` ADRs remain in `docs/adr/decisions-index.md`). A DESIGN reviewer `APPROVED` with `Proposed` ADRs still open keeps `currentPhase == "DESIGN"` and sets `adrRatification.checkpointStatus = "awaiting_human"`.
* On `CHANGES_REQUESTED`: the same phase agent is re-dispatched, `incr-retry --phase {P}` is called, `currentPhase` does not change.
* The terminal state `DONE` is reached by a final `transition --to DONE` after DELIVER's verdict is `APPROVED` and `phasesCompleted` contains all five phase names. `DONE` is terminal — the CLI rejects further mutations with `TERMINAL_STATE`.

### State creation

On first invocation, create the state with `state.mjs init --slug {projectSlug}`. This writes a default snapshot (`currentPhase="DISCOVER"`, `userPreferences.maxRetriesPerPhase=2`, `difficulty=null`, all maps empty, `entryPoint=null`, `adrRatification` defaulted). Then, at Phase 0, the orchestrator direct-edits `entryPoint` (and, when an HVE handoff skips DISCOVER, calls `transition`/`set-difficulty` as needed).

## Rehydration (once per session)

When a session starts or resumes, rehydrate exactly once:

1. **Read** the snapshot in one call — `state.mjs get --slug {slug}` — to obtain `currentPhase`, `verdicts[currentPhase]`, `retryCount[currentPhase]`, `difficulty`, `entryPoint`, `adrRatification`.
2. **Project** the pipeline into the native todo working set per `#file:plugins/instructions/skraft-todo-sync.instructions.md` (phases as todos with dependencies and statuses derived from `phasesCompleted` / `currentPhase` / `verdicts`).
3. **Identify** pending work from the todo list: an open reviewer verdict, an unprocessed reference, missing artifacts for the current phase, `adrRatification.checkpointStatus == "awaiting_human"`, or unresolved user input.
4. **Check** on-disk artifacts for the current phase only (partial outputs under `research/`, `plans/`, `details/`, `changes/`, or `reviews/`; ADRs live project-global in `docs/adr/`).
5. **Present** a status summary with an emoji checklist (✅ completed phases, 🔄 in-progress phase, ❓ pending decisions).

From here, subsequent turns use the todo list and the write-through protocol above — the whole snapshot is not re-read again this session.

## Recovery Procedure

When `state.json` is missing, malformed, or fails schema validation (the CLI exits `2`/`3`):

1. Search the project directory for the most recent valid backup (`state.json.bak.*`, kept rotating ≤3 by the writer). If found, restore it and re-run `state.mjs get` to validate.
2. If no backup is recoverable, scan `research/`, `plans/`, `details/`, `changes/`, and `reviews/` to infer the highest phase with completed artifacts (DESIGN completion is evidenced by `details/{date}/` contracts and consistency matrices; ADRs live project-global in `docs/adr/`).
3. Reconstruct a snapshot with conservative defaults: `state.mjs init` then direct-edit `currentPhase` to the inferred phase, `phasesCompleted` from on-disk evidence, `verdicts[currentPhase]` to `null`. (Depth tier is not part of state recovery — it lives in `skraft-config.json`; run `config.mjs init` if that file is also missing.)
4. Surface the reconstruction to the user with a checklist of inferred values and request confirmation before resuming.
5. Before overwriting a corrupted file, preserve it as `state.json.corrupted.{timestamp}`.

## Markdown header for tracked artifacts

Every markdown artifact written under `.copilot-tracking/skraft-plans/` (plans, research notes, ADR drafts, details, changes, reviews) must begin with the following header on the first line, before any frontmatter or content:

```
<!-- markdownlint-disable-file -->
```

This matches the HVE-Core convention and prevents lint noise on agent-generated content.
