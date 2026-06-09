---
name: contract-testing-roster
description: Use when an agent must produce a provider-side contract test for THIS service's API and needs to know the stack adapter and whether the optional Microcks verification layer is enabled. Resolves the stack and reads the Microcks opt-in (off by default), then points to the concrete `contract-testing-<stack>` adapter. Loaded by the contract-testing-worker. A baseline in-process integration test is always produced; Microcks contract verification is an additive opt-in.
---

# Contract Testing Roster (stack agnostic, opt-in Microcks)

The single place that resolves **how** a provider-side contract test is built.
A baseline in-process integration test (the app started in-memory, exercised over
real HTTP) is ALWAYS produced. A Microcks contract-verification layer is an
ADDITIVE opt-in, stacked on top — never a replacement, never a default. The
concrete harness (e.g. WebApplicationFactory, @SpringBootTest, supertest) and the
concrete Microcks call are owned by the per-stack adapter, NOT by this roster.

This mirrors `resolving-stack-commands`: the roster owns routing + the opt-in
read; the per-stack adapter owns the concrete wiring of both layers.

## One axis (stack) + one boolean (opt-in)

Unlike mocking, there is no exclusive strategy choice here. Only:

- **Stack** — WHICH toolchain, detected via `resolving-stack-commands`.
- **Microcks opt-in** — a boolean ADD-ON. `false` = baseline only (default);
  `true` = baseline + Microcks contract-verification layer (the adapter picks the
  stack-appropriate Microcks API).

## Resolving the opt-in (cascade)

Read the opt-in by tool-call, never from recall. Precedence, first writer wins:

1. **Explicit prompt** — the run prompt asks for Microcks contract verification.
2. **Repo instruction file** — read
   `.github/instructions/skraft.instructions.md` field
   `testing.contract.microcks`. Read ONLY the `testing.contract.*` namespace.
3. **Default** — `false`.

Read the file with a tool call (fact-that-must-be-true, S7). If absent, default.

## Detection -> adapter

Detect the stack (delegate to `resolving-stack-commands`), then resolve the
per-stack adapter. The adapter carries BOTH layers and branches on the opt-in
flag internally:

| Stack | Adapter | Status |
|---|---|---|
| .NET | [contract-testing-dotnet](../contract-testing-dotnet/SKILL.md) | supported |
| Java | _(contract-testing-java not yet provided)_ | NOT SUPPORTED |

Adding a stack = add ONE `contract-testing-<stack>` adapter and the row here,
with zero edits to the worker or the orchestrator.

## Generic source

Both layers consume the GENERIC contract artifacts authored by the
[contract-testing](../contract-testing/SKILL.md) skill (OpenAPI / `.apiexamples`
/ `.apimetadata`). The roster does not duplicate that authoring.

## Unknown value -> stop, never guess

If `testing.contract.microcks` is neither `true` nor `false`, or the detected
stack has no adapter, STOP and emit a structured blocker:

```yaml
status: blocked
type: invalid_contract_optin   # | unsupported_stack
message: Could not resolve the contract-testing configuration
context:
  microcks: "maybe"
  stack: dotnet
  source: prompt | skraft.instructions.md | default
```

## Contract for callers

- Resolve `(stack)` + opt-in here; do not embed the decision in the worker.
- Baseline in-process integration test is ALWAYS produced regardless of the opt-in.
- Adding a stack = add an adapter and a row here, zero edits elsewhere.
