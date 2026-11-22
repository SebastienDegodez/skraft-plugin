---
name: quality-gates-typescript
description: Use in a TypeScript or React component tested with Vitest (`vitest` in its `package.json`) to pick or check the gate command lines of its skraft-config.json entry, or to read and kill the surviving mutants of the developer's own mutation run. Provides the bundled architecture, coverage and no-mocks scripts (Node, no shell) for Vitest, tsc, ESLint boundaries and v8 coverage. Plain JavaScript tested with `node --test` belongs to quality-gates-javascript.
---

# Quality Gates — TypeScript (Vitest)

In a DELIVER attempt, run each gate of the component through `skraft_repl` with
`gate(name, command, { cwd: <the component root> })`, the command from your brief, else from the
component's `commands` in `skraft-config.json`: the engine reads the traced run as the evidence.
Never write an evidence file by hand, never launch a mutation run. Outside a
pipeline, when the developer asks for a gate, run its command line below from the component
root and report its exit code and verdict line. Thresholds come from `skraft-quality-bar`
and live in the scripts; no caller argument changes them.

Mutation testing is the developer's: skraft runs no mutation tool and ships no mutation
script or config. The developer picks the tool (StrykerJS), writes its config and runs it
apart from the pipeline.

`<skill>` is the absolute path of the folder holding this SKILL.md; the scripts are in the
scripts/ folder next to this SKILL.md, never in the consumer repository. Every script runs with
`node` and no shell, so one line works in bash and PowerShell.

## Prerequisites

- `--root` is the Git repository root, written from the component root (`.` when the
  component is the repository, `..` for `web/`); `--package <dir>` names the package from
  the repository root when it is not at the root (`--package web`).
- The package's dependencies are installed; never install a tool during a gate run. Its
  devDependencies hold `vitest`, `typescript`, `eslint` with `eslint-plugin-boundaries`,
  and `@vitest/coverage-v8` of the same major as `vitest`.
- Node 22.5 or later.

## Gate command lines

| Gate | Command line in `skraft-config.json` |
|---|---|
| build | `npx tsc --noEmit` |
| lint | `npx eslint . --max-warnings 0` |
| test | `npx vitest run` |
| architecture | `node "<skill>/scripts/architecture-gate.mjs" --root . --evidence .copilot-tracking/skraft-gates/architecture` |
| coverage | `node "<skill>/scripts/coverage-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/coverage` |

`--evidence` is the folder where the script keeps its own report files, relative to `--root`.

The core is every production source under a folder whose last word, cut on `.`, `-` and `_`,
is `domain` or `application` (`src/todos/application`, `src/billing-domain`), test folders
aside; with none, the coverage and no-mocks scripts block.

- `architecture-gate.mjs` fails unless `boundaries/dependencies` and
  `boundaries/no-unknown-files` are errors in the resolved ESLint config, then lints `src`
  (`--src <dir>` otherwise) with no warning allowed. `clean-architecture-typescript` ships the rules
  for a back end, `clean-architecture-react` for a front end.
- `no-mocks-in-core.mjs` (`--tests <dir>` repeatable) scans the core sources and
  `tests/unit` for `vi.mock`, `vi.fn`, `vi.spyOn` and the other Vitest or Jest doubles, MSW,
  `sinon`, `ts-mockito`, `testdouble` and the `*-mock-extended` libraries, one hit per line.
  Unit tests use hand-written in-memory gateways (`clean-architecture-testing`); MSW belongs to
  the gateway tests in `tests/integration`.
- `coverage-core.mjs` runs the suite under Vitest's v8 provider with the core folders as
  scope and fails below 100%, on a failing test, on a core file never measured, or
  on a `v8 ignore` / `c8 ignore` / `istanbul ignore` comment in the core. Type-only files are
  listed apart. `--threshold` is refused.

## Read the survivors

When the developer hands over the survivors of their own mutation run, each one as a file, a
line, a mutator and whether a test covers it:

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

A disable comment names one line and carries its reason, never a whole file or a block. Never
add a negative `mutate` pattern, an ignorer or a lower threshold to buy a score. A test that kills no mutant is noise: delete it.
