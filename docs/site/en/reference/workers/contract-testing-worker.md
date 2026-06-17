---
layout: doc
lang: en
title: "contract-testing-worker"
description: "[Internal worker — dispatched by software-engineer only] Emits a provider-side contract test. Always produces the baseline WebApplicationFactory + HttpClient test; adds Microcks TestEndpointAsync when the opt-in is set."
persona: software-engineer
---

# contract-testing-worker

> Internal worker dispatched by `software-engineer` during DELIVER: produces the provider-side contract test for THIS service's API — baseline always, Microcks opt-in additive.

## When active

Dispatched by `software-engineer` during the DELIVER phase when a provider-side contract test is needed for the active API slice. Not user-invocable directly.

**This worker is provider-side**: it verifies that our own API behaves as the contract says. It does NOT mock a downstream dependency — that is [mock-integration-worker]({{ "/en/reference/workers/mock-integration-worker" | relative_url }}).

## Inputs

**Required:**
- API (provider) descriptor for the active slice

**Context:**
- Contract artifacts (`{api}.yaml` + `.apiexamples.yaml` + `.apimetadata.yaml`) if present
- `.copilot-tracking/skraft-plans/{slug}/state.json`
- Run prompt (may request the Microcks opt-in)
- `.github/instructions/skraft.instructions.md` — `testing.contract.*` namespace

## Output

Structured result block returned to the lead — no commit:

```yaml
status: ok
capability: contract-testing
stack: dotnet
microcks: false | true
files:
  - <relative paths created>
testCommand: <resolved test command>
notes: baseline always ; Microcks TestEndpointAsync(OPEN_API_SCHEMA) added iff opt-in
```

## Workflow

1. Load [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }}) — resolve stack + opt-in via cascade (prompt > `skraft.instructions.md` > default `false`)
2. On blocker (invalid opt-in / unsupported stack): return the roster's `blocked` payload verbatim
3. Load the resolved `contract-testing-{stack}` adapter and emit Layer 1 (always) + Layer 2 (opt-in)
4. Resolve the test command via [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }})
5. Return the structured result to the lead

## Invariants

- **Layer 1 (baseline WAF + HttpClient) is ALWAYS emitted**, regardless of opt-in
- **Layer 2 (Microcks TestEndpointAsync) is ADDITIVE** — never replaces Layer 1
- **Read the opt-in by tool call** — never from recall (S6 RULE BRIDGE)
- **Resolve the test command** via `resolving-stack-commands` — never hardcode (S7 DETERMINISTIC TOOL BRIDGE)
- **No commit** — returns a structured result; the lead commits

## Why this shape

Separating the worker (contract wiring) from the lead (business TDD) keeps each responsibility at its natural scope. The lead integrates the provider test into the TDD loop without delegating business logic to the worker.

> « Start with a failing test that describes the behaviour you want, guided by tests from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## See also

- [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }}) — Resolves stack and opt-in
- [contract-testing-dotnet]({{ "/en/reference/skills/contract-testing-dotnet" | relative_url }}) — .NET adapter applied by this worker
- [contract-testing]({{ "/en/reference/skills/contract-testing" | relative_url }}) — Generic contract authoring
- [contract-fidelity-lens]({{ "/en/reference/workers/contract-fidelity-lens" | relative_url }}) — Conditional lens that audits the output of this worker
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that dispatches this worker
