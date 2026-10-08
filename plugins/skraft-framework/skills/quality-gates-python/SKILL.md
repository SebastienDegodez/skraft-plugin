---
name: quality-gates-python
description: Use when the active repository is a Python project (`pyproject.toml` present) and the software-engineer must produce falsifiable evidence for the quality gates, or run the cosmic-ray mutation gates after a green baseline. Provides the cross-platform scripts (Node, no shell) that run pytest, import-linter, coverage.py and cosmic-ray from the project's virtual environment and map their outputs onto the tech-agnostic schema. The G10 RED capture is taken at RED, before any production code.
---

# Quality Gates — Python Adapter

Binds the gates of `quality-gates-evidence-contract` to the Python toolchain. Load
[quality bar](../skraft-quality-bar/SKILL.md) first. Every gate below blocks; a gate whose
tool is missing is `status: "fail"` with the captured output, never `not_applicable`.

## Prerequisites

- The project interpreter is `.venv` at the repository root (`.venv/bin/python`, or
  `.venv\Scripts\python.exe` on Windows); otherwise pass `--python <path>` to every script.
- The package is installed editable in it (`pip install -e ".[dev]"`); the dev dependencies
  hold `pytest`, `coverage`, `import-linter` and `cosmic-ray` 8.x. Never install a tool
  during a gate run.
- Python 3.11 or later.

`$Q` is `$SKRAFT_PLUGIN_ROOT/skills/quality-gates-python/scripts`, or the `scripts/` folder beside this file when that variable is empty. `$EV` is
`.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/`; log references drop
the `.copilot-tracking/skraft-plans/{projectSlug}/` prefix. Every script runs with `node`
and no shell, so the same line works in bash and PowerShell.

## G1 / G2 / G3 / G4 / G5 — commands through `capture.mjs`

`capture.mjs` runs one command without a shell from the repository root and writes
`<name>.stdout` (stdout and stderr), `<name>.exit` and `<name>.stdout.sha256`; `{python}`
is the project interpreter. Its exit code is the command's.

| Gate | Command |
|---|---|
| G1 / G2 | `node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-tests -- {python} -m pytest -q -p no:cacheprovider` |
| G3 | `node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-build -- {python} -m compileall -q src` |
| G4 | the project's checked-in linter or type checker (`{python} -m ruff check`, `{python} -m mypy src`) with `--name qg-lint`; none configured: G4 reuses the G3 files |
| G5 | `node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-arch -- {python} -c "from importlinter.cli import lint_imports_command; lint_imports_command()"` (import-linter has no `-m` entry point) |

G1 narrows the same pytest line to the story's acceptance tests when they live apart. Read
`tests_total` / `tests_passed` / `tests_failed` from pytest's last summary line. A project
with no import-linter contract records G5 `fail`: `clean-architecture-python` requires one.

## G6 — Mutation score (cosmic-ray)

Mutation configuration is repository infrastructure. Scaffold it once, review it and commit
both files at the repository root:

```bash
node "$Q/configure-mutation.mjs" --root .
```

It writes `cosmic-ray-core.toml` (`src/<context>/domain` and `application`, tests
`tests/unit`) and `cosmic-ray-boundary.toml` (`infrastructure` and `api`, whole suite) for
every `src/<context>/` holding a `domain` package. A non-standard layout passes explicit
paths: `--core src/shop/core --boundary src/shop/adapters` (repeatable). A differing
existing file is kept unless `--force`, after reviewing why it should change.

The scripts accept only `module-path`, `timeout`, an empty `excluded-modules`, `test-command`
and `distributor = { name = "local" }`. Never add exclusions or filters to buy a score.

Run core, then boundary, once, after the story's last work commit:

```bash
node "$Q/mutation-gate.mjs" --root . --scope core --config cosmic-ray-core.toml --evidence "$EV" --since "$BASE"
node "$Q/mutation-gate.mjs" --root . --scope boundary --config cosmic-ray-boundary.toml --evidence "$EV" --since "$BASE"
```

`BASE` is `phaseHistory.DELIVER.baseSha` from `state.mjs get --field phaseHistory`; drop
`--since` only when no base is recorded. `--since` mutates every scope file changed from the
merge-base through the working tree, untracked files included; a scope the story did not
change passes with `No … source changed`. Boundary refuses to start until
`$EV/qg-mutation.exit` holds `0`.

Each run checks that the config is committed, runs the suite unmutated first (a red baseline
blocks: every mutant would look killed), then `init`, the pragma filter, `exec` and `dump`.
It restores any source a crashed run left mutated and fails the gate. The thresholds live in
the script (100 core, 80 boundary); none is a caller argument. Exit 0 pass, 1 gate failed,
2 invalid input or tooling.

Outputs: `qg-mutation.stdout` / `.exit` / `.stdout.sha256` (core) and
`qg-mutation-boundary.*`, each beside a folder holding the effective config, every step's
output, `dump.stdout` and `manifest.json` (interpreter, cosmic-ray version, config hash,
source and test hashes, merge-base). Populate two G6 entries, `"scope": "core"` and
`"scope": "boundary"`, from those files. Survivors are listed as `survived: <file>:<line>
<operator>`; `mutation-testing` decides what each one means.

An equivalent mutant is suppressed only on its own line with a reason:
`# pragma: no mutate -- typing.final has no runtime effect`. A pragma without a reason blocks
the run; suppressed mutants are counted in the verdict line.

## G7 — No mocks in Domain/Application

```bash
node "$Q/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

Scans the core config's sources and `tests/unit` (`--tests <dir>`, repeatable, for another
unit package) for `unittest.mock`, `mock`, `pytest-mock`, `patch`, `flexmock`, `doublex` and
`mockito`. `qg-mocks.stdout` lists one hit per line and is empty on pass.

## G11 — Line coverage of Domain and Application

```bash
node "$Q/coverage-core.mjs" --root . --evidence "$EV"
```

Runs the whole suite under coverage.py with the core config's paths as sources and exits
non-zero below 100%, on a failing test, on a core file never imported, or on a
`# pragma: no cover` in the core. `--threshold` is refused. Outputs `qg-coverage.*`.

## G8 / G9 / G10

As in every adapter: G8 from the Git tree; G9 from `git show HEAD:<test file>` snapshots
taken at RED and at GREEN; G10 at RED, before the implementation, with the G1 line narrowed
to the cycle's test and `--name qg-red-{cycle}`:

```bash
node "$Q/capture.mjs" --root . --evidence "$EV" --name qg-red-1 -- {python} -m pytest -q -p no:cacheprovider tests/unit/place_order/test_place_order.py
```

The recorded exit code MUST be non-zero. The capture cannot be reconstructed after GREEN.

## Producer flow at the end of the story

1. Run G1/G2, G3, G4, G5, G6 core then boundary, G7, G11 — each through its script.
2. Dump the RED and GREEN snapshots per cycle; check every G10 capture exists with a non-zero exit.
3. `repo_root_rev = git rev-parse HEAD`; build `commits_covered[]` from the DELIVER base.
4. Assemble `$EV/qg-{story}.json` (contract v4) with `"tech_adapter": "quality-gates-python"`, commit `$EV` alone, then run `qg-verify`.
