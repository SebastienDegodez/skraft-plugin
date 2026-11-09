---
name: quality-gates-python
description: Use in a Python component (`pyproject.toml`) to pick or check the gate command lines of its skraft-config.json entry, to scaffold the cosmic-ray mutation configs once, or to read and kill the surviving mutants the engine's mutation gate reports. Provides the bundled coverage, no-mocks and mutation scripts (Node, no shell) that run pytest, import-linter, coverage.py and cosmic-ray from the project's virtual environment.
---

# Quality Gates — Python

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
  component is the repository, `../..` for `services/api`).
- The interpreter is `.venv` at the repository root (`.venv/bin/python`, or
  `.venv\Scripts\python.exe` on Windows); otherwise every script takes `--python <path>`.
- The package is installed editable in it (`pip install -e ".[dev]"`) with `pytest`,
  `coverage`, `import-linter` and `cosmic-ray` 8.x as dev dependencies. Never install a tool
  during a gate run. Python 3.11 or later.

## Gate command lines

| Gate | Command line in `skraft-config.json` |
|---|---|
| build | `python -m compileall -q src` |
| test | `python -m pytest -q -p no:cacheprovider` |
| lint | the project's checked-in linter or type checker (`python -m ruff check`, `python -m mypy src`) |
| architecture | `python -c "from importlinter.cli import lint_imports_command; lint_imports_command()"` (import-linter has no `-m` entry point; `clean-architecture-python` requires a contract) |
| coverage | `node "<skill>/scripts/coverage-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/coverage` |
| mutation | `node "<skill>/scripts/mutation-gate.mjs" --root . --scope core --config cosmic-ray-core.toml --evidence .copilot-tracking/skraft-gates/mutation --since {baseSha}` |

Use the `.venv` interpreter path in place of `python` when it is not on the path. `--evidence`
is the folder where the script keeps its own report files, relative to `--root`. `{baseSha}` is
replaced by the engine. Outside a pipeline, put the commit `git merge-base HEAD main` prints in its place.

- `no-mocks-in-core.mjs` (`--root . --evidence <dir>`, `--tests <dir>` repeatable) scans the
  core config's sources and `tests/unit` for `unittest.mock`, `mock`, `pytest-mock`, `patch`,
  `flexmock`, `doublex` and `mockito`, one hit per line; it fits the architecture gate when
  import-linter already runs elsewhere.
- `coverage-core.mjs` runs the suite under coverage.py with the core config's paths as
  sources and fails below 100%, on a failing test, on a core file never imported, or on a
  `# pragma: no cover` in the core. `--threshold` is refused.
- `mutation-gate.mjs` checks the config is committed, runs the suite unmutated first (a red
  baseline blocks), mutates the scope files changed since `--since` (untracked included),
  restores any source a crashed run left mutated, and judges 100 (core) or 80 (boundary). A
  scope the story did not change passes with `No … source changed`. `--scope boundary`
  runs only after core passed in the same `--evidence` folder. Exit 0 pass, 1 gate failed,
  2 invalid input or tooling.

## Configure mutation once

Scaffold the configs at the repository root once, review them and commit them:

```bash
node "<skill>/scripts/configure-mutation.mjs" --root .
```

It writes `cosmic-ray-core.toml` (`src/<context>/domain` and `application`, tests
`tests/unit`) and `cosmic-ray-boundary.toml` (`infrastructure` and `api`, whole suite) for
every `src/<context>/` holding a `domain` package. With no boundary package it writes
`cosmic-ray-core.toml` alone and says so; a missing core package blocks. Re-run
configure-mutation when a boundary package appears. A non-standard layout passes explicit paths:
`--core src/shop/core --boundary src/shop/adapters` (repeatable, `--core` required). A differing
existing file is kept unless `--force`, after reviewing why it should change. The scripts accept
only `module-path`, `timeout`, an empty `excluded-modules`, `test-command` and
`distributor = { name = "local" }`; never add exclusions or filters to buy a score.

## Read the survivors

The mutation gate lists each survivor as `survived: <file>:<line> <operator>` before its
verdict line.

| Survivor | Action |
|---|---|
| Real gap: a behavior change no test catches | Write ONE test at the exact edge, through the use case, asserting the observable outcome |
| Equivalent: no observable difference (removed log call, dead path, `typing.final`, arithmetic on an unused value) | Suppress it on its own line with a reason; never write a test for it |

```python
# Survivor: amount <= 0 → amount < 0
def test_a_zero_amount_is_rejected() -> None: ...
```

```python
@final  # pragma: no mutate -- typing.final has no runtime effect
```

A pragma without a reason blocks the run; suppressed mutants are counted in the verdict line.
Never add `excluded-modules`, filters or a threshold. A test that kills no mutant is noise:
delete it.
