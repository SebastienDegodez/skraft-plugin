---
name: mocking-strategy-roster
description: Use when an agent must mock a downstream HTTP/event dependency for an integration test and needs to know WHICH mocking strategy and stack adapter to use. Resolves the mocking strategy (Microcks by default, overridable to an in-process library) and the stack, then points to the concrete `mocking-<strategy>-<stack>` adapter. Loaded by the mock-integration-worker. No agent hardcodes a mocking approach — it resolves it here.
---

# Mocking Strategy Roster (stack + strategy agnostic)

The single place that resolves **how** a downstream dependency is mocked for an
integration test. No agent and no worker hardcodes "spin up Microcks" or "use
Moq". They resolve the pair `(strategy x stack)` here, then load the matching
adapter.

This mirrors `resolving-stack-commands`: the roster owns the routing table; the
adapters own the concrete wiring.

## Two orthogonal axes

- **Strategy** — WHICH mocking approach. Exclusive choice:
  - `microcks` (DEFAULT, overridable) — mock the downstream from its
    OpenAPI/examples contract via a container.
  - `inprocess` — an in-process test double injected into the test host DI.
- **Stack** — WHICH toolchain, detected via `resolving-stack-commands`.

The two axes never mix inside one file. Each `(strategy x stack)` pair is one
thin adapter.

## Resolving the strategy (override cascade)

Read the strategy by tool-call, never from recall. Precedence, first writer wins:

1. **Explicit prompt** — the run prompt names a strategy/library
   (e.g. "mock with Moq", "use Microcks here"). Highest priority.
2. **Repo instruction file** — read
   `.github/instructions/skraft.instructions.md` field
   `testing.mocking.strategy` (and `testing.mocking.library` when
   `strategy: inprocess`). Read ONLY the `testing.mocking.*` namespace.
3. **Default** — `microcks`.

Read the file with a tool call (it is a fact-that-must-be-true, S7). Do not
assume its contents. If the file is absent, fall through to the default.

When `strategy: inprocess` resolves but no `library` is named, the chosen
adapter's Library table decides — its rows are ordered by priority (top =
highest). The roster does not restate the order.

## Detection -> adapter

Detect the stack from markers at the repo root (delegate to
`resolving-stack-commands`), then resolve the concrete adapter from the matching
`mocking-<strategy>-<stack>` skill:

| Strategy | Stack | Adapter | Status |
|---|---|---|---|
| microcks | .NET | [mocking-microcks-dotnet](../mocking-microcks-dotnet/SKILL.md) | supported |
| inprocess | .NET | [mocking-inprocess-dotnet](../mocking-inprocess-dotnet/SKILL.md) | supported |
| microcks | Java | _(mocking-microcks-java not yet provided)_ | NOT SUPPORTED |
| inprocess | Java | _(mocking-inprocess-java not yet provided)_ | NOT SUPPORTED |

Adding a stack = add the `mocking-<strategy>-<stack>` adapter(s) and the row(s)
here, with zero edits to the worker or the orchestrator.

## Unknown value -> stop, never guess

If the resolved strategy is outside `{microcks, inprocess}`, or the library is
outside `{moq, fakeiteasy, nsubstitute}` when `strategy: inprocess`, or the
detected stack has no adapter, STOP and emit a structured blocker. Never invent
a wiring:

```yaml
status: blocked
type: unsupported_mocking_strategy   # | unsupported_mocking_library | unsupported_stack
message: No mocking adapter for the resolved (strategy x stack)
context:
  strategy: kafka-mock
  stack: dotnet
  source: prompt | skraft.instructions.md | default
```

## Contract for callers

- Resolve `(strategy x stack)` here; do not embed a mocking approach in the worker.
- Load the resolved adapter and apply its recipe.
- Adding a strategy or stack = add an adapter and a row here, zero edits elsewhere.
