---
layout: doc
lang: en
title: "resolving-stack-commands"
description: "Use whenever an agent must run a toolchain command (build, test, mutation) and needs the concrete invocation. Resolve..."
persona: tech-lead
---

# resolving-stack-commands

> Single resolution point that maps the detected repository stack to concrete build, test, and mutation commands — no agent hard-codes a command.

## When to use

- Whenever an agent must run a build, test, or mutation command
- Loaded by the `acceptance-designer` and `software-engineer` before any stack tool execution
- Before resolving quality gates (`quality-gates-evidence-contract`)

## Entry contract

- Stack markers present at the repository root (`*.sln`, `pom.xml`, etc.)
- Declared intent: `build`, `test`, or `mutation`

## Exit contract

- Concrete command resolved from the matching `quality-gates-<tech>` adapter
- Or a structured `status: blocked` block if the detected stack has no adapter

## Invariants

- **Zero hard-coded commands** — no agent writes `dotnet test`, `mvn test`, or any stack command directly
- **Unsupported stack → STOP** — never invent a command; always a structured blocker with `stack`, `markers`, `needed`
- **Multiple stacks** — each adapter is run independently and results are aggregated
- **Adding a stack = adding an adapter only** — zero edits to existing agents

## Why this shape

The pipeline must run with .NET today and other stacks tomorrow (Java planned, not yet supported). Centralising the mapping keeps all agents tech-agnostic: they say "build the solution", this skill says how.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

The rule applies to configuration too: duplicating a build command in every agent is the same antipattern as duplicating business logic in every call site.

## Allowed customisation

- Adding new detection rows and `quality-gates-<tech>` adapters (L2)
- Co-existing stacks with result aggregation (L2)

## See also

- [quality-gates-dotnet]({{ "/en/reference/skills/quality-gates-dotnet" | relative_url }}) — .NET adapter (supported)
- [quality-gates-evidence-contract]({{ "/en/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Tech-agnostic evidence contract
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Primary calling agent
- [acceptance-designer]({{ "/en/reference/agents/acceptance-designer" | relative_url }}) — Calling agent in the DISTILL phase
