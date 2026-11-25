---
name: quality-gates-python
description: Use when the active repository is a Python project (`pyproject.toml` present) and the software-engineer must produce falsifiable evidence for the quality gates. Provides the cross-platform scripts (Node, no shell) that run pytest, import-linter and coverage.py from the project's virtual environment and map their outputs onto the tech-agnostic schema.
---

# Quality Gates — Python Adapter

Binds the gates of `quality-gates-evidence-contract` to the Python toolchain. Load
quality bar (`skraft-quality-bar`) first. Every gate below blocks; a gate whose
tool is missing is `status: "fail"` with the captured output, never `not_applicable`.

## Prerequisites

- The project interpreter is `.venv` at the repository root (`.venv/bin/python`, or
  `.venv\Scripts\python.exe` on Windows); otherwise pass `--python <path>` to every script.
- The package is installed editable in it (`pip install -e ".[dev]"`); the dev dependencies
  hold `pytest`, `coverage` and `import-linter`. Never install a tool during a gate run.
- Python 3.11 or later.

`<skill>` is this skill's folder, the one holding this SKILL.md; every script ships in `<skill>/scripts/`, never in the consumer repository. `$EV` is
`.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/`; log references drop
the `.copilot-tracking/skraft-plans/{projectSlug}/` prefix. Every script runs with `node`
and no shell, so the same line works in bash and PowerShell.

## G1 / G2 / G3 / G4 / G5 — commands through `capture.mjs`

`capture.mjs` runs one command without a shell from the repository root and writes
`<name>.stdout` (stdout and stderr), `<name>.exit` and `<name>.stdout.sha256`; `{python}`
is the project interpreter. Its exit code is the command's.

| Gate | Command |
|---|---|
| G1 / G2 | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-tests -- {python} -m pytest -q -p no:cacheprovider` |
| G3 | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-build -- {python} -m compileall -q src` |
| G4 | the project's checked-in linter or type checker (`{python} -m ruff check`, `{python} -m mypy src`) with `--name qg-lint`; none configured: G4 reuses the G3 files |
| G5 | `node "<skill>/scripts/capture.mjs" --root . --evidence "$EV" --name qg-arch -- {python} -c "from importlinter.cli import lint_imports_command; lint_imports_command()"` (import-linter has no `-m` entry point) |

G1 narrows the same pytest line to the story's acceptance tests when they live apart. Read
`tests_total` / `tests_passed` / `tests_failed` from pytest's last summary line. A project
with no import-linter contract records G5 `fail`: `clean-architecture-python` requires one.

## G6 — Mutation score

skraft does no mutation testing in Python, in a delivery or through `/skraft-mutation`. This
adapter runs no mutation tool or gate and ships no mutation config: record G6 `not_run` with the
rationale `G6 not run: skraft does no mutation testing in Python.`, never `pass`.

## G7 — No mocks in Domain/Application

The core is every Python source under a folder whose name ends with `domain` or `application`
(`src/payment/domain`, `billing_domain`), test files aside; with none, G7 and G11 block.


```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

Scans the core sources and `tests/unit` (`--tests <dir>`, repeatable, for another
unit package) for `unittest.mock`, `mock`, `pytest-mock`, `patch`, `flexmock`, `doublex` and
`mockito`. `qg-mocks.stdout` lists one hit per line and is empty on pass.

## G11 — Line coverage of Domain and Application

```bash
node "<skill>/scripts/coverage-core.mjs" --root . --evidence "$EV"
```

Runs the whole suite under coverage.py with the core folders as sources and exits
non-zero below 100%, on a failing test, on a core file never imported, or on a
`# pragma: no cover` in the core. `--threshold` is refused. Outputs `qg-coverage.*`.

## G8 / G9

As in every adapter: G8 from the Git tree; G9 from snapshots of each scenario's acceptance test file
at its `test` commit and at its green commit with `node "<skill>/scripts/snapshot.mjs" --evidence "$EV" --name red-1-test_place_order.py --rev <commit> --file <path>`
(exact `git show` bytes, `--rev` defaults to `HEAD`). No RED run is captured: the `test` commit is the RED.

## Producer flow at the end of the story

1. Run G1/G2, G3, G4, G5, G7, G11 — each through its script.
2. Write the RED and GREEN snapshots per scenario with `snapshot.mjs --rev`.
3. `repo_root_rev = git rev-parse HEAD`; build `commits_covered[]` from the DELIVER base.
4. Assemble `$EV/qg-{story}.json` (contract v6) with `"tech_adapter": "quality-gates-python"`, commit `$EV` alone, then run `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log "$EV/qg-{story}.json"`: it must print `"verdict": "pass"`.
