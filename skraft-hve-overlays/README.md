---
title: skraft-hve-overlays
description: One instruction that loads HVE rigor profiles for Backlog, PRD, and RPI agents
---

## HVE Rigor Overlay

`hve-rigor.instructions.md` is the only scope-attached instruction. Its
`applyTo: '**'` scope enters HVE work before a tracking artifact exists, then
requires the `hve-rigor` skill before Backlog, PRD, or RPI workflow work.

## Skill Profiles

The root `hve-rigor` skill routes each agent to focused Backlog and PRD, RPI
design, RPI delivery, or RPI review references. Each profile defines its
`MANDATORY` and `OPTIONAL` loads using `Load \`<skill-name>\` skill.`, rather
than direct skill paths or links.

Covered agents:

* ADO, GitHub, and Jira Backlog Managers
* AzDO and Jira PRD to WIT
* RPI Agent and its Research, Plan, Implement, and Review agents

Security, RAI, SSSC, Design Thinking, and Doc Ops are outside this overlay's
scope.

## Missing Skills

The `skraft` plugin supplies the referenced skills. When a required skill is
unavailable, the active HVE agent reports `[SKILL MISSING] <skill-name>` and
continues. An applicable optional skill reports
`[SKILL OPTIONAL-MISSING] <skill-name>` and continues.

## Distribution

This overlay does not modify HVE-Core, APM files, lockfiles, GitOps manifests,
or the `skraft` core plugin.
