---
name: quality-gates-javascript
description: Use in a plain JavaScript/Node.js component tested with `node --test` to pick or check the gate command lines of its skraft-config.json entry from its checked-in package scripts, to write its two StrykerJS 9.6.1 TAP mutation configs, or to read and kill the surviving mutants the engine's mutation gate reports. Not for TypeScript or Vitest packages (quality-gates-typescript), coverage enforcement, or other mutation runners.
---

# Quality Gates — JavaScript (node --test, StrykerJS TAP)

In a skraft pipeline step, the engine runs each gate from the component's `commands` in
`skraft-config.json`, from the component root, and keeps the evidence: never run a gate to
produce evidence, never write an evidence file, never launch a mutation run. Outside a
pipeline, when the developer asks for a gate, run its command line below from the component
root and report its exit code and verdict line. Thresholds come from `skraft-quality-bar`;
the configs must carry them and the runner refuses any other value.

`<skill>` is the absolute path of the folder holding this SKILL.md; the scripts are in the
scripts/ folder next to this SKILL.md, never in the consumer repository.

## Gate command lines

| Gate | Command line in `skraft-config.json` |
|---|---|
| test, build, lint | the package's own `test`, `build`, `typecheck` or `lint` script (`npm run lint`), only when it exists; an absent script is no gate, never a pass |
| test (no script) | `node --test <explicit test paths>` |
| mutation | `node "<skill>/scripts/run-gates.mjs" --root . --package <package-dir> --core <core-config> --boundary <boundary-config> --evidence .copilot-tracking/skraft-gates/mutation --since {baseSha}` |

- `{baseSha}` is replaced by the engine. Outside a pipeline, put the commit
  `git merge-base HEAD main` prints in its place.
- Never use `npx` or install packages for a gate. `node --check <source>` checks syntax only;
  it is not compilation or architecture validation.
- Line coverage is **not implemented** for this stack: leave the `coverage` command out and
  report it as a gap, never as a pass.
- `run-gates.mjs` resolves paths from `--root`, runs core then boundary in one invocation (core
  failure stops it), mutates only the scope files changed since `--since` (staged, unstaged and
  untracked included), and prints one JSON verdict. Exit 0 full pass, 1 failed child, report,
  score or source changed during the run, 2 invalid input, unsupported tooling or config.
  `--core-only` is diagnostic (`status: core-only`, `combinedPass: false`) and never a gate
  line. `--overlay <json>` is diagnostic only and cannot change `mutate`, test selection,
  thresholds, reporters or report paths; the gate line carries none.

## Write the mutation configs once

The component owns two durable, checked-in `.json` or `.mjs` Stryker configs, core and
boundary; nothing scaffolds them.

- Explicit positive root-relative `mutate` patterns and `tap.testFiles`; every pattern
  resolves; the two scopes never overlap. Source extensions `.js`, `.mjs`, `.cjs`; every scoped
  file yields at least one mutant.
- `testRunner: 'tap'`, a `json` reporter, and `thresholds` `high`, `low` and `break` all equal
  to the quality bar's value for that scope.
- Allowed tuning: `coverageAnalysis`, positive `concurrency`, `timeoutMS`, `timeoutFactor`,
  `dryRunTimeoutMinutes`, `maxTestRunnerReuse`, boolean `disableBail`, `logLevel`, local
  `clear-text`/`progress` reporters. TAP accepts `testFiles`, boolean `forceBail`, and
  `nodeArgs` holding only `--test-reporter=tap` / `--test-reporter-destination=stdout`.
- Refused: other options, negative or range patterns, global exclusions, source suppression
  directives, incremental reuse, custom plugins or checkers, build commands, test-name filters.
- The package declares and has installed `@stryker-mutator/core` and
  `@stryker-mutator/tap-runner` 9.6.1; Node 20 or later.

## Read the survivors

Each scope's native report is the `*.report.json` in its run folder under `--evidence`; the
JSON verdict names the folder. `files.<path>.mutants[]` with `status` `Survived` or
`NoCoverage` are the mutants to handle; `location.start.line`, `mutatorName` and
`replacement` say what changed.

| Survivor | Action |
|---|---|
| Real gap: a behavior change no test catches | Write ONE test at the exact edge, asserting the observable outcome |
| `NoCoverage` | Write the missing behavior test |
| Equivalent | This runner rejects source suppressions: rewrite the construct so the mutant disappears, or report it to the developer with the reason |

A test that kills no mutant is noise: delete it.
