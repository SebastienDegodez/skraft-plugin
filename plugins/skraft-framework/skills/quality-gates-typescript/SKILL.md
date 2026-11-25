---
name: quality-gates-typescript
description: "Use when the repository holds a TypeScript project tested with Vitest — a React front end or a Node package with `vitest` in its `package.json` — and the software-engineer must produce falsifiable evidence for the quality gates. Every gate is recorded once, after the story's last work commit, in a log kept in a Git-ignored directory. Provides the cross-platform scripts (Node, no shell) that run Vitest, tsc and ESLint with its boundaries rules, and map their outputs onto the tech-agnostic schema. Coverage and mutation never run in a delivery: the project's CI runs them."
---

# Quality Gates — TypeScript Adapter (Vitest)

Binds the gates of `quality-gates-evidence-contract` to a TypeScript package tested with
Vitest. Load `skraft-quality-bar` first. Every gate below blocks; a
gate whose tool is missing is `status: "fail"` with the captured output, never
`not_applicable`. Plain JavaScript packages tested with `node --test` stay with
`quality-gates-javascript`.

## Prerequisites

- The package's dependencies are installed (`node_modules` beside its `package.json`); never
  install a tool during a gate run. Its devDependencies hold `vitest`, `typescript`, and `eslint`
  with `eslint-plugin-boundaries`.
  npm 10, the version Node 22 ships, cannot resolve Vitest 4.1's peer set (`TypeError … edgesOut`):
  install with npm 11, or set `legacy-peer-deps=true` in the project's `.npmrc`.
- Node 22 or later.

## Output paths

`<skill>` is this skill's folder, the one holding this SKILL.md; every script ships in
`<skill>/scripts/`, never in the consumer repository. `$EV` is
`.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/` — one per story, never
shared, ignored by Git (`.copilot-tracking/skraft-plans/*/evidence/` in `.gitignore`), never
committed — and `$LOG` is `$EV/qg-{story}.json`. `$EV` holds the log and the screenshots, nothing
else. Every script runs with `node` and no shell, so the same line works in bash and PowerShell.
`--root` is the Git repository root; `--package <dir>` names the package when it is not at the
root (a front end in `web/`).

## test.acceptance / test.unit / build.compile / build.lint — commands through `capture.mjs`

`capture.mjs` runs one command from the package directory without a shell, prints the last 40
lines of its output and records the gate(s) named by `--gate` in `$LOG`: `pass` on exit 0,
`fail` otherwise, the last output line as `summary`. It exits with the command's code.
`{bin:<package>}` runs that package's own command file with node, which also works on Windows.
No `.stdout`, `.exit` or hash file is written, and no agent ever types a status.

| Gate | Command |
|---|---|
| `test.acceptance` / `test.unit` | `node "<skill>/scripts/capture.mjs" --root . --log "$LOG" --gate test.acceptance,test.unit -- {bin:vitest} run` |
| `build.compile` | `node "<skill>/scripts/capture.mjs" --root . --log "$LOG" --gate build.compile -- {bin:typescript:tsc} --noEmit` |
| `build.lint` | `node "<skill>/scripts/capture.mjs" --root . --log "$LOG" --gate build.lint -- {bin:eslint} . --max-warnings 0` |

When the story's acceptance tests live apart, run them once more with `--gate test.acceptance`
and the narrowed Vitest line; the later run replaces the gate's verdict.

`build.lint` carries the architecture boundaries: the project's checked-in ESLint config sets the
`eslint-plugin-boundaries` rules (`boundaries/dependencies`, `boundaries/no-unknown-files`) as
errors — `clean-architecture-react` ships them — and ESLint itself enforces them in the
`build.lint` run. A config without those rules is a `build.lint` defect: add them in a work commit
before running the gates; a `build.lint` `pass` on a config that lacks them is not a pass.

## test.no-mocks-core — No test doubles in the core and the unit tests

The core is every production source of the package under a folder whose name ends with
`domain` or `application` (`src/todos/application`, `src/domain`), tests and `.d.ts` aside;
with none, `test.no-mocks-core` blocks.

```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --log "$LOG"
```

Scans the core sources and `tests/unit` (`--tests <dir>`, repeatable) for `vi.mock`,
`vi.fn`, `vi.spyOn` and the other Vitest or Jest doubles, MSW, `sinon`, `ts-mockito`,
`testdouble` and the `*-mock-extended` libraries. Unit tests use hand-written in-memory
gateways (`clean-architecture-testing`); MSW belongs to the gateway tests in
`tests/integration`. It prints one hit per line and records the gate: `pass` on exit 0, `fail`
otherwise.

## commit.convention and test.integrity — derived by qg-verify

Nothing to record: `qg-verify` reads every commit since the DELIVER base and checks its full
message, and guards every test file DISTILL's `test` commit holds — a later commit may only add
lines to it, unless its message records `PLAN_DEVIATION:`. No commit list, no cycle, no snapshot.

## evidence.screenshots — Frontend stories

A story whose commits touch a `@visual` scenario, `tests/e2e/`, a `package.json` declaring
`react` or a `playwright.config.*` records at least one screenshot taken by
`playwright-evidence`:
`node "<skill>/scripts/gate-log.mjs" --log "$LOG" --screenshot <png> [--screenshot <png> …]`
copies each PNG into `$EV/screenshots/` and records its sha256.

A gate that genuinely does not apply is recorded with its reason, never by hand:
`node "<skill>/scripts/gate-log.mjs" --log "$LOG" --not-applicable <gate> --rationale "<why>"`.

## Not run by this adapter

Coverage (`ci.coverage`) and mutation (`ci.mutation`) are not pipeline gates, and architecture
has no gate of its own: `build.lint` enforces it. Coverage at 100% of Domain and Application,
with no exclusion, and the mutation step run in the project's CI; the developer runs
`/skraft-mutation` by hand. Never record them in the log.

## Producer flow at the end of the story

1. Run `test.acceptance`/`test.unit`, `build.compile`, `build.lint`, `test.no-mocks-core` — each
   through `capture.mjs` or its script, after the story's last work commit. The scripts refuse a
   `$LOG` Git does not ignore: add `.copilot-tracking/skraft-plans/*/evidence/` to `.gitignore`
   in a work commit.
2. Record the screenshots of a frontend story with `gate-log.mjs`.
3. `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log "$LOG"` must print
   `"verdict": "pass"`; otherwise fix the code and run the gate again, never edit the log.

Nothing is committed: the log and the screenshots stay in `$EV`.
