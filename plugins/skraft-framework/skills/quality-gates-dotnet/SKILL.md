---
name: quality-gates-dotnet
description: "Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must produce falsifiable evidence for the quality gates. Every gate is captured once, after the story's last work commit, into a Git-ignored directory. Provides the concrete `dotnet` commands and how their outputs map onto the tech-agnostic schema. Architecture, coverage and mutation never run in a delivery: the project's CI runs them."
---

# Quality Gates — .NET Adapter

Concrete recipes that bind the gates of `quality-gates-evidence-contract` to the
.NET toolchain. Loaded ONLY when the producer detects a .NET stack.

## Detection

Activate this adapter when ANY of the following resolves at the repo root:
- `*.sln` or `*.slnx`
- `Directory.Packages.props`
- `**/*.csproj`

If multiple stacks coexist, run each adapter and concatenate gate entries.

## Output paths (relative to repo root)

```
.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/
```

Throughout this file, `$EV` is shorthand for that directory — one per story, never shared,
ignored by Git (`.copilot-tracking/skraft-plans/*/evidence/` in `.gitignore`), never committed.
`<skill>` is this skill's folder, the one holding this SKILL.md: every script below ships in
`<skill>/scripts/`, never in the consumer repository. `capture.mjs` runs a command without a
shell and writes `<name>.stdout` (stdout and stderr), `<name>.exit` and `<name>.stdout.sha256`
into `$EV`, creating it; it exits with the command's code, in bash and PowerShell alike. Log references drop the `.copilot-tracking/skraft-plans/{projectSlug}/`
prefix: `evidence/{date}/{story}/qg-tests.stdout`.

## test.acceptance / test.unit — Tests pass

Run the full suite once; both gates cite the same capture. The full suite includes the
`*.ArchitectureTests` project (NetArchTest / ArchUnitNET) when the repository has one: a broken
architecture rule fails `test.unit`.

```bash
node "<skill>/scripts/capture.mjs" --evidence "$EV" --name qg-tests -- dotnet test --nologo --logger "trx;LogFileName=qg-tests.trx" --results-directory "$EV"
```

Populate the contract:

- `command_executed` = the verbatim line above
- `exit_code_ref` = `evidence/{date}/{story}/qg-tests.exit`
- `stdout_ref` = `evidence/{date}/{story}/qg-tests.stdout`
- `stdout_sha256` = contents of `qg-tests.stdout.sha256`
- `stdout_tail` = the last 40 lines `capture.mjs` printed
- `metrics.tests_total` / `_passed` / `_failed` parsed from the TRX `<ResultSummary outcome="..." />`
  attribute and `<Counters total="..." passed="..." failed="..." />`

## build.compile — Build passes

```bash
node "<skill>/scripts/capture.mjs" --evidence "$EV" --name qg-build -- dotnet build --nologo --no-incremental
```

## build.lint — Static analysis

Use the analyzers wired into the build (Roslyn analyzers, `TreatWarningsAsErrors=true`).
`build.lint` cites the `build.compile` files. No fresh command needed.

## test.no-mocks-core — No mocks in Domain/Application

```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

The script scans every `*.Domain` and `*.Application` project at any depth, plus the
`*.Domain.*Tests`, `*.Application.*Tests` and `*.UnitTests` projects, for mocking
frameworks (Moq, NSubstitute, FakeItEasy, AutoMoq). It writes `qg-mocks.stdout` (one hit
per line, empty when clean), `.exit` and `.stdout.sha256`; its exit is the verdict.
Record `status: "pass"` only on exit 0; `stdout_ref` = `evidence/{date}/{story}/qg-mocks.stdout`.

## commit.convention — Conventional commits

Already enforceable from the Git tree alone — no fresh tool run. The producer fills
`commits_covered[].subject` from `git log --format='%s' <range>`; `qg-verify` and the lens
check each full message against the contract's `commit.convention` rules.

## test.integrity — RED→GREEN integrity

One cycle per scenario: its acceptance test file at the `test` commit that holds it RED and at
the scenario's green commit. The producer records `test_files`, `red_commit` and `green_commit`;
`qg-verify` reads both versions with `git show` and fails the gate if any line was removed or
mutated (only additions are allowed — the Iron Rule of Tests). No snapshot is written.

## evidence.screenshots — Frontend stories

A story whose commits touch a `@visual` scenario, `tests/e2e/`, a `package.json` declaring
`react` or a `playwright.config.*` records at least one screenshot taken by
`playwright-evidence`. Pass each PNG with `--screenshot`; `qg-collect` copies it into
`$EV/screenshots/` and records its sha256.

## Not run by this adapter

Architecture (`arch.boundaries`), coverage (`ci.coverage`) and mutation (`ci.mutation`) are not
pipeline gates. Coverage at 100% of Domain and Application and the mutation step run in the
project's CI; the developer runs `/skraft-mutation` by hand. Never record them in the log.

## Producer flow at the end of the story

One command runs the whole flow below — every gate, `commits_covered`, the log and `qg-verify` —
and exits with `qg-verify`'s verdict. It commits nothing:

```bash
node "<skill>/scripts/qg-collect.mjs" --root . --evidence "$EV" --story {story} \
  --base {DELIVER baseSha} \
  --cycle 1:{red sha}:{green sha}:{acceptance test file} --cycle 2:… \
  [--screenshot {png} …]
```

One `--cycle` per scenario that has a green commit, numbered by its rank in the plan; its red is
the `test` commit holding its acceptance test. It refuses an `$EV` Git does not ignore. It
prints one line per gate, then the verdict. A `fail` or `inconclusive` is yours to fix: fix the
code or the cycles, then run it again. By hand, the same flow is:

1. `git check-ignore -q "$EV"` must succeed; otherwise add `.copilot-tracking/skraft-plans/*/evidence/`
   to `.gitignore` in a work commit.
2. Run `test.acceptance`/`test.unit`, `build.compile`, `test.no-mocks-core` — each through
   `capture.mjs` or its script, which write stdout, exit code and hash into `$EV`.
3. `repo_root_rev = git rev-parse HEAD` — the last work commit.
4. Build `commits_covered[]` from `git log --format='%H%x09%s' {DELIVER baseSha}..HEAD` and
   `git show --name-only --format= <sha>` per commit: every commit since DELIVER started.
5. Assemble `$EV/qg-{story}.json` per `quality-gates-evidence-contract` (v7).
6. `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log "$EV/qg-{story}.json"` must print
   `"verdict": "pass"`; otherwise fix the gate or the log, never the verifier's input.

If a tool is unavailable in the environment (no SDK), the
gate is `status: "fail"` with the captured stderr — NOT `not_applicable`. The
contract treats unverifiable gates strictly so the lens can collapse them to
`inconclusive` upstream.
