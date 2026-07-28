---
name: hve-rigor
description: "Use when an HVE Backlog, PRD, or RPI agent starts work and must load the applicable SKRAFT rigor skills before its workflow begins."
---

# HVE Rigor

Load the SKRAFT rigor required by the active HVE agent before it starts its
workflow. This skill covers HVE Backlog, PRD, and RPI agents only. It does not
apply to Security, RAI, SSSC, Design Thinking, or Doc Ops agents.

## Startup Protocol

1. Identify the active HVE agent from its selected agent profile or parent
   dispatch.
2. Load the matching profile reference from Profile Routing.
3. Process every `MANDATORY` item in the listed order before workflow work.
4. Process an `OPTIONAL` item only when its trigger applies.
5. Report missing skills, then continue with the remaining applicable work.

## Missing Skills

When a mandatory skill cannot be loaded, report:

```text
[SKILL MISSING] <skill-name>
```

When an applicable optional skill cannot be loaded, report:

```text
[SKILL OPTIONAL-MISSING] <skill-name>
```

Do not replace a missing skill with improvised rules. Continue only with the
skills that loaded successfully.

## Loading Receipt

Before workflow work, emit this concise receipt:

```text
HVE RIGOR LOADING
Agent: <HVE agent name>
MANDATORY
- <loaded skill or [SKILL MISSING] skill-name>
OPTIONAL
- <loaded skill, not-triggered skill, or [SKILL OPTIONAL-MISSING] skill-name>
```

## Profile Routing

Load the reference for the active agent. The RPI Agent loads its own profile,
then the profile of each phase-specific agent it dispatches.

| Active HVE agent | Profile reference |
|------------------|-------------------|
| ADO Backlog Manager | [Backlog and PRD](./references/backlog-prd.md) |
| GitHub Backlog Manager | [Backlog and PRD](./references/backlog-prd.md) |
| Jira Backlog Manager | [Backlog and PRD](./references/backlog-prd.md) |
| AzDO PRD to WIT | [Backlog and PRD](./references/backlog-prd.md) |
| Jira PRD to WIT | [Backlog and PRD](./references/backlog-prd.md) |
| RPI Agent | [RPI Design](./references/rpi-design.md) |
| Task Researcher | [RPI Design](./references/rpi-design.md) |
| Researcher Subagent | [RPI Design](./references/rpi-design.md) |
| Task Planner | [RPI Design](./references/rpi-design.md) |
| Plan Validator | [RPI Design](./references/rpi-design.md) |
| Task Implementor | [RPI Delivery](./references/rpi-delivery.md) |
| Phase Implementor | [RPI Delivery](./references/rpi-delivery.md) |
| Task Reviewer | [RPI Review](./references/rpi-review.md) |
| RPI Validator | [RPI Review](./references/rpi-review.md) |
| Implementation Validator | [RPI Review](./references/rpi-review.md) |