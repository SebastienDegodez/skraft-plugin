---
name: quality-gates-python
description: "Use when the active repository is a Python project (`pyproject.toml` present) and the software-engineer must produce falsifiable evidence for the quality gates. Every gate is recorded once, after the story's last work commit, in a log kept in a Git-ignored directory. Provides the cross-platform scripts (Node, no shell) that run pytest, the build check and import-linter from the project's virtual environment and map their outputs onto the tech-agnostic schema. Coverage and mutation never run in a delivery: the project's CI runs them."
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
committed — and `$LOG` is `$EV/qg-{story}.json`. `$EV` holds the log and the screenshots, nothing
else. Every script runs with `node` and no shell, so the same line works in bash and PowerShell.

## test.acceptance / test.unit / build.compile / build.lint — commands through `capture.mjs`

`capture.mjs` runs one command without a shell from the repository root, prints the last 40
lines of its output and records the gate(s) named by `--gate` in `$LOG`: `pass` on exit 0,
`fail` otherwise, the last output line as `summary`. `{python}` is the project interpreter. Its
exit code is the command's. No `.stdout`, `.exit` or hash file is written, and no agent ever
types a status.

| Gate | Command |
|---|---|
| `test.acceptance` / `test.unit` | `node "<skill>/scripts/capture.mjs" --root . --log "$LOG" --gate test.acceptance,test.unit -- {python} -m pytest -q -p no:cacheprovider` |
| `build.compile` | `node "<skill>/scripts/capture.mjs" --root . --log "$LOG" --gate build.compile -- {python} -m compileall -q src`; a project that checks in a `mypy` config runs `{python} -m mypy src` instead |
| `build.lint` | `node "<skill>/scripts/capture.mjs" --root . --log "$LOG" --gate build.lint -- {python} -c "from importlinter.cli import lint_imports_command; lint_imports_command()"` (import-linter has no `-m` entry point); a project that checks in a `ruff` config runs both in the same command: `... --gate build.lint -- {python} -c "import subprocess as s, sys; c = [[sys.executable, '-m', 'ruff', 'check'], [sys.executable, '-c', 'from importlinter.cli import lint_imports_command; lint_imports_command()']]; sys.exit(max([s.call(x) for x in c]))"` |

When the story's acceptance tests live apart, run them once more with `--gate test.acceptance`
and the narrowed pytest line; the later run replaces the gate's verdict.

`build.lint` is one command with one exit code: the project's checked-in `ruff` config, when
there is one, then import-linter, both always run. Import-linter carries the architecture
boundaries declared in `[tool.importlinter]`; a project with no import-linter contract records
`build.lint` `fail` — `clean-architecture-python` requires one.

## test.no-mocks-core — No mocks in Domain/Application

The core is every Python source under a folder whose name ends with `domain` or `application`
(`src/payment/domain`, `billing_domain`), test files aside; with none, `test.no-mocks-core` blocks.

```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --log "$LOG"
```

Scans the core sources and `tests/unit` (`--tests <dir>`, repeatable, for another
unit package) for `unittest.mock`, `mock`, `pytest-mock`, `patch`, `flexmock`, `doublex` and
`mockito`. It prints one hit per line and records the gate: `pass` on exit 0, `fail` otherwise.

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
