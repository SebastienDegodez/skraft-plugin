---
layout: doc
lang: en
title: "contract-testing-roster"
description: "Use when an agent must produce a provider-side contract test and needs to know the stack adapter and whether the Microcks opt-in is enabled. Loaded by contract-testing-worker."
persona: tech-lead
---

# contract-testing-roster

> One axis (stack) + one boolean (opt-in): resolves how a provider-side contract test is built — never hardcode the decision in a worker.

## When to use

- Before emitting a provider-side contract test — loaded by [contract-testing-worker]({{ "/en/reference/workers/contract-testing-worker" | relative_url }})
- Determining whether the Microcks verification layer should be added on top of the baseline
- Adding a new stack adapter (add one row + one `contract-testing-{stack}` skill, zero other edits)

## Entry contract

- Run prompt (may carry an explicit opt-in request — highest priority)
- `.github/instructions/skraft.instructions.md` field `testing.contract.microcks` (read by tool call, never recalled)

## Exit contract

- Resolved adapter link (e.g. [contract-testing-dotnet]({{ "/en/reference/skills/contract-testing-dotnet" | relative_url }})) + opt-in flag
- OR: `status: blocked` payload with `type` and `context` if the opt-in value is invalid or the stack has no adapter

## Invariants

- **Read the opt-in by tool call** — never assume from recall; if the file is absent, fall through to default `false`
- **Cascade**: explicit prompt > `skraft.instructions.md` `testing.contract.microcks` > default `false`
- **Unknown value → stop** — emit `status: blocked` with `type: invalid_contract_optin`; never guess a wiring
- **Unsupported stack → stop** — emit `status: blocked` with `type: unsupported_stack`
- **Adding a stack = one adapter + one table row** — zero edits to this skill or the worker

## Why this shape

Centralising the routing decision in one skill prevents each worker from hardcoding a stack assumption. Any new stack plugs in without touching existing agents.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Stack adapter table

| Stack | Adapter | Status |
|-------|---------|--------|
| .NET | [contract-testing-dotnet]({{ "/en/reference/skills/contract-testing-dotnet" | relative_url }}) | supported |
| Java | *(contract-testing-java not yet provided)* | NOT SUPPORTED |

## Allowed customisation

- Per-stack adapters added independently (no edits to this skill or the worker needed)

## See also

- [contract-testing]({{ "/en/reference/skills/contract-testing" | relative_url }}) — Generic contract authoring (OpenAPI, Microcks samples)
- [contract-testing-dotnet]({{ "/en/reference/skills/contract-testing-dotnet" | relative_url }}) — .NET adapter resolved by this roster
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that triggers the worker that loads this skill
