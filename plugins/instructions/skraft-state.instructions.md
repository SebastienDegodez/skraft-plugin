---
description: "SKRAFT pipeline state schema, six-step turn protocol, and four-step resume sequence aligned with HVE-Core conventions"
applyTo: '**/.copilot-tracking/skraft-plans/**'
---
<!-- markdownlint-disable-file -->

# SKRAFT Pipeline State Conventions

These conventions govern every SKRAFT agent (orchestrator, phase agents, reviewers) that reads or writes pipeline state. State persists at `.copilot-tracking/skraft-plans/{project-slug}/state.json`. JSON only — never markdown.

## Schema

State is a JSON document with the following fields. All fields are required unless marked optional.

```json
{
  "projectSlug": "string",
  "skraftPlanFile": "string (relative path to plan instructions file)",
  "currentPhase": "DISCOVER | DISCUSS | DESIGN | DISTILL | DELIVER | DONE",
  "entryMode": "capture | from-issue | from-prd",
  "entryPoint": {
    "skipPhases": ["string (phase names skipped because an upstream artefact already satisfies them)"],
    "handoffSource": "hve-ado | hve-jira | hve-github | null",
    "handoffArtifacts": ["string (relative paths to the detected HVE backlog/sprint artefacts)"]
  },
  "issueNumber": "number | null",
  "difficulty": "simple | medium | medium-hard | challenging | null",
  "phasesCompleted": ["string (phase names)"],
  "phaseArtifacts": {
    "DISCOVER": ["string (relative paths)"],
    "DISCUSS": ["string (relative paths)"],
    "DESIGN": ["string (relative paths)"],
    "DISTILL": ["string (relative paths)"],
    "DELIVER": ["string (relative paths)"]
  },
  "reviewerVerdicts": {
    "DISCOVER": "APPROVED | REJECTED | NEEDS_REWORK | null",
    "DISCUSS": "APPROVED | REJECTED | NEEDS_REWORK | null",
    "DESIGN": "APPROVED | REJECTED | NEEDS_REWORK | null",
    "DISTILL": "APPROVED | REJECTED | NEEDS_REWORK | null",
    "DELIVER": "APPROVED | REJECTED | NEEDS_REWORK | null"
  },
  "reviewArtifacts": ["string (relative paths under reviews/)"],
  "retryCount": {
    "DISCOVER": "number",
    "DISCUSS": "number",
    "DESIGN": "number",
    "DISTILL": "number",
    "DELIVER": "number"
  },
  "referencesProcessed": ["string (file paths)"],
  "nextActions": ["string"],
  "userPreferences": {
    "autonomyTier": "full | partial | manual",
    "depthTier": "basic | standard | comprehensive | custom",
    "maxRetriesPerPhase": "number"
  },
  "depthTierOverrides": ["string (rationale entries when depthTier != comprehensive)"],
  "neighborPlanners": {
    "securityPlanFile": "string | null",
    "raiPlanFile": "string | null",
    "ssscPlanFile": "string | null"
  }
}
```

### Field semantics

* `projectSlug` — kebab-case identifier derived from the originating issue title or user-provided project name.
* `currentPhase` — single phase the pipeline is currently executing. Advances only when the reviewer verdict for that phase is `APPROVED`. `DONE` indicates the full pipeline has completed.
* `entryMode` — how the pipeline was started. `from-issue` requires `issueNumber`; `from-prd` requires entries in `referencesProcessed`; `capture` requires neither.
* `entryPoint` — records which phases the orchestrator skips because an upstream HVE handoff already satisfies their checklist, evaluated at pipeline start (Phase 0) by `skraft-difficulty-routing`. `skipPhases` is empty by default (every phase runs). `handoffSource` names the detected HVE producer (`hve-ado`, `hve-jira`, `hve-github`) or `null` when no handoff exists. `handoffArtifacts` lists the relative paths of the detected backlog/sprint artefacts that were ingested. When `skipPhases` contains `"DISCOVER"`, the ingestion step writes the substitute DISCOVER artefacts (`research/{date}/triage-ingest-{date}.md`, `research/{date}/sprint-proposal.md`) so DISCUSS can start without re-triaging.
* `difficulty` — set once at the exit of DISCOVER (or, when DISCOVER is skipped, at pipeline start alongside `entryPoint`) by `skraft-difficulty-routing`. Drives the DELIVER execution model. Never reassessed mid-pipeline.
* `userPreferences.depthTier` — depth/strictness applied across all phases. Defaults to `comprehensive`. Any other value requires an explicit user choice recorded in `depthTierOverrides` with rationale. This dial is also the pipeline's **cost governor** (genesis B16 / B11): it sets reviewer fan-out (1/2/4 lenses), mutation-run count, and the Gherkin gate, so a lower tier reduces token spend and strictness together. Keep `comprehensive` for critical code.
* `userPreferences.maxRetriesPerPhase` — default `2`. When `retryCount[phase] >= maxRetriesPerPhase` and the verdict is not `APPROVED`, the orchestrator escalates to the user.
* `reviewArtifacts` — append-only list of relative paths under `reviews/{YYYY-MM-DD}/`. Reviewers write here exclusively.
* `neighborPlanners` — interop with sibling HVE planners (Security, RAI, SSSC). `null` when no plan exists.

