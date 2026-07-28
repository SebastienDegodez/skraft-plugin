---
description: "Requires HVE Backlog, PRD, and RPI agents to load hve-rigor before work"
applyTo: '**'
---

# HVE Rigor Loader

Before any Backlog, PRD, or RPI workflow work, load the `hve-rigor` skill.
This includes reading or creating tracking artifacts, dispatching a subagent,
planning, implementing, reviewing, or mutating a work item.

After loading the skill, identify the active HVE agent and follow its
`MANDATORY` and `OPTIONAL` loading rules. If the active agent is not covered by
the skill, continue without applying an HVE rigor profile.