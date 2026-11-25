---
name: mutation-testing
description: Use when the developer asks, after a /skraft-mutation run, to classify or kill the surviving mutants it listed. Mutation testing is the developer's responsibility and never runs in the pipeline; this skill only says what a survivor means and how to kill it.
---

# Mutation Testing

Verify that tests **actually catch bugs** — not just execute code.

## Core Rule

A test that kills no mutant is noise. DELETE IT.

## The developer owns mutation

Mutation testing never runs in the pipeline: every delivery records G6 `not_run`. The developer
runs `/skraft-mutation`, which asks for their command and runs it. You never install a mutation
tool, write its config or a mutation command, or run mutation on your own initiative.

Survivors come from the `/skraft-mutation` output (`.copilot-tracking/mutation/qg-mutation.stdout`),
one `survived: <file>:<line> <detail> (<component> <scope>)` line each, the file relative to the
repository. When the team reports none, read the tool's output in
`.copilot-tracking/mutation/qg-mutation/<component>.log`.

## Classify Survivors

| Category | Action |
|----------|--------|
| **Real gap** — behavior change not caught | Write a boundary test to kill it |
| **Equivalent mutant** — no observable difference | Suppress it with the developer's tool, narrowly and with a reason, then rerun |

### Equivalent mutant examples (do NOT write tests for these)

- Removed a log statement (no observable effect)
- Changed dead code path
- Defensive null check when type guarantees non-null
- Arithmetic on unused intermediate variable

## Kill Real Survivors

For each real survivor:

1. **Read the mutation** — what operator changed? what line?
2. **Write ONE boundary test** targeting the exact edge:
   ```csharp
   // Survivor: `age >= 18` → `age > 18`
   [Fact]
   public void WhenDriverIsExactly18_ShouldBeEligible()
   {
       // ... test the boundary value age=18
   }
   ```
   Frontend example: for `age >= 18` mutated to `age > 18`, assert observable UI or
   state behavior at exactly `18`; do not assert the implementation expression.
3. **Re-run the same `/skraft-mutation` command** to confirm the kill.

## Accept Proven Equivalent Mutants

Use only the tool's source-level, single-construct suppression, with a reason: Stryker
`// Stryker disable once <Mutator>: <reason>`.
Never broaden the tool's config, exclude files, or lower its threshold to buy the score: the
developer owns that config, and you do not edit it to buy the score.

## Decision

| Survivors | Verdict |
|---------------|---------|
| None | ✅ Done |
| Only equivalent mutants, each narrowly suppressed with rationale; rerun green | ✅ Done |
| Score below the bar, or any real survivor you can kill | ❌ Kill it, rerun |

## Mutation Categories Reference

| Category | Examples |
|----------|----------|
| Arithmetic | `+` ↔ `-`, `*` ↔ `/` |
| Comparison | `>` ↔ `>=`, `<` ↔ `<=`, `==` ↔ `!=` |
| Boolean | `true` ↔ `false`, `&&` ↔ `||` |
| Conditional | negate conditions, remove `if` branch |
| Return value | `return true` → `return false` |
| LINQ | `.Any()` ↔ `.All()`, `.First()` ↔ `.Last()` |

DTO or ViewModel survivors still signal unasserted behavior.
