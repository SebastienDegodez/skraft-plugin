---
name: quality-gates-dotnet
description: Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must produce falsifiable evidence for the quality gates. Most gates are captured at the end of the COMMIT phase; the G10 RED capture is taken **at RED**, before any production code, and cannot be reconstructed later. Provides the concrete `dotnet` / `stryker` commands and how their outputs map onto the tech-agnostic schema.
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
.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/
```

Throughout this file, `$EV` is shorthand for that directory. Create it before any redirect.

## G1 / G2 — Tests pass

Run the full suite once and partition the results into two gate entries by
filtering the produced TRX, OR run the acceptance project alone for G1 and the
full suite for G2 (recommended on small repos).

```bash
mkdir -p "$EV"
dotnet test --nologo \
  --logger "trx;LogFileName=qg-tests.trx" \
  --results-directory "$EV" \
  > "$EV/qg-tests.stdout" 2>&1
echo $? > "$EV/qg-tests.exit"
shasum -a 256 "$EV/qg-tests.stdout" | awk '{print $1}' > "$EV/qg-tests.stdout.sha256"
```

Populate the contract:

- `command_executed` = the verbatim line above
- `exit_code_ref` = `evidence/{date}/qg-tests.exit`
- `stdout_ref` = `evidence/{date}/qg-tests.stdout`
- `stdout_sha256` = contents of `qg-tests.stdout.sha256`
- `stdout_tail` = `tail -n 40 "$EV/qg-tests.stdout"`
- `metrics.tests_total` / `_passed` / `_failed` parsed from the TRX `<ResultSummary outcome="..." />`
  attribute and `<Counters total="..." passed="..." failed="..." />`

## G3 — Build passes

Implicit in `dotnet test` for most repos. If the team wants an explicit gate:

```bash
dotnet build --nologo --no-incremental \
  > "$EV/qg-build.stdout" 2>&1
echo $? > "$EV/qg-build.exit"
shasum -a 256 "$EV/qg-build.stdout" | awk '{print $1}' > "$EV/qg-build.stdout.sha256"
```

## G4 — Static analysis

Use the analyzers wired into the build (Roslyn analyzers, `TreatWarningsAsErrors=true`).
If the build is clean, G4 inherits its evidence from G3 and sets
`stdout_ref`/`exit_code_ref` to the G3 files. No fresh command needed.

## G5 — Architecture rules

If the repo carries a `*.ArchitectureTests` project (NetArchTest / ArchUnitNET):

```bash
dotnet test --nologo \
  --filter "FullyQualifiedName~Architecture" \
  --logger "trx;LogFileName=qg-arch.trx" \
  --results-directory "$EV" \
  > "$EV/qg-arch.stdout" 2>&1
echo $? > "$EV/qg-arch.exit"
shasum -a 256 "$EV/qg-arch.stdout" | awk '{print $1}' > "$EV/qg-arch.stdout.sha256"
```

If absent, mark G5 `status: "not_applicable"` with `rationale: "no architecture tests project"`.

## G6 — Mutation score

Scope the run to business logic — the same exclusions as `mutation-testing`
(no Infrastructure, no `Program.cs`, no `DependencyInjection.cs`, no DTOs) —
otherwise the score measures the whole solution and cannot be compared to the
threshold below.

Detect the project paths first, as `mutation-testing` requires:
- `PROD_CSPROJ` — the production `.csproj` being mutated (Domain or Application)
- `TEST_CSPROJ` — the test `.csproj` that exercises it

Set them as shell variables and reference them quoted. `<Production.csproj>` is
NOT a placeholder the shell tolerates: `<...>` is parsed as two REDIRECTIONS, so
`-tp` disappears from `argv`, `--project` swallows the next glob, stray files
named `-tp` and `--mutate` are created, and the run is silently unscoped.

```bash
PROD_CSPROJ="src/MonAssurance.Domain/MonAssurance.Domain.csproj"
TEST_CSPROJ="tests/MonAssurance.UnitTests/MonAssurance.UnitTests.csproj"
dotnet stryker \
  --project "$PROD_CSPROJ" \
  -tp "$TEST_CSPROJ" \
  --mutate "**/*.cs" \
  --mutate "!**/*Marker.cs" \
  --mutate "!**/DependencyInjection.cs" \
  --mutate "!**/obj/**" \
  --reporter json --reporter cleartext \
  --output "$EV/stryker" \
  > "$EV/qg-mutation.stdout" 2>&1
