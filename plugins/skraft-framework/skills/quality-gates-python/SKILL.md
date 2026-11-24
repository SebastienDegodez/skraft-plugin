---
name: quality-gates-python
description: "Use when the active repository is a Python project (`pyproject.toml` present) and the software-engineer must produce falsifiable evidence for the quality gates. Every gate is captured once, after the story's last work commit, into a Git-ignored directory. Provides the cross-platform scripts (Node, no shell) that run pytest, the build check and import-linter from the project's virtual environment and map their outputs onto the tech-agnostic schema. Coverage and mutation never run in a delivery: the project's CI runs them."
---

# Quality Gates — Python Adapter

Binds the gates of `quality-gates-evidence-contract` to the Python toolchain. Load
quality bar (`skraft-quality-bar`) first. Every gate below blocks; a gate whose
tool is missing is `status: "fail"` with the captured output, never `not_applicable`.

## Prerequisites

- The project interpreter is `.venv` at the repository root (`.venv/bin/python`, or
  `.venv\Scripts\python.exe` on Windows); otherwise pass `--python <path>` to every script.
- The package is installed editable in it (`pip install -e ".[dev]"`); the dev dependencies
  hold `pytest` and `import-linter`. Never install a tool during a gate run.
- Python 3.11 or later.

## Output paths

`<skill>` is this skill's folder, the one holding this SKILL.md; every script ships in
`<skill>/scripts/`, never in the consumer repository. `$EV` is
`.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/` — one per story, never
shared, ignored by Git (`.copilot-tracking/skraft-plans/*/evidence/` in `.gitignore`), never
committed. Log references drop the `.copilot-tracking/skraft-plans/{projectSlug}/` prefix:
`evidence/{date}/{story}/qg-tests.stdout`. Every script runs with `node` and no shell, so the
same line works in bash and PowerShell.

## test.acceptance / test.unit / build.compile / build.lint — commands through `capture.mjs`

`capture.mjs` runs one command without a shell from the repository root and writes
`<name>.stdout` (stdout and stderr), `<name>.exit` and `<name>.stdout.sha256` into `$EV`,
creating it; `{python}` is the project interpreter. Its exit code is the command's.

| Gate | Command |
|---|---|
| `test.acceptance` / `test.unit` | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-tests -- {python} -m pytest -q -p no:cacheprovider` |
| `build.compile` | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-build -- {python} -m compileall -q src`; a project that checks in a `mypy` config runs `{python} -m mypy src` instead |
| `build.lint` | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-lint -- {python} -c "from importlinter.cli import lint_imports_command; lint_imports_command()"` (import-linter has no `-m` entry point); a project that checks in a `ruff` config runs both in the same capture: `... --name qg-lint -- {python} -c "import subprocess as s, sys; c = [[sys.executable, '-m', 'ruff', 'check'], [sys.executable, '-c', 'from importlinter.cli import lint_imports_command; lint_imports_command()']]; sys.exit(max([s.call(x) for x in c]))"` |

`test.acceptance` narrows the same pytest line to the story's acceptance tests when they live
apart; otherwise both gates cite `qg-tests`. Read `tests_total` / `tests_passed` /
`tests_failed` from pytest's last summary line.

Populate each entry: `command_executed` = the verbatim line, `exit_code_ref` / `stdout_ref` =
`evidence/{date}/{story}/<name>.exit` / `.stdout`, `stdout_sha256` = contents of
`<name>.stdout.sha256`, `stdout_tail` = the last 40 lines `capture.mjs` printed.

`build.lint` is one capture with one exit code: the project's checked-in `ruff` config, when
there is one, then import-linter, both always run. Import-linter carries the architecture
boundaries declared in `[tool.importlinter]`; a project with no import-linter contract records
`build.lint` `fail` — `clean-architecture-python` requires one.

## test.no-mocks-core — No mocks in Domain/Application

The core is every Python source under a folder whose name ends with `domain` or `application`
(`src/payment/domain`, `billing_domain`), test files aside; with none, `test.no-mocks-core` blocks.

```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

Scans the core sources and `tests/unit` (`--tests <dir>`, repeatable, for another
unit package) for `unittest.mock`, `mock`, `pytest-mock`, `patch`, `flexmock`, `doublex` and
`mockito`. It writes `qg-mocks.stdout` (one hit per line, empty on pass), `.exit` and
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
   `"tech_adapter": "quality-gates-python"`.
6. `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log "$EV/qg-{story}.json"` must print
   `"verdict": "pass"`; otherwise fix the code, the gate or the log, never the verifier's input.

Nothing is committed: the log and every capture stay in `$EV`.
