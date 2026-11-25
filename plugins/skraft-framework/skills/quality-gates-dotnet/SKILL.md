---
name: quality-gates-dotnet
description: "Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must produce falsifiable evidence for the quality gates. Every gate is recorded once, after the story's last work commit, in a log kept in a Git-ignored directory. Provides the concrete `dotnet` commands and how their outputs map onto the tech-agnostic schema. Architecture, coverage and mutation never run in a delivery: the project's CI runs them."
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
ignored by Git (`.copilot-tracking/skraft-plans/*/evidence/` in `.gitignore`), never committed —
and `$LOG` for `$EV/qg-{story}.json`. `<skill>` is this skill's folder, the one holding this
SKILL.md: every script below ships in `<skill>/scripts/`, never in the consumer repository.

`$EV` holds the log and the screenshots, nothing else. `capture.mjs` runs a command without a
shell, prints the last 40 lines of its output and records the gate(s) it attests in `$LOG` —
`pass` on exit 0, `fail` otherwise, the last output line as `summary`; it exits with the
command's code, in bash and PowerShell alike. No `.stdout`, `.exit` or hash file is written,
and no agent ever types a status.

## Producer flow at the end of the story

One command runs every gate, records each verdict in `$LOG` and runs `qg-verify`; it exits with
`qg-verify`'s verdict and commits nothing:

```bash
node "<skill>/scripts/qg-collect.mjs" --root . --log "$LOG" [--screenshot {png} …]
```

It refuses a `$LOG` Git does not ignore. It prints one line per gate, then the verdict. A `fail`
or `inconclusive` is yours to fix: fix the code, then run it again. `qg-verify` takes the DELIVER
and DISTILL bases the pipeline recorded; pass `--base` / `--red-base` only outside a pipeline.

## test.acceptance / test.unit — Tests pass

One run of the full suite attests both gates. The full suite includes the
`*.ArchitectureTests` project (NetArchTest / ArchUnitNET) when the repository has one: a broken
architecture rule fails `test.unit`. `qg-collect` writes the TRX report to a throw-away folder
outside the repository and records its counters as `metrics`. By hand:

```bash
node "<skill>/scripts/capture.mjs" --log "$LOG" --gate test.acceptance,test.unit -- dotnet test --nologo
```

## build.compile / build.lint — Build and static analysis

Use the analyzers wired into the build (Roslyn analyzers, `TreatWarningsAsErrors=true`): one
build attests both gates.

```bash
node "<skill>/scripts/capture.mjs" --log "$LOG" --gate build.compile,build.lint -- dotnet build --nologo --no-incremental
```

## test.no-mocks-core — No mocks in Domain/Application

```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --log "$LOG"
```

The script scans every `*.Domain` and `*.Application` project at any depth, plus the
`*.Domain.*Tests`, `*.Application.*Tests` and `*.UnitTests` projects, for mocking
frameworks (Moq, NSubstitute, FakeItEasy, AutoMoq). It prints one hit per line and records the
gate: `pass` on exit 0, `fail` with the number of hits otherwise.

## commit.convention and test.integrity — derived by qg-verify

Nothing to record: `qg-verify` reads every commit since the DELIVER base and checks its full
message, and guards every test file DISTILL's `test` commit holds — a later commit may only add
lines to it, unless its message records `PLAN_DEVIATION:`. No commit list, no cycle, no snapshot.

## evidence.screenshots — Frontend stories

A story whose commits touch a `@visual` scenario, `tests/e2e/`, a `package.json` declaring
`react` or a `playwright.config.*` records at least one screenshot taken by
`playwright-evidence`. Pass each PNG with `--screenshot`; `qg-collect` copies it into
`$EV/screenshots/` and records its sha256 (by hand: `node "<skill>/scripts/gate-log.mjs" --log "$LOG" --screenshot {png}`).

## Not run by this adapter

Architecture (`arch.boundaries`), coverage (`ci.coverage`) and mutation (`ci.mutation`) are not
pipeline gates. Coverage at 100% of Domain and Application and the mutation step run in the
project's CI; the developer runs `/skraft-mutation` by hand. Never record them in the log.

If a tool is unavailable in the environment (no SDK), the
gate is recorded `fail` with its error as summary — NOT `not_applicable`. The
contract treats unverifiable gates strictly so the lens can collapse them to
`inconclusive` upstream.
