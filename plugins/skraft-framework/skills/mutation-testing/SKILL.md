---
name: mutation-testing
description: Use when entering COMMIT & VERIFY phase, running the G6 mutation gate on the developer's declared mutation command, or killing the surviving mutants it lists after the test baseline is green. Mutation testing is the developer's responsibility; SKRAFT runs the command they declared, holds the scores it writes (core and boundary, or global) to the bar and lists its survivors.
---

# Mutation Testing

Verify that tests **actually catch bugs** — not just execute code.

## Core Rule

A test that kills no mutant is noise. DELETE IT.

## The developer owns mutation

Mutation testing must be done on every story. Choosing the tool, configuring it and declaring
it are the developer's responsibility. SKRAFT ships no mutation tool, config or scaffold. You
never install a mutation tool, write its config, write `commands.mutation` or produce a report
yourself to make G6 run. When G6 does not run, tell the developer it is theirs to declare.

The developer declares one command per component in `skraft-config.json` at the repository
root, the same shape as SKRAFT v2:

```json
{
  "components": [
    { "name": "api", "root": "api", "stack": "dotnet", "commands": { "mutation": "node scripts/mutation.mjs --since {baseSha}" } },
    { "name": "web", "root": "web", "stack": "typescript", "commands": { "mutation": "npm run mutation" } }
  ]
}
```

- `root`: the folder the command runs in, inside the repository (`.` for the root).
- `commands.mutation`: any shell command. `{baseSha}` becomes the base the gate gets with
  `--since`.
- The command runs the developer's tool, computes the scores and writes them, with the
  surviving mutants, as JSON to the file named by the `SKRAFT_MUTATION_RESULT` environment
  variable:

```json
{
  "scopes": [
    { "name": "core", "score": 97.6, "survivors": ["src/Domain/Order.cs:12 Equality -> age > 18"] },
    { "name": "boundary", "score": 85.7, "survivors": [] }
  ]
}
```

  A Clean Architecture component writes `core` (Domain, Application) and `boundary` (API,
  Infrastructure, UI); a single project writes one `global` scope. A score is a percentage,
  0 to 100. Each survivor is one `file:line detail` line, the file relative to the component
  root, the detail free text (mutator, replacement). `[]` means none survived; a 100% scope
  lists none. `survivors` is optional: a team may leave it out, and the gate then prints
  `(survivors not reported)` for that scope.

## Run the gate (G6)

```bash
node "<skill>/scripts/mutation-gate/cli/mutation-gate.mjs" --root . --evidence "$EV" --since "$BASE" --pipeline
```

`<skill>` is this skill's folder. `BASE` is `phaseHistory.DELIVER.baseSha`; drop `--since` only
when no base is recorded and no command uses `{baseSha}`. Run it once, after the story's last
work commit, on a green suite; never inside a TDD cycle.

`--pipeline` marks DELIVER's run. When `skraft-config.json` sets `mutation.pipeline` to `false`,
the team runs mutation outside the pipeline with `/skraft-mutation`: the gate then runs nothing
and reuses the developer's last run when it judged HEAD on a clean working copy, or exits 3.
`/skraft-init mutation` sets the mode and the commands; only the developer runs either skill.

For each declared component the gate runs the command in `root` with `SKRAFT_MUTATION_RESULT`
pointing into the evidence folder, then reads what it wrote. Every scope of every component
must reach `skraft-quality-bar`'s bar; no argument changes it.

| Exit | Meaning | G6 entry |
| --- | --- | --- |
| 0 | every scope meets the bar, every command exited 0 | `pass` |
| 1 | a scope below the bar, a command failed, no result or a malformed one (a survivor line included), or a tracked file was left modified | `fail` |
| 2 | blocked: invalid `skraft-config.json` entry, or `{baseSha}` without `--since` | fix the input, rerun |
| 3 | no component declares `commands.mutation`, or mutation runs outside the pipeline and no developer run covers HEAD | `not_run`, rationale from the stdout |

Outputs: `qg-mutation.stdout` / `.exit` / `.stdout.sha256`, and `qg-mutation/` holding each
command's log (`<component>.log`), its result (`<component>.result.json`) and
`manifest.json`. Every reported survivor is listed in `qg-mutation.stdout` as
`survived: <file>:<line> <detail> (<component> <scope>)`, the file relative to the repository:
that list is what you kill. When the team reports no survivors, read the tool's output in
`<component>.log`.

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
3. **Re-run the gate** to confirm the kill.

## Accept Proven Equivalent Mutants

Use only the tool's source-level, single-construct suppression, with a reason: Stryker
`// Stryker disable once <Mutator>: <reason>`, cosmic-ray `# pragma: no mutate -- <reason>`.
Never broaden the tool's config, exclude files, or lower its threshold to buy the score: the
developer owns that config, and you do not edit it to pass G6.

## Gate Decision

The gate's exit code is the verdict. This skill decides only what a survivor means:

| Survivors | Verdict |
|---------------|---------|
| None | ✅ Proceed to commit |
| Only equivalent mutants, each narrowly suppressed with rationale; rerun green | ✅ Proceed |
| Score below the bar, or any real survivor you can kill | ❌ BLOCK — kill it, rerun |
| Exit 3 (no command declared) | G6 `not_run`; tell the developer; never block on it, never record `pass` |

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
