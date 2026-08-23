---
name: skraft-difficulty-routing
description: "Use at pipeline start to detect an upstream HVE backlog/sprint handoff (entry-point skip), and at DISCOVER exit to evaluate the difficulty axis, validate immutable invariants, and persist to state.json"
---

# SKRAFT Difficulty Routing

Evaluate two orthogonal axes around the DISCOVER phase. The **Entry Point** axis is evaluated **at pipeline start (Phase 0)** — before DISCOVER — so the orchestrator can skip DISCOVER when an upstream HVE handoff already provides the backlog and the sprint. The **Difficulty** axis is evaluated **at the exit of DISCOVER** (or, when DISCOVER is skipped, immediately after ingestion at pipeline start). The orchestrator invokes this skill, then persists the outcome to `state.json`.

## The two orthogonal axes

### 1. Entry Point — which phases run

Determine whether any phase can be skipped because an upstream artefact already satisfies its checklist. In v1 this targets a single case: **DISCOVER is skipped when an HVE handoff already provides a triaged backlog and a calculated sprint**, so SKRAFT does not re-triage issues or re-propose a sprint. Persisted in `state.json::entryPoint`. Default: `skipPhases` is empty — every phase runs.

#### Detection — HVE handoff signals

At pipeline start, look for either form of HVE output (both may be present):

| Form | Signal | `handoffSource` |
|---|---|---|
| **A — GitHub issues already triaged + scheduled** | Open issues already carry triage labels (`type/*`, priority `P0–P3`, effort) **and** a milestone or sprint/iteration assignment, with no pending DISCOVER artefacts | `hve-github` |
| **B — ADO sprint artefact** | A `sprint-plan.md` exists under `.copilot-tracking/workitems/sprint/{iteration}/` (HVE ADO backlog manager output) with a capacity/coverage table | `hve-ado` |
| **B — Jira sprint artefact** | A planned-sprint artefact exists under `.copilot-tracking/jira-issues/**` with an Epic/Feature/Story hierarchy and a sprint assignment | `hve-jira` |

A handoff is **confirmed** only when the signal carries BOTH a backlog hierarchy (Epic/Feature/Story or triaged issues) AND a sprint/iteration scope. A backlog with no sprint, or a sprint with no triaged items, is NOT a complete handoff — DISCOVER runs normally.

#### Confirmation gate

Detection never auto-skips. Surface the detected handoff to the user once and require explicit acknowledgement before recording the skip:

```
🔎 HVE handoff detected
Source: {handoffSource}
Backlog: {n} items (Epic/Feature/Story | triaged issues)
Sprint: {sprint/iteration name} — capacity {value}
Artefacts: {handoffArtifacts}

SKRAFT can SKIP its DISCOVER phase (no re-triage, no second sprint proposal)
and ingest this handoff directly into DISCUSS. Proceed? [skip DISCOVER | run DISCOVER anyway]
```

If the user chooses **run DISCOVER anyway**, leave `entryPoint.skipPhases` empty and proceed normally. If the user chooses **skip DISCOVER**, set `entryPoint = { skipPhases: ["DISCOVER"], handoffSource, handoffArtifacts }` and run the ingestion protocol below.

#### Ingestion protocol (only when DISCOVER is skipped)

The DISCUSS agent (`backlog-planner`) requires DISCOVER artefacts (`research/{date}/triage-*.md`, optionally `sprint-proposal.md`). When DISCOVER is skipped, this skill maps the HVE handoff into those expected artefacts — it does NOT re-triage or re-prioritize:

1. **Map the backlog → `research/{date}/triage-ingest-{date}.md`.** For each HVE work item / triaged issue, copy across: title, type, the HVE priority (do NOT recompute it), effort if present, and the source reference (work item ID or issue number). Add a header noting `source: {handoffSource}` and `ingested: true` so downstream readers know triage was inherited, not produced.
2. **Map the sprint → `research/{date}/sprint-proposal.md`.** Copy the HVE sprint scope verbatim: the ordered list of items in the sprint, the capacity figure, and any dependency ordering. Do NOT re-run capacity×0.7, MoSCoW, or the P0 override — the sprint is inherited as-is. Add a note: `Sprint inherited from {handoffSource}; not recomputed by SKRAFT.`
3. **Sanitize** internal tracking paths per HVE convention (strip `.copilot-tracking/` absolute paths, keep work item / issue IDs and standards references).
4. Record both written paths in `state.json::phaseArtifacts.DISCOVER` and append the handoff source paths to `state.json::entryPoint.handoffArtifacts`.

The immutable invariants below still apply to the ingested artefacts (dated HVE paths, schema compliance, no secrets).

### 2. Difficulty Tier — DELIVER execution model

Persisted in `state.json::difficulty`. Drives whether the software-engineer agent works inline or dispatches sub-agents and intermediate artifacts:

| Difficulty | DELIVER execution model |
|---|---|
| `simple` | Inline TDD cycle, single commit per scenario |
| `medium` | Inline TDD cycle, multi-commit per scenario, walking skeleton |
| `medium-hard` | Dispatch sub-agent per Gherkin scenario, write intermediate plan |
| `challenging` | Dispatch sub-agent per scenario, write spike notes under `details/{date}/`, multiple review passes |

Difficulty is assessed once at DISCOVER exit and never re-evaluated mid-pipeline.

## Immutable invariants (always blocking)

These hold on every run. Nothing downgrades them:

- **TDD mandatory** — at minimum Red-Green; no production code without a prior failing test.
- **Clean Architecture layer boundaries** — Domain depends on neither Application nor Infrastructure.
- **Test integrity** — no test may be deleted or disabled to pass GREEN.
- **state.json schema compliance** — every turn writes a valid state document.
- **HVE dated paths** — `research/{date}/`, `details/{date}/`, `changes/{date}/`, `reviews/{date}/` (ADRs are project-global in `docs/adr/`, not a per-run dated path).
- **Reviewers are read-only** — reviewers write exclusively to `reviews/{date}/`.
- **No secrets or credentials committed**.

## Gate enforcement

Every gate blocks, and the thresholds are permanent. `skraft-quality-bar` owns both --
this skill does not restate them. There is no advisory level, no warning level, and no
override.

## Output protocol

After evaluation, the orchestrator must:

1. Write `state.json::entryPoint` (including `skipPhases`, `handoffSource`, `handoffArtifacts`) and `state.json::difficulty` (per-work-item).
2. When `entryPoint.skipPhases` contains `"DISCOVER"`, confirm the ingestion artefacts (`research/{date}/triage-ingest-{date}.md`, `research/{date}/sprint-proposal.md`) exist before setting `currentPhase` to `DISCUSS`.
3. Surface the routing decision in the next user-facing message using an emoji checklist (✅ chosen axis values, 🛡️ active invariants, ⏭️ any skipped phase with its handoff source).
4. Proceed to DISCUSS once the user acknowledges the routing summary.
