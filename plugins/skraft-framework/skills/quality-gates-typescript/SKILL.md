---
name: quality-gates-typescript
description: Use when the repository holds a TypeScript project tested with Vitest — a React front end or a Node package with `vitest` in its `package.json` — and the software-engineer must produce falsifiable evidence for the quality gates, or run the StrykerJS mutation gates after a green baseline. Provides the cross-platform scripts (Node, no shell) that run Vitest, tsc, ESLint and its boundaries rules, v8 coverage and StrykerJS with the Vitest runner, and map their outputs onto the tech-agnostic schema. The G10 RED capture is taken at RED, before any production code.
---

# Quality Gates — TypeScript Adapter (Vitest)

Binds the gates of `quality-gates-evidence-contract` to a TypeScript package tested with
Vitest. Load [quality bar](../skraft-quality-bar/SKILL.md) first. Every gate below blocks; a
gate whose tool is missing is `status: "fail"` with the captured output, never
`not_applicable`. Plain JavaScript packages tested with `node --test` stay with
`quality-gates-javascript`.

## Prerequisites

- The package's dependencies are installed (`node_modules` beside its `package.json`); never
  install a tool during a gate run. Its devDependencies hold `vitest`, `typescript`, `eslint`
  with `eslint-plugin-boundaries`, `@vitest/coverage-v8` of the same major as `vitest`, and
  `@stryker-mutator/core` with `@stryker-mutator/vitest-runner`, both 10.x and the same version.
- Node 22 or later.

`$Q` is `$SKRAFT_PLUGIN_ROOT/skills/quality-gates-typescript/scripts`, or the `scripts/` folder
beside this file when that variable is empty. `$EV` is
`.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/`; log references drop
the `.copilot-tracking/skraft-plans/{projectSlug}/` prefix. Every script runs with `node` and
no shell, so the same line works in bash and PowerShell. `--root` is the Git repository root;
`--package <dir>` names the package when it is not at the root (a front end in `web/`).

## G1 / G2 / G3 / G4 — commands through `capture.mjs`

`capture.mjs` runs one command from the package directory without a shell and writes
`<name>.stdout` (stdout and stderr), `<name>.exit` and `<name>.stdout.sha256`.
`{bin:<package>}` runs that package's own command file with node, which also works on Windows.

| Gate | Command |
|---|---|
| G1 / G2 | `node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-tests -- {bin:vitest} run` |
| G3 | `node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-build -- {bin:typescript:tsc} --noEmit` |
| G4 | `node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-lint -- {bin:eslint} . --max-warnings 0` |

G1 narrows the Vitest line to the story's acceptance tests when they live apart. Read
`tests_total` / `tests_passed` / `tests_failed` from Vitest's `Tests` summary line.

## G5 — Architecture (ESLint boundaries)

```bash
node "$Q/architecture-gate.mjs" --root . --evidence "$EV"
```

Asks ESLint for the resolved config of a source file and fails unless
`boundaries/dependencies` and `boundaries/no-unknown-files` are errors, then lints `src`
(`--src <dir>` otherwise) with no warning allowed. A project without those rules records G5
`fail`: `clean-architecture-react` ships them. Outputs `qg-arch.*`.

## G6 — Mutation score (StrykerJS, Vitest runner)

Mutation configuration is repository infrastructure. Scaffold it once, review it and commit
both files in the package directory:

```bash
node "$Q/configure-mutation.mjs" --root .
```

It writes `stryker.core.json` (`src/*/application`, and `domain` where a backend has one) and
`stryker.boundary.json` (`infrastructure`, `ui`, `api`, `src/app`, `src/shared`) from the
folders under `src/`, feature-first or layer-first. A non-standard layout passes explicit
patterns: `--core 'src/core/**/*.ts' --boundary 'src/web/**/*.tsx'` (repeatable). A differing
existing file is kept unless `--force`, after reviewing why it should change.

The scripts accept only `testRunner: "vitest"`, positive `mutate` patterns,
`vitest.{configFile,dir,related}`, `coverageAnalysis`, `timeoutMS` and `concurrency`. Never add
exclusions, ignorers or thresholds to buy a score.

