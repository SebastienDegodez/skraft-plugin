---
name: mutation-testing
description: Use when entering COMMIT & VERIFY phase, killing surviving mutants, verifying test quality via mutation score, or analyzing supported Stryker.NET or Node TAP StrykerJS reports after the test baseline is green
---

# Mutation Testing

Verify that tests **actually catch bugs** — not just execute code.

## Core Rule

A test that kills no mutant is noise. DELETE IT.

## When to Load

- Entering phase 4 (COMMIT & VERIFY) of the TDD cycle.
- Investigating a surviving mutant.
- Confirming a kill after writing a boundary test.

**Never run on a red baseline** — fix tests first.

## S7 — Deterministic Execution (Non-Negotiable)

Mutation testing MUST cross the matching `quality-gates-<tech>` adapter. Do not embed,
reconstruct, or improvise runner commands here. Load `skraft-quality-bar`, then use
`resolving-stack-commands` to select the adapter.

```
1. Confirm ordinary tests are green
2. Select full mode on `main`, or differential `--since <base-ref>` mode on PR; local diagnostic may add repeatable `--overlay <config>`
3. Adapter → validate durable configs, merge protected overlays, and run core gate
4. Parse adapter-owned JSON report → extract survivors
5. Decide: kill with a test, or suppress a proven equivalent narrowly
6. Adapter → rerun core until green
7. Repeat for boundary
```

## Node JavaScript / TAP

For installed StrykerJS core + TAP 9.6.1, load
[quality-gates-javascript](../quality-gates-javascript/SKILL.md). Its single runner
validates both durable configs, runs core then boundary, and captures fresh reports.
Core-only runs diagnose failures but never prove combined G6. Full reruns start
with core again; never reuse an earlier core receipt to unlock boundary.

Frontend, TypeScript and other runners remain unsupported. No coverage gate is
claimed. Do not improvise raw Stryker commands, install tooling, or analyze stale
reports as gate evidence. StrykerJS uses native `thresholds.break`; do not translate
.NET flags. This narrow adapter rejects source suppressions and ignored/error
mutants; equivalent-mutant suppression below applies only when adapter supports it.

`--since` selects changed files from the Git merge-base through `HEAD`; it is a
differential result, not a full-repository score. `--overlay` is repeatable and
diagnostic-only. Overlays cannot change thresholds, source scopes, reporters, or
report paths. CI evidence uses checked-in configuration without overlays.

## Classify Survivors

| Category | Action |
|----------|--------|
| **Real gap** — behavior change not caught | Write a boundary test to kill it |
| **Equivalent mutant** — no observable difference | Add narrow runner-supported source suppression with rationale, then rerun |

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
3. **Re-run the applicable adapter gate** to confirm the kill.

## Accept Proven Equivalent Mutants

Use only runner-supported, source-level, single-construct suppression. For Stryker.NET:

```csharp
// Stryker disable once Arithmetic: equivalent because normalized value is never observed
var normalized = value + 0;
```

Name only relevant mutator; use `all` only when every mutation in next syntax construct
is proven equivalent. Reason is mandatory. Never use global `ignore-mutations`, broad
file exclusions, threshold changes, or prose-only waivers. Rerun full applicable gate;
an ignored mutant remains visible in JSON evidence.

## Gate Decision

The adapter's exit code is the verdict — .NET uses `--break-at`, StrykerJS uses
`thresholds.break` plus fresh-report validation. `skraft-quality-bar` states the bar
for each scope. This skill decides only what a
survivor means:

| Survivors | Verdict |
|---------------|---------|
| None | ✅ Proceed to commit |
| Only equivalent mutants, each narrowly suppressed with rationale; rerun green | ✅ Proceed |
| Core below 100%, boundary below 80%, or any real core survivor | ❌ BLOCK — return to Step 4 |

## Mutation Categories Reference

| Category | Examples |
|----------|----------|
| Arithmetic | `+` ↔ `-`, `*` ↔ `/` |
| Comparison | `>` ↔ `>=`, `<` ↔ `<=`, `==` ↔ `!=` |
| Boolean | `true` ↔ `false`, `&&` ↔ `||` |
| Conditional | negate conditions, remove `if` branch |
| Return value | `return true` → `return false` |
| LINQ | `.Any()` ↔ `.All()`, `.First()` ↔ `.Last()` |

Scope and exclusions belong to durable adapter configuration. Everything developer
authored remains in scope unless deterministic adapter policy excludes it. DTO or
ViewModel survivor still signals unasserted behavior. Core runs first; boundary never
runs while core is red. Unsupported stack or missing adapter is failure, not permission
to invent commands.