## Six-Step State Protocol

Execute this protocol on **every turn** before producing user-facing output.

1. **READ** — Load `state.json` from `.copilot-tracking/skraft-plans/{project-slug}/state.json`.
2. **VALIDATE** — Confirm the document matches the schema above. If validation fails, follow the Recovery Procedure below before continuing.
3. **DETERMINE** — Inspect `currentPhase`, `reviewerVerdicts[currentPhase]`, `retryCount[currentPhase]`, and `phaseArtifacts[currentPhase]` to identify the next concrete action.
4. **EXECUTE** — Perform the action determined in step 3 (dispatch a phase agent, dispatch a reviewer, request user input, advance phase, etc.).
5. **UPDATE** — Mutate state fields in memory. Advance `currentPhase` only when the active reviewer verdict for that phase is `APPROVED`. Append-only on `phaseArtifacts[*]`, `reviewArtifacts`, `phasesCompleted`, `referencesProcessed`, `nextActions`, `depthTierOverrides`. Increment `retryCount[phase]` when a phase is re-dispatched after a non-APPROVED verdict.
6. **WRITE** — Persist the updated `state.json` to disk before returning to the user.

### Transition rules

* `currentPhase` transitions only on `APPROVED` reviewer verdict.
* On `REJECTED` or `NEEDS_REWORK`: the same phase agent is re-dispatched, `retryCount[phase]` is incremented, `currentPhase` does not change.
* The terminal state `DONE` is set when DELIVER's reviewer verdict is `APPROVED` and `phasesCompleted` contains all five phase names.

### State creation

On first invocation, create the project directory and write an initial `state.json`:

* `projectSlug` derived from the entry context.
* `currentPhase` set to `"DISCOVER"` (or to `"DISCUSS"` when Phase 0 detects an HVE handoff and records `"DISCOVER"` in `entryPoint.skipPhases`).
* `entryMode` set from the invoking prompt.
* `entryPoint` set to `{ "skipPhases": [], "handoffSource": null, "handoffArtifacts": [] }` by default; populated by Phase 0 when an HVE backlog/sprint handoff is detected and confirmed.
* `difficulty` set to `null` (assigned at DISCOVER exit, or at pipeline start when DISCOVER is skipped).
* `userPreferences.depthTier` set to `"comprehensive"`.
* `userPreferences.maxRetriesPerPhase` set to `2`.
* All other arrays empty, `retryCount` zeroed, `reviewerVerdicts` all `null`, `neighborPlanners` all `null`.

## Four-Step Resume Sequence

When returning to an existing session:

1. **Read** `state.json` to determine `currentPhase`, the last reviewer verdict for that phase, and `retryCount[currentPhase]`.
2. **Identify** pending work: an open reviewer verdict, an unprocessed reference, missing artifacts for the current phase, or unresolved user input.
3. **Check** for incomplete artifacts on disk: partially written phase outputs under `research/`, `plans/`, `adrs/`, `details/`, `changes/`, or `reviews/`.
4. **Present** a status summary to the user with an emoji checklist (✅ completed phases, 🔄 in-progress phase, ❓ pending decisions) before continuing.

## Recovery Procedure

When `state.json` is missing, malformed, or fails schema validation:

1. Search the project directory for the most recent valid `state.json` backup (`state.json.bak.*`). If found, restore it and re-run VALIDATE.
2. If no backup is recoverable, scan `research/`, `plans/`, `adrs/`, `details/`, `changes/`, and `reviews/` to infer the highest phase with completed artifacts.
3. Reconstruct `state.json` with conservative defaults: `currentPhase` set to the inferred phase, `phasesCompleted` set from on-disk evidence, `reviewerVerdicts[currentPhase]` set to `null`, `retryCount` zeroed, `userPreferences.depthTier` set to `"comprehensive"`.
4. Surface the reconstruction to the user with a checklist of inferred values and request confirmation before resuming.
5. Write a backup of the prior corrupted file as `state.json.corrupted.{timestamp}` before overwriting.

## Markdown header for tracked artifacts

Every markdown artifact written under `.copilot-tracking/skraft-plans/` (plans, research notes, ADR drafts, details, changes, reviews) must begin with the following header on the first line, before any frontmatter or content:

```
<!-- markdownlint-disable-file -->
```

This matches the HVE-Core convention and prevents lint noise on agent-generated content.