echo $? > "$EV/qg-mutation.exit"
shasum -a 256 "$EV/qg-mutation.stdout" | awk '{print $1}' > "$EV/qg-mutation.stdout.sha256"
cp "$EV/stryker/reports/mutation-report.json" "$EV/qg-mutation.json"
```

Threshold by repo-wide depth tier (`config.mjs get --key depthTier`):

| depthTier | min score on business logic |
|-----------|----------------------------|
| basic | 80 |
| standard | 90 |
| comprehensive | 100 |

Read `mutationScore` from `qg-mutation.json` and compare. `status: "pass"` iff `score >= threshold`.

## G7 — No mocks in Domain/Application

```bash
grep -r --include='*.cs' -nE \
  'using\s+(Moq|FakeItEasy|NSubstitute|AutoFixture\.AutoMoq);' \
  src/*.Domain src/*.Application 2>/dev/null \
  > "$EV/qg-mocks.stdout"
echo $? > "$EV/qg-mocks.exit"   # 0 = matches found (FAIL), 1 = none (PASS) — invert
shasum -a 256 "$EV/qg-mocks.stdout" | awk '{print $1}' > "$EV/qg-mocks.stdout.sha256"
```

Note the inversion: `grep` exit `1` (no match) is the success case for G7.
Set `gates[G7].status` accordingly:
- `status: "pass"` when `qg-mocks.stdout` is empty
- `status: "fail"` otherwise, with the matching lines visible in `stdout_tail`

## G8 — Conventional commits

Already enforceable from the Git tree alone — no fresh tool run. The producer fills
`commits_covered[].subject` from `git log --format='%s' <range>`; the lens runs the
regex from the contract.

## G9 — Test integrity (RED→GREEN snapshots)

For every TDD cycle, capture both snapshots when each commit lands:

```bash
mkdir -p "$EV/snapshots"
# at RED:
git show HEAD:tests/MonAssurance.UnitTests/Eligibilite/SomeTests.cs \
  > "$EV/snapshots/red-1-SomeTests.cs"
# at GREEN (after the implementation commit):
git show HEAD:tests/MonAssurance.UnitTests/Eligibilite/SomeTests.cs \
  > "$EV/snapshots/green-1-SomeTests.cs"
```

The producer records `red_commit`, `green_commit`, and the two snapshot paths in
the contract. The lens diffs the two snapshots and FAILS G9 if any line was
removed or mutated in a pre-existing assertion (only additions are allowed —
that is the Iron Rule of Tests, mechanically verifiable).

## G10 — RED observed

For every TDD cycle, capture the failing run **at RED**, before the
implementation lands. Run the G1/G2 test command narrowed to the cycle's test:

```bash
mkdir -p "$EV"
# at RED, for cycle {cycle} of story {story} — BEFORE writing the implementation:
dotnet test --nologo \
  --filter "FullyQualifiedName~SomeTests" \
  > "$EV/qg-{story}-red-{cycle}.stdout" 2>&1
echo $? > "$EV/qg-{story}-red-{cycle}.exit"
shasum -a 256 "$EV/qg-{story}-red-{cycle}.stdout" | awk '{print $1}' \
  > "$EV/qg-{story}-red-{cycle}.stdout.sha256"
```

This capture CANNOT be reconstructed afterwards: once the implementation is in,
the same command returns green. Run it while the cycle is red or the evidence
does not exist.

Populate the matching entry of `test_integrity.cycles[]`:

- `red_stdout_ref` = `evidence/{date}/qg-{story}-red-{cycle}.stdout`
- `red_stdout_sha256` = contents of `qg-{story}-red-{cycle}.stdout.sha256`
- `red_exit_code_ref` = `evidence/{date}/qg-{story}-red-{cycle}.exit`

G10's `gates[]` entry carries `status` (and `rationale`) **only** — no
`command_executed`, no `exit_code_ref`. One story runs N RED commands but has a
single gate entry, and the generic "exit code MUST be `0` for pass" rule is
inverted here; the per-cycle `red_*` fields above are where its evidence lives.

The recorded exit code MUST be NON-zero: a `0` means the test never failed and
G10 is `status: "fail"`. G10 attests the RED *run*, nothing about commit SHAs —
G9 keeps the commit/snapshot job unchanged.

## Producer flow at end of COMMIT phase

1. `mkdir -p "$EV"` and `mkdir -p "$EV/snapshots"`.
2. Run G1/G2, G3 (if separate), G4 (if separate), G5, G6, G7 — each redirecting
   stdout + exit code to disk.
3. For each cycle in this story, dump RED + GREEN snapshots from `git show`.
4. For each cycle, check the G10 RED captures taken at RED time are present in
   `$EV` (`qg-{story}-red-{cycle}.stdout` / `.exit` / `.stdout.sha256`) and that
   every recorded exit code is non-zero. They are NOT re-runnable here — a
   missing capture is `status: "fail"`, never `not_applicable`.
5. Compute `repo_root_rev = git rev-parse HEAD`.
6. Build `commits_covered[]` from `git log --format='%H%x09%s' <range>` and
   `git show --stat --name-only <sha>` per commit.
7. Assemble `qg-{story}.json` per `quality-gates-evidence-contract`.
8. Commit the evidence directory in a final `chore(evidence): quality gates for {story}` commit.

If a tool is unavailable in the environment (no Stryker installed, no SDK), the
gate is `status: "fail"` with the captured stderr — NOT `not_applicable`. The
contract treats unverifiable gates strictly so the lens can collapse them to
`inconclusive` upstream.
