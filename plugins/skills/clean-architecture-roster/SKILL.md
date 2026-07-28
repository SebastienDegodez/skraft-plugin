---
name: clean-architecture-roster
description: Use when solution-architect must ground Clean Architecture layer-placement decisions (repository/service interface placement, dependency rule, naming) in the project's detected stack, and needs to know whether a stack-specific adapter is installed. Resolves the stack, then points to the concrete `clean-architecture-<stack>` adapter if one exists. Loaded by solution-architect at Phase 6 (DDD tactical design / language-specific layering). Optional enhancement, never a blocker — falls back to the generic DDD / Clean Architecture rules already in `architecture-patterns` when no adapter is installed.
---

# Clean Architecture Roster (stack-agnostic, optional adapter)

The single place that resolves **whether** a stack-specific Clean
Architecture adapter exists for the detected project stack, so
`solution-architect` never inlines the detect-and-fallback algorithm
itself.

## Why this exists

`contract-testing-roster`, `mocking-strategy-roster`, and
`resolving-stack-commands` all centralize "detect stack -> resolve
adapter" so agents never embed that algorithm in their own prose.
Layer-placement grounding follows the same shape — WHICH stack, WHICH
adapter (if any) — so it belongs in the same kind of roster. Centralizing
it here keeps `solution-architect` tech-agnostic: adding a new stack's
adapter is a one-line table edit, never an agent-body edit.

## One axis (stack), zero required opt-in

Unlike `contract-testing-roster` / `mocking-strategy-roster`, there is no
boolean opt-in and no hard requirement — Clean Architecture layering
ALWAYS has a generic, already-authored fallback (the DDD + Clean
Architecture rules in `architecture-patterns` and in `solution-architect`
Phase 6). A stack adapter only SHARPENS the decision with stack-native
conventions (naming, DI placement, folder layout); it never gates
progress.

## Detection -> adapter

Detect the project's primary language/stack — reuse the detection markers
from `resolving-stack-commands` where the stack overlaps (`*.sln`,
`**/*.csproj`, `pom.xml`, `build.gradle`, ...) rather than duplicating
them here. Then resolve the optional adapter:

| Stack | Adapter | Status |
|---|---|---|
| .NET | `clean-architecture-dotnet` | _(not yet provided in this plugin)_ |
| Java | `clean-architecture-java` | _(not yet provided)_ |

Adding a stack adapter = add a `clean-architecture-<stack>` skill and a
row here, with zero edits to `solution-architect`.

## Missing adapter -> proceed, do not stop

If the detected stack has no matching row (or the row says "not yet
provided"), announce `[SKILL OPTIONAL-MISSING] clean-architecture-<stack>`
and proceed with the generic DDD / Clean Architecture rules already
loaded via `architecture-patterns`. This is a deliberate deviation from
the sibling rosters' STOP-on-unsupported-stack contract
(`contract-testing-roster`, `mocking-strategy-roster`,
`resolving-stack-commands`): those resolve a REQUIRED test harness, where
proceeding without one would mean hand-rolling a fake harness. Layering
guidance is an ENHANCEMENT over an already-complete generic rule set, so
absence of an adapter is never a blocker here.

## Contract for callers

- Resolve the stack and the optional adapter here; do not embed the
  detect-or-fallback algorithm in the agent body.
- Adding a stack adapter = add a `clean-architecture-<stack>` skill and a
  row here, with zero edits to `solution-architect`.
- Never STOP on a missing adapter — this roster's failure mode is
  "proceed with the generic rule set already in `architecture-patterns`",
  not "block".
