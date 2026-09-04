---
name: skraft-entry-point-routing
description: "Use at pipeline start to detect an upstream backlog or sprint handoff, validate immutable engineering invariants, and persist the phases that may be skipped. Do not vary delivery rigor."
---

# SKRAFT Entry-Point Routing

Detect whether an upstream planning handoff already satisfies SKRAFT phase obligations. Persist the evidence in `state.json::entryPoint`. Default to `skipPhases: []`: every phase runs unless a confirmed handoff proves otherwise.

## Detection

At pipeline start, look for any supported upstream planning output. Several forms may be present.

| Form | Required evidence | `handoffSource` |
|---|---|---|
| GitHub issues | Open issues carry triage labels (`type/*`, priority `P0–P3`, effort) and a milestone or sprint/iteration assignment, with no pending DISCOVER artefacts | `github` |
| ADO sprint artefact | `.copilot-tracking/workitems/sprint/{iteration}/sprint-plan.md` contains a capacity/coverage table | `ado` |
| Jira sprint artefact | `.copilot-tracking/jira-issues/**` contains an Epic/Feature/Story hierarchy and sprint assignment | `jira` |

A handoff is complete only when evidence contains both a backlog hierarchy or triaged issues and a sprint or iteration scope. Otherwise leave `skipPhases` empty and run DISCOVER.

## Confirmation gate

Never auto-skip. Show the detected source, backlog item count, sprint or iteration, capacity when present, and artefact paths. Ask the user to choose `skip DISCOVER` or `run DISCOVER anyway`.

- `run DISCOVER anyway`: persist `entryPoint = { skipPhases: [], handoffSource, handoffArtifacts }` and proceed normally.
- `skip DISCOVER`: persist `entryPoint = { skipPhases: ["DISCOVER"], handoffSource, handoffArtifacts }`, then run ingestion.

## Ingestion when DISCOVER is skipped

Map inherited upstream output into the artefacts DISCUSS expects without re-triaging, re-prioritizing, or recalculating sprint scope:

1. Write `research/{date}/triage-ingest-{date}.md`. Copy each title, type, inherited priority, effort when present, and source ID. Mark `source: {handoffSource}` and `ingested: true`.
2. Write `research/{date}/sprint-proposal.md`. Copy ordered scope, capacity, and dependency order verbatim. State `Sprint inherited from {handoffSource}; not recomputed by SKRAFT.`
3. Strip absolute `.copilot-tracking/` paths while retaining work-item or issue IDs and standards references.
4. Record both generated paths in `state.json::phaseArtifacts.DISCOVER`. Record source paths in `state.json::entryPoint.handoffArtifacts`.
5. Confirm both generated artefacts exist before advancing to DISCUSS.

## Immutable invariants

Every invariant is blocking on every route:

- TDD remains mandatory; production code requires prior failing-test evidence.
- Clean Architecture dependencies point inward.
- Tests are never deleted or disabled to obtain GREEN.
- Every state write preserves `state.json` schema compliance.
- Run artefacts use dated `research/{date}/`, `details/{date}/`, `changes/{date}/`, and `reviews/{date}/` paths; ADRs remain project-global under `docs/adr/`.
- Reviewers remain read-only and write only under `reviews/{date}/`.
- Secrets and credentials are never committed.

`skraft-quality-bar` owns permanent gate thresholds. Entry-point routing cannot weaken, omit, or override any gate.

## Output protocol

1. Persist `entryPoint` once at pipeline start with `skipPhases`, `handoffSource`, and `handoffArtifacts`.
2. If DISCOVER is skipped, verify ingestion artefacts before advancing to DISCUSS.
3. Surface source evidence, active invariants, and skipped phases in the routing summary.
4. Continue at the first phase not satisfied by the confirmed handoff.