---
layout: doc
lang: en
title: "skraft-difficulty-routing"
description: "Use at pipeline start to detect an upstream HVE backlog/sprint handoff (entry-point skip), and at DISCOVER exit to ev..."
persona: tech-lead
---

# skraft-difficulty-routing

> Evaluates two orthogonal axes around DISCOVER — the entry point (can DISCOVER be skipped because an upstream HVE handoff already provides the backlog and the sprint?) and the difficulty tier (how DELIVER executes) — and persists the decision to `state.json` before transitioning to DISCUSS.

## When to use

- At pipeline start (Phase 0), before DISCOVER, to detect an upstream HVE handoff
- At the DISCOVER phase exit, once per pipeline run, to assess the difficulty
- When DISCOVER is skipped, immediately after ingestion of the handoff
- Before any transition to DISCUSS
- Invoked by the SKRAFT orchestrator

## The two axes

| Axis | Evaluated | Persisted in | Decides |
|---|---|---|---|
| Entry point | Pipeline start (Phase 0) | `state.json::entryPoint` | Whether DISCOVER is skipped because an HVE handoff already provides a triaged backlog **and** a calculated sprint |
| Difficulty | DISCOVER exit | `state.json::difficulty` | The DELIVER execution model — inline TDD versus a sub-agent dispatched per Gherkin scenario |

There is no third axis. The repo-wide depth tier that used to be routed here has been removed; `skraft-quality-bar` now owns every threshold and the enforcement level of every gate, permanently.

### Difficulty → DELIVER execution model

| Difficulty | DELIVER execution model |
|---|---|
| `simple` | Inline TDD cycle, single commit per scenario |
| `medium` | Inline TDD cycle, multi-commit per scenario, walking skeleton |
| `medium-hard` | Sub-agent dispatched per Gherkin scenario, intermediate plan written |
| `challenging` | Sub-agent per scenario, spike notes under `details/{date}/`, multiple review passes |

## Entry contract

- Validated DISCOVER artifacts — or, when DISCOVER is skipped, the artifacts produced by ingesting the handoff
- At pipeline start, the candidate HVE signals: GitHub issues already triaged **and** scheduled on a milestone or iteration (`hve-github`), a `sprint-plan.md` under `.copilot-tracking/workitems/sprint/{iteration}/` (`hve-ado`), or a planned-sprint artifact under `.copilot-tracking/jira-issues/**` (`hve-jira`)
- Explicit user acknowledgement of any detected handoff — detection never auto-skips a phase
- `state.json` existing or creatable at the plan root

## Exit contract

- `state.json::entryPoint` — `skipPhases`, `handoffSource`, `handoffArtifacts`; `skipPhases` is empty by default, so every phase runs
- `state.json::difficulty` — DELIVER execution model (`simple`, `medium`, `medium-hard`, `challenging`)
- When `skipPhases` contains `"DISCOVER"` — `research/{date}/triage-ingest-{date}.md` and `research/{date}/sprint-proposal.md` mapped from the handoff, recorded in `state.json::phaseArtifacts.DISCOVER`, and confirmed present before `currentPhase` becomes `DISCUSS`
- Routing summary displayed to the user (emoji checklist ✅ chosen axis values, 🛡️ active invariants, ⏭️ any skipped phase with its handoff source)

## Invariants

- **TDD mandatory** — at minimum Red-Green; no production code without a prior failing test
- **Clean Architecture boundaries** — Domain depends on neither Application nor Infrastructure
- **Test integrity** — no test deleted or disabled to pass GREEN
- **`state.json` schema compliance** — every turn produces a valid document
- **HVE dated paths** — `research/{date}/`, `details/{date}/`, `changes/{date}/`, `reviews/{date}/` (ADRs are project-global under `docs/adr/`, not a per-run dated path)
- **Reviewers are read-only** — they write exclusively to `reviews/{date}/`
- **No secrets or credentials committed**
- **Single evaluation** — difficulty is assessed at DISCOVER exit and never re-evaluated mid-pipeline
- **Every gate blocks** — thresholds and enforcement levels belong to `skraft-quality-bar`; there is no advisory level, no warning level, and no rationale that buys an exemption
- **Inherited triage is never recomputed** — an ingested HVE backlog keeps its priorities and its sprint scope verbatim (no capacity×0.7, no MoSCoW, no P0 override)

## Why this shape

Routing decides *where the pipeline starts* and *how DELIVER executes* — never how strict it is. Quality cannot drift between runs because no lever remains that could lower it: the bar is permanent and identical for every repository, work item and phase. Persisting both axes in `state.json` keeps the decision auditable and consultable by every pipeline agent.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

The immutable invariants guarantee that no routing outcome can remove TDD or violate architectural boundaries — the pipeline's trustworthiness rests on this guarantee. Skipping DISCOVER changes who produced the backlog, not what the invariants demand of the ingested artifacts.

The removed depth tier was also the framework's cost governor: it scaled the reviewer fan-out (1 / 2 / 4), the number of mutation runs and the Gherkin gate. Every run now pays the full shape. The repository owner accepted that cost deliberately — quality is not negotiable — and difficulty remains the only dial on this page, one that changes how execution is shaped without ever reducing the bar.

## Allowed customisation

- Difficulty assessment per work item (L1) — it selects the DELIVER execution model, nothing else
- Phase bypass via `entryPoint` when a confirmed HVE handoff already provides the required artifacts (L2)
- Nothing here weakens a gate: no threshold, no enforcement level and no exemption is configurable

## See also

- [skraft-quality-bar]({{ "/en/reference/skills/skraft-quality-bar" | relative_url }}) — The permanent thresholds and the blocking level of every gate
- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — Double-loop TDD cycle, the TDD variant used on every run
- [mutation-testing]({{ "/en/reference/skills/mutation-testing" | relative_url }}) — Mutation run and survivor classification
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that consumes the difficulty
