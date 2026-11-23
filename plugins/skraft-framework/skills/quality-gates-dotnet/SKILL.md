---
name: quality-gates-dotnet
description: Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must produce falsifiable evidence for the quality gates. Every gate is captured once, after the story's last work commit. Provides the concrete `dotnet` commands and how their outputs map onto the tech-agnostic schema. Mutation (G6) never runs in a delivery: it is the developer's, through `/skraft-mutation`.
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

Throughout this file, `$EV` is shorthand for that directory — one per story, never shared.
`<skill>` is this skill's folder, the one holding this SKILL.md: every script below ships in
`<skill>/scripts/`, never in the consumer repository. `capture.mjs` runs a command without a
shell and writes `<name>.stdout` (stdout and stderr), `<name>.exit` and `<name>.stdout.sha256`
into `$EV`, creating it; it exits with the command's code, in bash and PowerShell alike. Log references drop the `.copilot-tracking/skraft-plans/{projectSlug}/`
prefix: `evidence/{date}/{story}/qg-tests.stdout`.

## G1 / G2 — Tests pass

Run the full suite once and partition the results into two gate entries by
filtering the produced TRX, OR run the acceptance project alone for G1 and the
full suite for G2 (recommended on small repos).

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

## G3 — Build passes

Implicit in `dotnet test` for most repos. If the team wants an explicit gate:

```bash
node "<skill>/scripts/capture.mjs" --evidence "$EV" --name qg-build -- dotnet build --nologo --no-incremental
```

## G4 — Static analysis

Use the analyzers wired into the build (Roslyn analyzers, `TreatWarningsAsErrors=true`).
If the build is clean, G4 inherits its evidence from G3 and sets
`stdout_ref`/`exit_code_ref` to the G3 files. No fresh command needed.

## G5 — Architecture rules

If the repo carries a `*.ArchitectureTests` project (NetArchTest / ArchUnitNET):

```bash
node "<skill>/scripts/capture.mjs" --evidence "$EV" --name qg-arch -- dotnet test --nologo --filter "FullyQualifiedName~Architecture" --logger "trx;LogFileName=qg-arch.trx" --results-directory "$EV"
```

If absent, mark G5 `status: "not_applicable"` with `rationale: "no architecture tests project"`.

## G6 — Mutation score

Never run in a delivery. This adapter runs no mutation tool or gate and ships no mutation
config: record G6 `not_run` with the rationale `G6 not run: mutation testing runs outside the
pipeline; the developer runs /skraft-mutation.`, never `pass`, and tell the developer.

## G7 — No mocks in Domain/Application

```bash
node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence "$EV"
```

The script scans every `*.Domain` and `*.Application` project at any depth, plus the
`*.Domain.*Tests`, `*.Application.*Tests` and `*.UnitTests` projects, for mocking
frameworks (Moq, NSubstitute, FakeItEasy, AutoMoq). It writes `qg-mocks.stdout` (one hit
per line, empty when clean), `.exit` and `.stdout.sha256`; its exit is the verdict.
Populate G7 with `status: "pass"` only on exit 0; `stdout_ref` = `evidence/{date}/{story}/qg-mocks.stdout`.

## G11 — Line coverage of Domain and Application

```bash
node "<skill>/scripts/coverage-core.mjs" --root . --evidence "$EV"
```

The script runs the solution's tests once with the XPlat Code Coverage collector
(`coverlet.collector`, present in the `dotnet new xunit` template; add it to a test project
that lacks it), sums the Cobertura line counts of every `*.Domain` and `*.Application`
package, and exits non-zero below 100%, when a test fails, or when no core package was
measured. The bar lives in the script; `--threshold` is refused. Populate G11 with its
`command_executed`, `stdout_ref` / `exit_code_ref` = `evidence/{date}/{story}/qg-coverage.stdout` /
`.exit` and `stdout_sha256` from `qg-coverage.stdout.sha256`.

## G8 — Conventional commits

Already enforceable from the Git tree alone — no fresh tool run. The producer fills
`commits_covered[].subject` from `git log --format='%s' <range>`; the lens checks
each full message against the contract's G8 rules.

## G9 — Test integrity (RED→GREEN snapshots)

One cycle per scenario: its acceptance test file at the `test` commit that holds it RED and at
the scenario's green commit. Write both snapshots at the end of the story, from those commits:

```bash
node "<skill>/scripts/snapshot.mjs" --evidence "$EV" --name red-1-SomeAcceptanceTests.cs --rev <test commit> --file tests/MonAssurance.UnitTests/Features/Eligibilite/SomeAcceptanceTests.cs
node "<skill>/scripts/snapshot.mjs" --evidence "$EV" --name green-1-SomeAcceptanceTests.cs --rev <green commit> --file tests/MonAssurance.UnitTests/Features/Eligibilite/SomeAcceptanceTests.cs
```

`snapshot.mjs` writes the exact bytes of `git show <rev>:<file>` (`--rev`, default `HEAD`) into
`$EV/snapshots/`; a shell redirection would let PowerShell re-encode them.

The producer records `red_commit`, `green_commit`, and the two snapshot paths in
the contract. The lens diffs the two snapshots and FAILS G9 if any line was
removed or mutated in a pre-existing assertion (only additions are allowed —
that is the Iron Rule of Tests, mechanically verifiable).

## Producer flow at the end of the story

One command runs the whole flow below — every gate, the snapshots, `commits_covered`, the log,
its evidence-only commit and `qg-verify` — and exits with `qg-verify`'s verdict:

```bash
node "<skill>/scripts/qg-collect.mjs" --root . --evidence "$EV" --story {story} --feature {feature} \
  --base {DELIVER baseSha} \
  --cycle 1:{red sha}:{green sha}:{acceptance test file} --cycle 2:…
```

One `--cycle` per scenario that has a green commit, numbered by its rank in the plan; its red is
the `test` commit holding its acceptance test. It prints one line per gate, then the verdict. A
`fail` or `inconclusive` is yours to fix: fix the code or the cycles, then run it again. By hand,
the same flow is:

1. Run G1/G2, G3 (if separate), G4 (if separate), G5, G7, G11 —
   each through `capture.mjs` or its script, which write stdout, exit code and hash into `$EV`.
2. For each scenario, write the RED + GREEN snapshots with `snapshot.mjs --rev`.
3. `repo_root_rev = git rev-parse HEAD` — the last work commit.
4. Build `commits_covered[]` from `git log --format='%H%x09%s' {DELIVER baseSha}..HEAD` and
   `git show --name-only --format= <sha>` per commit: every commit since DELIVER started.
5. Assemble `$EV/qg-{story}.json` per `quality-gates-evidence-contract` (v6).
6. Commit `$EV` alone: `git add "$EV" && git commit -s -m 'chore({feature}): record quality evidence for {story}'`.
7. `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log "$EV/qg-{story}.json"` must print
   `"verdict": "pass"`; otherwise fix the gate or the log, never the verifier's input.

If a tool is unavailable in the environment (no SDK), the
gate is `status: "fail"` with the captured stderr — NOT `not_applicable`. The
contract treats unverifiable gates strictly so the lens can collapse them to
`inconclusive` upstream.
