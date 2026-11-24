---
name: quality-gates-typescript
description: "Use when the repository holds a TypeScript project tested with Vitest — a React front end or a Node package with `vitest` in its `package.json` — and the software-engineer must produce falsifiable evidence for the quality gates. Every gate is captured once, after the story's last work commit, into a Git-ignored directory. Provides the cross-platform scripts (Node, no shell) that run Vitest, tsc and ESLint with its boundaries rules, and map their outputs onto the tech-agnostic schema. Coverage and mutation never run in a delivery: the project's CI runs them."
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
committed. Log references drop the `.copilot-tracking/skraft-plans/{projectSlug}/` prefix:
`evidence/{date}/{story}/qg-tests.stdout`. Every script runs with `node` and no shell, so the
same line works in bash and PowerShell. `--root` is the Git repository root; `--package <dir>`
names the package when it is not at the root (a front end in `web/`).

## test.acceptance / test.unit / build.compile / build.lint — commands through `capture.mjs`

`capture.mjs` runs one command from the package directory without a shell and writes
`<name>.stdout` (stdout and stderr), `<name>.exit` and `<name>.stdout.sha256` into `$EV`,
creating it; it exits with the command's code. `{bin:<package>}` runs that package's own
command file with node, which also works on Windows.

| Gate | Command |
|---|---|
| `test.acceptance` / `test.unit` | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-tests -- {bin:vitest} run` |
| `build.compile` | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-build -- {bin:typescript:tsc} --noEmit` |
| `build.lint` | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-lint -- {bin:eslint} . --max-warnings 0` |

`test.acceptance` narrows the Vitest line to the story's acceptance tests when they live apart;
otherwise both gates cite `qg-tests`. Read `tests_total` / `tests_passed` / `tests_failed` from
Vitest's `Tests` summary line.

Populate each entry: `command_executed` = the verbatim line, `exit_code_ref` / `stdout_ref` =
`evidence/{date}/{story}/<name>.exit` / `.stdout`, `stdout_sha256` = contents of
`<name>.stdout.sha256`, `stdout_tail` = the last 40 lines `capture.mjs` printed.

`build.lint` carries the architecture boundaries: the project's checked-in ESLint config sets the
`eslint-plugin-boundaries` rules (`boundaries/dependencies`, `boundaries/no-unknown-files`) as
errors — `clean-architecture-react` ships them — and ESLint itself enforces them in the
`qg-lint` run. A config without those rules is a `build.lint` defect: add them in a work commit
before capturing; never record `build.lint` `pass` on a config that lacks them.

## test.no-mocks-core — No test doubles in the core and the unit tests

The core is every production source of the package under a folder whose name ends with
`domain` or `application` (`src/todos/application`, `src/domain`), tests and `.d.ts` aside;
with none, `test.no-mocks-core` blocks.

```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

Scans the core sources and `tests/unit` (`--tests <dir>`, repeatable) for `vi.mock`,
`vi.fn`, `vi.spyOn` and the other Vitest or Jest doubles, MSW, `sinon`, `ts-mockito`,
`testdouble` and the `*-mock-extended` libraries. Unit tests use hand-written in-memory
gateways (`clean-architecture-testing`); MSW belongs to the gateway tests in
`tests/integration`. It writes `qg-mocks.stdout` (one hit per line, empty on pass), `.exit` and
`.stdout.sha256`; record `status: "pass"` only on exit 0.

## commit.convention — Conventional commits

Already enforceable from the Git tree alone — no fresh tool run. The producer fills
`commits_covered[].subject` from `git log --format='%s' <range>`; `qg-verify` and the lens
check each full message against the contract's `commit.convention` rules.

## test.integrity — RED→GREEN integrity

One cycle per scenario: its acceptance test file at the `test` commit that holds it RED and at
the scenario's green commit. The producer records `test_files`, `red_commit` and `green_commit`;
`qg-verify` reads both versions with `git show` and fails the gate if any line was removed or
mutated. No RED run is captured, no snapshot is written.

## evidence.screenshots — Frontend stories

A story whose commits touch a `@visual` scenario, `tests/e2e/`, a `package.json` declaring
`react` or a `playwright.config.*` records at least one screenshot taken by
`playwright-evidence`. Copy each PNG into `$EV/screenshots/`, record its `ref`
(`evidence/{date}/{story}/screenshots/<file>.png`) and the sha256 of its bytes from
`node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1])).digest('hex'))" <png>`.

## Not run by this adapter

Coverage (`ci.coverage`) and mutation (`ci.mutation`) are not pipeline gates, and architecture
has no gate of its own: `build.lint` enforces it. Coverage at 100% of Domain and Application,
with no exclusion, and the mutation step run in the project's CI; the developer runs
`/skraft-mutation` by hand. Never record them in the log.

## Producer flow at the end of the story

1. `git check-ignore -q "$EV"` must succeed; otherwise add `.copilot-tracking/skraft-plans/*/evidence/`
   to `.gitignore` in a work commit.
2. Run `test.acceptance`/`test.unit`, `build.compile`, `build.lint`, `test.no-mocks-core` — each
   through `capture.mjs` or its script.
3. `repo_root_rev = git rev-parse HEAD` — the last work commit.
4. Build `commits_covered[]` from `git log --format='%H%x09%s' {DELIVER baseSha}..HEAD` and
   `git show --name-only --format= <sha>` per commit: every commit since DELIVER started.
5. Assemble `$EV/qg-{story}.json` per `quality-gates-evidence-contract` (v7) with
   `"tech_adapter": "quality-gates-typescript"`.
6. `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log "$EV/qg-{story}.json"` must print
   `"verdict": "pass"`; otherwise fix the code, the gate or the log, never the verifier's input.

Nothing is committed: the log and every capture stay in `$EV`.