Run core, then boundary, once, after the story's last work commit:

```bash
node "$Q/mutation-gate.mjs" --root . --scope core --config stryker.core.json --evidence "$EV" --since "$BASE"
node "$Q/mutation-gate.mjs" --root . --scope boundary --config stryker.boundary.json --evidence "$EV" --since "$BASE"
```

`BASE` is `phaseHistory.DELIVER.baseSha` from `state.mjs get --field phaseHistory`; drop
`--since` only when no base is recorded. `--since` mutates every scope file changed from the
merge-base through the working tree, untracked files included; a scope the story did not
change passes with `No … source changed`. Boundary refuses to start until
`$EV/qg-mutation.exit` holds `0`.

Each run checks that the config is committed, runs Vitest unmutated first (a red baseline
blocks: every mutant would look killed), then Stryker on the selected files with a JSON
report, no incremental reuse and no threshold of its own. It restores any source a crashed run
left mutated and fails the gate. The thresholds live in the script (100 core, 80 boundary). The
score counts killed and timed-out mutants over every tested one; survivors and mutants no test
covers fail it, and so does a mutant that never ran or ended in a compile or runtime error.
Exit 0 pass, 1 gate failed, 2 invalid input or tooling.

Outputs: `qg-mutation.stdout` / `.exit` / `.stdout.sha256` (core) and
`qg-mutation-boundary.*`, each beside a folder holding the effective config, the baseline and
Stryker output, `mutation-report.json` and `manifest.json` (Node, Stryker, runner and Vitest
versions, config hash, source and test hashes, merge-base). Populate two G6 entries,
`"scope": "core"` and `"scope": "boundary"`, from those files. Survivors are listed as
`survived: <file>:<line> <mutator>` or `no coverage: …`; `mutation-testing` decides what each
one means.

An equivalent mutant is disabled only on the line above it, with a reason:
`// Stryker disable next-line StringLiteral: the label is only displayed`. A disable comment
without a reason, for a whole file or a block blocks the run; disabled mutants are counted in
the verdict line.

## G7 — No test doubles in the core and the unit tests

```bash
node "$Q/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

Scans the core config's sources and `tests/unit` (`--tests <dir>`, repeatable) for `vi.mock`,
`vi.fn`, `vi.spyOn` and the other Vitest or Jest doubles, MSW, `sinon`, `ts-mockito`,
`testdouble` and the `*-mock-extended` libraries. Unit tests use hand-written in-memory
gateways (`clean-architecture-testing`); MSW belongs to the gateway tests in
`tests/integration`. `qg-mocks.stdout` lists one hit per line and is empty on pass.

## G11 — Line coverage of the core

```bash
node "$Q/coverage-core.mjs" --root . --evidence "$EV"
```

Runs the whole suite under Vitest's v8 provider with the core config's patterns as the
coverage scope and exits non-zero below 100%, on a failing test, on a core file never
measured, or on a `v8 ignore` / `c8 ignore` / `istanbul ignore` comment in the core. Files that
only declare types have nothing to run and are listed apart. `--threshold` is refused. Outputs
`qg-coverage.*`.

## G8 / G9 / G10

As in every adapter: G8 from the Git tree; G9 from `git show HEAD:<test file>` snapshots
taken at RED and at GREEN; G10 at RED, before the implementation, with the G1 line narrowed
to the cycle's test and `--name qg-red-{cycle}`:

```bash
node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-red-1 -- {bin:vitest} run tests/unit/todos/application/CompleteTodo.test.ts
```

The recorded exit code MUST be non-zero. The capture cannot be reconstructed after GREEN.

## Producer flow at the end of the story

1. Run G1/G2, G3, G4, G5, G6 core then boundary, G7, G11 — each through its script.
2. Dump the RED and GREEN snapshots per cycle; check every G10 capture exists with a non-zero exit.
3. `repo_root_rev = git rev-parse HEAD`; build `commits_covered[]` from the DELIVER base.
4. Assemble `$EV/qg-{story}.json` (contract v4) with `"tech_adapter": "quality-gates-typescript"`, commit `$EV` alone, then run `qg-verify`.
