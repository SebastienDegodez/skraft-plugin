---
name: hve-rigor
description: "Use this skill before starting or executing HVE backlog, PRD, or RPI work, including delegated research, planning, implementation, validation, and review phases. Determine current HVE agent and phase, load the required SKRAFT skills before reasoning or tool use, propagate the requirement to subagents, and block completion when mandatory quality gates fail. Do not use for work outside HVE workflows."
---

# HVE Rigor

Apply SKRAFT quality controls to HVE workflows through one entrypoint. This skill
routes by work surface and phase. It does not replace HVE agents, formats, or
artifact ownership.

## Skill Loading — MANDATORY

Load this skill before starting when HVE agent identity, workflow intent, or
artifact path matches backlog, PRD, or RPI work. Only announce missing route or
leaf skills: `[SKILL MISSING] {skill-name}`. Missing mandatory skills block the
matching HVE route.

### Always perform at startup

1. Identify current HVE agent, phase, and target artifacts before reasoning,
   tool use, or delegation.
2. Select every matching route from the table below.
3. Load each skill listed under the selected reference's **Always load for this
   route** section before starting route work.
4. Include `hve-rigor/SKILL.md`, selected route, and required leaf skills in
   every delegated HVE subagent brief.
5. Re-check route gates before declaring phase or artifact complete.

### Load on demand (route-based)

| Route reference | Load when... |
|---|---|
| `./references/backlog.md` | ADO, GitHub, or Jira backlog discovery, triage, refinement, sprint planning, PRD-to-work-item planning, or execution |
| `./references/prd.md` | PRD Builder, meeting-to-PRD handoff, PRD session, PRD document, or PRD-derived work-item hierarchy |
| `./references/rpi-research-plan.md` | RPI Research or Plan, Task Researcher, Task Planner, Researcher Subagent, Plan Validator, or related artifacts |
| `./references/rpi-implementation.md` | RPI Implement, Task Implementor, Phase Implementor, change log, or source/test edit executed from an HVE plan |
| `./references/rpi-review.md` | RPI Review, Task Reviewer, RPI Validator, Implementation Validator, or review artifact |

RPI Agent can cross several routes during one run. Re-evaluate the table at
every phase transition and load each newly matching reference before phase
reasoning, tool use, or delegation.

## Route selection

Each route is a local reference file, not inline rules. A missing reference file
is a fail-closed condition: stop routing that surface and report the exact
missing path. Inside a loaded route, distinguish **Always load for this route**
from **Load on demand (trigger-based)** exactly as SKRAFT agents do.

## Delegation contract

Each HVE subagent brief must state:

* `Mandatory skill: hve-rigor/SKILL.md — load before starting.`
* current route and RPI phase, when applicable
* every always-load leaf skill for that route
* each on-demand leaf skill plus its trigger
* expected gate evidence in the return value

Subagent completion is invalid when its receipt omits the selected route,
loaded mandatory leaf skills, or required gate evidence.

## Non-HVE work

If neither agent identity, workflow intent, nor artifact path identifies an HVE
workflow, stop routing and add no SKRAFT requirements.
