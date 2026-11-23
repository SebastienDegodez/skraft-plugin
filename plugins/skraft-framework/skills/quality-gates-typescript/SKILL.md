---
name: quality-gates-typescript
description: Use when the repository holds a TypeScript project tested with Vitest — a React front end or a Node package with `vitest` in its `package.json` — and the software-engineer must produce falsifiable evidence for the quality gates. Provides the cross-platform scripts (Node, no shell) that run Vitest, tsc, ESLint and its boundaries rules and v8 coverage, and map their outputs onto the tech-agnostic schema.
---

# Quality Gates — TypeScript Adapter (Vitest)

Binds the gates of `quality-gates-evidence-contract` to a TypeScript package tested with
Vitest. Load `skraft-quality-bar` first. Every gate below blocks; a
gate whose tool is missing is `status: "fail"` with the captured output, never
`not_applicable`. Plain JavaScript packages tested with `node --test` stay with
`quality-gates-javascript`.

## Prerequisites

- The package's dependencies are installed (`node_modules` beside its `package.json`); never
  install a tool during a gate run. Its devDependencies hold `vitest`, `typescript`, `eslint`
  with `eslint-plugin-boundaries`, and `@vitest/coverage-v8` of the same major as `vitest`.
  npm 10, the version Node 22 ships, cannot resolve Vitest 4.1's peer set (`TypeError … edgesOut`):
  install with npm 11, or set `legacy-peer-deps=true` in the project's `.npmrc`.
- Node 22 or later.

`<skill>` is this skill's folder, the one holding this SKILL.md; every script ships in
`<skill>/scripts/`, never in the consumer repository. `$EV` is
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
| G1 / G2 | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-tests -- {bin:vitest} run` |
| G3 | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-build -- {bin:typescript:tsc} --noEmit` |
| G4 | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-lint -- {bin:eslint} . --max-warnings 0` |

G1 narrows the Vitest line to the story's acceptance tests when they live apart. Read
`tests_total` / `tests_passed` / `tests_failed` from Vitest's `Tests` summary line.

## G5 — Architecture (ESLint boundaries)

```bash
node "<skill>/scripts/architecture-gate.mjs" --root . --evidence "$EV"
```

Asks ESLint for the resolved config of a source file and fails unless
`boundaries/dependencies` and `boundaries/no-unknown-files` are errors, then lints `src`
(`--src <dir>` otherwise) with no warning allowed. A project without those rules records G5
`fail`: `clean-architecture-react` ships them. Outputs `qg-arch.*`.

## G6 — Mutation score

Never run in a delivery. This adapter runs no mutation tool or gate and ships no mutation
config: record G6 `not_run` with the rationale `G6 not run: mutation testing runs outside the
pipeline; the developer runs /skraft-mutation.`, never `pass`, and tell the developer.

## G7 — No test doubles in the core and the unit tests

The core is every production source of the package under a folder whose name ends with
`domain` or `application` (`src/todos/application`, `src/domain`), tests and `.d.ts` aside;
with none, G7 and G11 block.


```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

Scans the core sources and `tests/unit` (`--tests <dir>`, repeatable) for `vi.mock`,
`vi.fn`, `vi.spyOn` and the other Vitest or Jest doubles, MSW, `sinon`, `ts-mockito`,
`testdouble` and the `*-mock-extended` libraries. Unit tests use hand-written in-memory
gateways (`clean-architecture-testing`); MSW belongs to the gateway tests in
`tests/integration`. `qg-mocks.stdout` lists one hit per line and is empty on pass.

## G11 — Line coverage of the core

```bash
node "<skill>/scripts/coverage-core.mjs" --root . --evidence "$EV"
```

Runs the whole suite under Vitest's v8 provider with the core folders as the coverage
scope and exits non-zero below 100%, on a failing test, on a core file never
measured, or on a `v8 ignore` / `c8 ignore` / `istanbul ignore` comment in the core. Files that
only declare types have nothing to run and are listed apart. `--threshold` is refused. Outputs
`qg-coverage.*`.

## G8 / G9

As in every adapter: G8 from the Git tree; G9 from `git show <commit>:<test file>` snapshots of
each scenario's acceptance test file at its `test` commit and at its green commit. No RED run is
captured: the `test` commit is the RED.

## Producer flow at the end of the story

1. Run G1/G2, G3, G4, G5, G7, G11 — each through its script.
2. Dump the RED and GREEN snapshots per scenario.
3. `repo_root_rev = git rev-parse HEAD`; build `commits_covered[]` from the DELIVER base.
4. Assemble `$EV/qg-{story}.json` (contract v6) with `"tech_adapter": "quality-gates-typescript"`, commit `$EV` alone, then run `qg-verify`.
