---
name: mutation-testing
description: Use when entering COMMIT & VERIFY phase, killing surviving mutants, verifying test quality via mutation score, or analyzing Stryker reports after the test baseline is green
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

Mutation testing MUST be executed via terminal tool calls. Do NOT assert
results from prose. The flow is:

```
1. runInTerminal → dotnet stryker (with correct args)
2. Parse JSON output → extract survivors
3. Decide: kill (write test) or document (equivalent mutant)
4. Re-run scoped stryker → confirm kill
```

## Step 1: Run Stryker (via terminal)

### Detect project paths first

Before running, identify:
- `--project` : the production `.csproj` being mutated (Domain or Application)
- `-tp` : the test `.csproj` that exercises it

### During development (fast — changed code only)

```bash
dotnet stryker \
  --project <Production.csproj> \
  -tp <Tests.csproj> \
  --since:main \
  --break-at 100 \
  -r json -r cleartext
```

### Before merge (full business logic)

```bash
dotnet stryker \
  --project <Production.csproj> \
  -tp <Tests.csproj> \
  --mutate "**/*.cs" \
  --mutate "!**/*Marker.cs" \
  --mutate "!**/DependencyInjection.cs" \
  --mutate "!**/obj/**" \
  --break-at 100 \
  --threshold-high 90 --threshold-low 80 \
  -r json -r cleartext
```

### Tool availability check

```bash
dotnet stryker --version
# If fails: dotnet tool install -g dotnet-stryker
```

### Frontend (`npx stryker run`) — different flag syntax

⚠️ **`dotnet stryker` and `npx stryker run` do NOT share the same reporter
flag.** Do not copy `-r`/`--reporter` between stacks:

| Stack | Flag | Syntax |
|-------|------|--------|
| `dotnet stryker` (.NET) | `-r` / `--reporter` | repeatable, one value each: `-r json -r cleartext` |
| `npx stryker run` (JS/TS) | `--reporters` | single flag, comma-separated: `--reporters clear-text,json` |

```bash
npx stryker run --reporters clear-text,json --mutate "src/path/to/changed-file.ts"
```

The frontend JSON reporter always writes to the **same fixed path**
(`reports/mutation/mutation.json`), overwriting it on every run — unlike
`dotnet stryker`, which creates a fresh timestamped `StrykerOutput/<run>/`
directory each time. **Before parsing `reports/mutation/mutation.json`,
verify it was written by the run you just triggered** (e.g. compare its
mtime to the time the command started), otherwise a scoped run may be
analyzed against a stale, wider report from a previous full run:

```bash
date +%s > /tmp/run-start.txt
npx stryker run --reporters clear-text,json --mutate "src/path/to/changed-file.ts"
node -e '
  const fs = require("fs");
  const start = Number(fs.readFileSync("/tmp/run-start.txt", "utf8").trim());
  const mtime = fs.statSync("reports/mutation/mutation.json").mtimeMs / 1000;
  if (mtime < start) { console.error("STALE REPORT — do not parse"); process.exit(1); }
'
```

For scoped/fast runs, prefer parsing the `clear-text` reporter's stdout
output directly instead of the JSON file — it always reflects the current
run and avoids the staleness risk entirely.

## Step 2: Parse Results (via terminal)

Extract survivors from the JSON report:

```bash
jq '[.files | to_entries[] | {file: .key, survivors: [.value.mutants[] | select(.status == "Survived") | {mutator: .mutatorName, line: .location.start.line, replacement: .replacement}]}] | map(select(.survivors | length > 0))' \
  StrykerOutput/$(ls -t StrykerOutput | head -1)/reports/mutation-report.json
```

If `jq` is unavailable, or you are running a scoped frontend run, use the
`cleartext`/`clear-text` reporter output directly.

## Step 3: Classify Survivors

| Category | Action |
|----------|--------|
| **Real gap** — behavior change not caught | Write a boundary test to kill it |
| **Equivalent mutant** — no observable difference | Document in code comment + accept |

### Equivalent mutant examples (do NOT write tests for these)

- Removed a log statement (no observable effect)
- Changed dead code path
- Defensive null check when type guarantees non-null
- Arithmetic on unused intermediate variable

## Step 4: Kill Real Survivors

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
3. **Re-run scoped Stryker** to confirm the kill:
   ```bash
   dotnet stryker \
     --project <Production.csproj> \
     -tp <Tests.csproj> \
     --mutate "**/<FileWithSurvivor>.cs" \
     --break-at 100 \
     -r cleartext
   ```

## Step 5: Gate Decision

| Mutation score | Verdict |
|---------------|---------|
| 100% on business logic | ✅ Proceed to commit |
| < 100% with only equivalent mutants documented | ✅ Proceed |
| < 100% with real survivors | ❌ BLOCK — return to Step 4 |

## Mutation Categories Reference

| Category | Examples |
|----------|----------|
| Arithmetic | `+` ↔ `-`, `*` ↔ `/` |
| Comparison | `>` ↔ `>=`, `<` ↔ `<=`, `==` ↔ `!=` |
| Boolean | `true` ↔ `false`, `&&` ↔ `||` |
| Conditional | negate conditions, remove `if` branch |
| Return value | `return true` → `return false` |
| LINQ | `.Any()` ↔ `.All()`, `.First()` ↔ `.Last()` |

## Scope Exclusions

Never mutate:
- DTOs, ViewModels, passive data structures
- Infrastructure adapters (tested via integration tests)
- `DependencyInjection.cs`, `Program.cs`, config
- Marker interfaces, generated code
