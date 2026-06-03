---
layout: doc
lang: en
title: "create-custom-agent"
persona: tech-lead
---

# create-custom-agent

> Scaffolds VS Code agent files (`.agent.md`) with proper structure, tools, and handoffs.

## When to use

- When creating a new custom agent
- To configure inter-agent workflows (handoffs)
- To define an agent's tool restrictions

## Entry contract

- Description of the agent's role and responsibility
- List of required tools
- Relationships with other agents (handoffs)

## Exit contract

- `.agent.md` file with valid YAML frontmatter
- Tool, instruction, and handoff configuration
- Inline documentation of expected behaviour

## Invariants

- **One file = one agent** — Each agent is self-contained in a single file
- **Valid frontmatter** — YAML frontmatter follows the VS Code schema
- See [Customisation](/en/customisation) for the full list

## Why this shape

Each agent is a self-contained, composable, replaceable text file. This principle comes directly from the pragmatic philosophy: separate concerns into independent text pieces.

> « Keep knowledge in plain text. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

A well-defined agent has a clear responsibility, explicit inputs/outputs, and documented constraints — exactly like a Use Case.

> « A use case captures a contract between the stakeholders of a system about its behavior. »
> — Cockburn, A., *Writing Effective Use Cases*, 2001.

## Allowed customisation

- Agent file template (L1)
- Default tool list (L2)
- Naming conventions (L1)

## See also

- [skraft-orchestrator](/en/reference/agents/skraft-orchestrator) — Example orchestrator agent
- [Customisation](/en/customisation) — Customisation levels
- [Architecture](/en/architecture) — Agent system overview
