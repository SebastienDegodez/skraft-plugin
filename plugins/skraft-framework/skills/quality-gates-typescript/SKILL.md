---
name: quality-gates-typescript
description: Use in a TypeScript or React component tested with Vitest (`vitest` in its `package.json`) to pick or check the gate command lines of its skraft-config.json entry, to scaffold the StrykerJS mutation configs once, or to read and kill the surviving mutants the engine's mutation gate reports. Provides the bundled architecture, coverage, no-mocks and mutation scripts (Node, no shell) for Vitest, tsc, ESLint boundaries, v8 coverage and StrykerJS with the Vitest runner. Plain JavaScript tested with `node --test` belongs to quality-gates-javascript.
---

# Quality Gates — TypeScript (Vitest)

In a skraft pipeline step, the engine runs each gate from the component's `commands` in
`skraft-config.json`, from the component root, and keeps the evidence: never run a gate to
produce evidence, never write an evidence file, never launch a mutation run. Outside a
pipeline, when the developer asks for a gate, run its command line below from the component
root and report its exit code and verdict line. Thresholds come from `skraft-quality-bar`
and live in the scripts; no caller argument changes them.

`<skill>` is the absolute path of the folder holding this SKILL.md; the scripts are in the
scripts/ folder next to this SKILL.md, never in the consumer repository. Every script runs with
`node` and no shell, so one line works in bash and PowerShell.

## Prerequisites

- `--root` is the Git repository root, written from the component root (`.` when the
  component is the repository, `..` for `web/`); `--package <dir>` names the package from
  the repository root when it is not at the root (`--package web`).
- The package's dependencies are installed; never install a tool during a gate run. Its
  devDependencies hold `vitest`, `typescript`, `eslint` with `eslint-plugin-boundaries`,
  `@vitest/coverage-v8` of the same major as `vitest`, and `@stryker-mutator/core` with
  `@stryker-mutator/vitest-runner`, both 10.x and the same version.
- StrykerJS 10's Vitest runner works with **Vitest 4.x** only: under Vitest 5 every mutant
  reads as survived, so the mutation gate refuses any other Vitest major. npm before 11.6 cannot
  resolve Vitest 4.1's peer set (`TypeError … edgesOut`): install with npm 11.6 or later, or
  set `legacy-peer-deps=true` in the project's `.npmrc`.
- Node 22.5 or later.

## Gate command lines

| Gate | Command line in `skraft-config.json` |
|---|---|
| build | `npx tsc --noEmit` |
| lint | `npx eslint . --max-warnings 0` |
| test | `npx vitest run` |
| architecture | `node "<skill>/scripts/architecture-gate.mjs" --root . --evidence .copilot-tracking/skraft-gates/architecture` |
| coverage | `node "<skill>/scripts/coverage-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/coverage` |
| mutation | `node "<skill>/scripts/mutation-gate.mjs" --root . --scope core --config stryker.core.json --evidence .copilot-tracking/skraft-gates/mutation --since {baseSha}` |

`--evidence` is the folder where the script keeps its own report files, relative to `--root`.
`{baseSha}` is replaced by the engine. Outside a pipeline, put the commit `git merge-base HEAD main` prints in its place.

- `architecture-gate.mjs` fails unless `boundaries/dependencies` and
  `boundaries/no-unknown-files` are errors in the resolved ESLint config, then lints `src`
  (`--src <dir>` otherwise) with no warning allowed. `clean-architecture-react` ships the rules.
- `no-mocks-in-core.mjs` (`--tests <dir>` repeatable) scans the core config's sources and
  `tests/unit` for `vi.mock`, `vi.fn`, `vi.spyOn` and the other Vitest or Jest doubles, MSW,
  `sinon`, `ts-mockito`, `testdouble` and the `*-mock-extended` libraries, one hit per line.
  Unit tests use hand-written in-memory gateways (`clean-architecture-testing`); MSW belongs to
  the gateway tests in `tests/integration`.
- `coverage-core.mjs` runs the suite under Vitest's v8 provider with the core config's
  patterns as scope and fails below 100%, on a failing test, on a core file never measured, or
  on a `v8 ignore` / `c8 ignore` / `istanbul ignore` comment in the core. Type-only files are
  listed apart. `--threshold` is refused.
- `mutation-gate.mjs` checks the config is committed, runs Vitest unmutated first (a red
  baseline blocks), runs Stryker on the scope files changed since `--since` (untracked
  included) with a JSON report and no incremental reuse, restores any source a crashed run left
  mutated, and judges 100 (core) or 80 (boundary) over killed and timed-out mutants. Survivors,
  uncovered mutants, never-run mutants and compile or runtime errors fail it. A scope the story
  did not change passes with `No … source changed`. `--scope boundary --config
  stryker.boundary.json` runs only after core passed in the same `--evidence` folder. Exit 0
  pass, 1 gate failed, 2 invalid input or tooling.

## Configure mutation once

Scaffold both files in the package directory once, review them and commit them:

```bash
node "<skill>/scripts/configure-mutation.mjs" --root .
```

It writes `stryker.core.json` (`src/*/application`, and `domain` where a backend has one) and
`stryker.boundary.json` (`infrastructure`, `ui`, `api`, `src/app`, `src/shared`) from the
folders under `src/`, feature-first or layer-first. A non-standard layout passes explicit
patterns: `--core "src/core/**/*.ts" --boundary "src/web/**/*.tsx"` (repeatable). A differing
existing file is kept unless `--force`, after reviewing why it should change. The scripts accept
only `testRunner: "vitest"`, positive `mutate` patterns, `vitest.{configFile,dir,related}`,
`coverageAnalysis`, `timeoutMS` and `concurrency`; never add exclusions, ignorers or thresholds
to buy a score.

## Read the survivors

The mutation gate lists each mutant to handle as `survived: <file>:<line> <mutator>` or
`no coverage: <file>:<line> <mutator>` before its verdict line.

| Survivor | Action |
|---|---|
| Real gap: a behavior change no test catches | Write ONE test at the exact edge, through the use case or the rendered UI, asserting the observable outcome, never the implementation expression |
| `no coverage` | Write the missing behavior test |
| Equivalent: no observable difference (removed log call, dead path, a label only displayed) | Disable that one line with a reason; never write a test for it |

```ts
// Survivor: age >= 18 → age > 18
it('should accept a driver aged exactly 18', () => { /* age = 18 */ })
```

```ts
// Stryker disable next-line StringLiteral: the label is only displayed
```

A disable comment without a reason, for a whole file or a block blocks the run; disabled
mutants are counted in the verdict line. Never add a negative `mutate` pattern, an ignorer or a
threshold. A test that kills no mutant is noise: delete it.
