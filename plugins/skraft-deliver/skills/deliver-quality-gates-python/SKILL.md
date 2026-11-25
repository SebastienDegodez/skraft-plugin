---
name: deliver-quality-gates-python
description: Use in a Python component (`pyproject.toml`) to pick or check the gate command lines of its skraft-deliver-config.json entry, or to read and kill the surviving mutants of the developer's own mutation run. Provides the bundled coverage and no-mocks scripts (Node, no shell) that run pytest, import-linter and coverage.py from the project's virtual environment.
---

# Quality Gates — Python

In a DELIVER attempt, run each gate of the component through `skraft_deliver_repl` with
`gate(name, command, { cwd: <the component root> })`, the command from your brief, else from the
component's `commands` in `skraft-deliver-config.json`: the engine reads the traced run as the evidence.
Never write an evidence file by hand, never launch a mutation run. Outside a
pipeline, when the developer asks for a gate, run its command line below from the component
root and report its exit code and verdict line. Thresholds come from `deliver-skraft-quality-bar`
and live in the scripts; no caller argument changes them.

Mutation testing is the developer's: skraft runs no mutation tool and ships no mutation
script or config. The developer picks the tool (cosmic-ray, mutmut), writes its config and
runs it apart from the pipeline.

`<skill>` is the absolute path of the folder holding this SKILL.md; the scripts are in the
scripts/ folder next to this SKILL.md, never in the consumer repository. Every script runs with
`node` and no shell, so one line works in bash and PowerShell.

## Prerequisites

- `--root` is the Git repository root, written from the component root (`.` when the
  component is the repository, `../..` for `services/api`).
- The interpreter is `.venv` at the repository root (`.venv/bin/python`, or
  `.venv\Scripts\python.exe` on Windows); otherwise every script takes `--python <path>`.
- The package is installed editable in it (`pip install -e ".[dev]"`) with `pytest`,
  `coverage` and `import-linter` as dev dependencies. Never install a tool
  during a gate run. Python 3.11 or later.

## Gate command lines

| Gate | Command line in `skraft-deliver-config.json` |
|---|---|
| build | `python -m compileall -q src` |
| test | `python -m pytest -q -p no:cacheprovider` |
| lint | the project's checked-in linter or type checker (`python -m ruff check`, `python -m mypy src`) |
| architecture | `python -c "from importlinter.cli import lint_imports_command; lint_imports_command()"` (import-linter has no `-m` entry point; `deliver-clean-architecture-python` requires a contract) |
| coverage | `node "<skill>/scripts/coverage-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/coverage` |

The engine starts a command's program as written: write the `.venv` interpreter path
(`.venv/bin/python`, or `.venv/Scripts/python.exe` on Windows; forward slashes, a backslash is an
invalid escape in JSON) in place of `python` when `python` is not the project's interpreter on the
path. A team on several systems chooses one form per component. `--evidence`
is the folder where the script keeps its own report files, relative to `--root`.

The core is every Python source under a folder whose name ends with `domain` or `application`
(`src/payment/domain`, `billing_domain`), test files aside; with none, both scripts block.

- `no-mocks-in-core.mjs` (`--root . --evidence <dir>`, `--tests <dir>` repeatable) scans the
  core sources and `tests/unit` for `unittest.mock`, `mock`, `pytest-mock`, `patch`,
  `flexmock`, `doublex` and `mockito`, one hit per line; it fits the architecture gate when
  import-linter already runs elsewhere.
- `coverage-core.mjs` runs the suite under coverage.py with the core folders as
  sources and fails below 100%, on a failing test, on a core file never imported, or on a
  `# pragma: no cover` in the core. `--threshold` is refused.

## Read the survivors

When the developer hands over the survivors of their own mutation run, each one as a file, a
line and an operator:

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

A pragma always carries its reason. Never add `excluded-modules`, filters or a lower threshold
to buy a score. A test that kills no mutant is noise:
delete it.
