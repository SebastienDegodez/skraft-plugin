---
layout: doc
lang: en
title: "The HVE-Core substrate"
description: "HVE-Core is the engineering pipeline recovery substrate: state.json, deterministic writes, task projection, and verdict-gated transitions."
---

# The HVE-Core substrate

> HVE-Core gives the engineering pipeline durable memory (`state.json`), recovery
> after interruption, and transitions gated by verdicts.

## Why a substrate

The pipeline driven by `skraft-orchestrator` needs one source of truth: where
engineering stands, what verdict was issued, and how many retries happened. Without
it, every agent would improvise state and recovery after an interruption would be
impossible. DISCOVER, DISCUSS, and Brownfield roots remain standalone workflows.
They do not mutate this state.

## `state.json` — the pipeline memory

State persists as JSON at
`.copilot-tracking/skraft-plans/{project-slug}/state.json`. Key fields:

```json
{
  "currentPhase": "RESEARCH | DESIGN | DISTILL | DELIVER | DONE",
  "difficulty": "simple | medium | medium-hard | challenging | null",
  "phaseArtifacts": { "DESIGN": ["adrs/ADR-001-...md"], "...": [] },
  "verdicts": { "DESIGN": "APPROVED | CHANGES_REQUESTED | null" },
  "retryCount": { "DESIGN": 0 },
  "userPreferences": {
    "autonomyTier": "full | partial | manual",
    "maxRetriesPerPhase": 2
  },
  "neighborPlanners": { "securityPlanFile": null, "raiPlanFile": null }
}
```

- `currentPhase` advances **only** on an `APPROVED` verdict.
- `phaseArtifacts`, `verdicts`, `retryCount` trace what each phase produced and
  how it was judged.
- `maxRetriesPerPhase` (default 2) bounds retries before human escalation.
- `difficulty` is written once at engineering entry and never reassessed. It decides,
  among other things, whether RESEARCH adds enough value to run.

The state carries **no quality dial**. Mutation and coverage thresholds, the four
adversarial review lenses, the Gherkin gate and the Outside-In double-loop TDD variant
are fixed once and for all by the `skraft-quality-bar` skill; they are the same on every
run, and nothing written into `state.json` can lower them.

## The write-through model

`state.json` is a safety snapshot, not a block reread on every turn:

1. **Rehydrate** — read and validate the snapshot once at session start.
2. **Project** — project phases into the harness-native task list.
3. **Execute** — decide from that list, then dispatch an agent or request a human decision.
4. **Record** — apply each mutation through the deterministic `state.mjs` CLI.
5. **Reflect** — mirror the mutation into the task list without rereading the whole JSON.

## How the phases articulate

`skraft-orchestrator` is selected with a refined story. It sequences only
RESEARCH → DESIGN → DISTILL → DELIVER. RESEARCH may be skipped according to
difficulty and has no declared phase reviewer. The next three phases advance
according to verdicts from their dedicated reviewers.

```mermaid
flowchart TD
    O([skraft-orchestrator]) -->|READ / WRITE| S[(state.json)]
    O --> D1[RESEARCH when needed]
    D1 --> D3[DESIGN]
    D3 --> R3{reviewer}
    R3 -->|APPROVED| D4[DISTILL]
    R3 -->|CHANGES_REQUESTED| D3
    D4 --> R4{reviewer}
    R4 -->|APPROVED| D5[DELIVER]
    R4 -->|CHANGES_REQUESTED| D4
    D5 --> R5{reviewer}
    R5 -->|APPROVED| DONE([DONE])
    R5 -->|CHANGES_REQUESTED| D5
```

On `CHANGES_REQUESTED`, the same phase is re-dispatched, `retryCount` increases,
and `currentPhase` does not move. When the retry budget is reached without
`APPROVED`, the orchestrator escalates to the user.

## Neighbour planners

HVE-Core hosts other planners (Security, RAI, SSSC). SKRAFT references their plans via
`neighborPlanners.*` but **never writes** into their directory — each planner stays the
owner of its artifacts.

## See also

- [Traces & auditability](traces.html)
- [HVE → SKRAFT](hve-vs-skraft.html)
- [Architecture](architecture.html)
