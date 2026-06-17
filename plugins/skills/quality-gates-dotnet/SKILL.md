---
name: quality-gates-dotnet
description: Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must populate the quality-gates evidence contract at the end of the COMMIT phase. Provides the concrete `dotnet` / `stryker` commands and how their outputs map onto the tech-agnostic schema.
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

```bash
dotnet stryker \
  --reporter json --reporter cleartext \
  --output "$EV/stryker" \
  > "$EV/qg-mutation.stdout" 2>&1
echo $? > "$EV/qg-mutation.exit"
shasum -a 256 "$EV/qg-mutation.stdout" | awk '{print $1}' > "$EV/qg-mutation.stdout.sha256"
cp "$EV/stryker/reports/mutation-report.json" "$EV/qg-mutation.json"
```

Threshold by `state.json::userPreferences.depthTier`:

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

## Producer flow at end of COMMIT phase

1. `mkdir -p "$EV"` and `mkdir -p "$EV/snapshots"`.
2. Run G1/G2, G3 (if separate), G4 (if separate), G5, G6, G7 — each redirecting
   stdout + exit code to disk.
3. For each cycle in this story, dump RED + GREEN snapshots from `git show`.
4. Compute `repo_root_rev = git rev-parse HEAD`.
5. Build `commits_covered[]` from `git log --format='%H%x09%s' <range>` and
   `git show --stat --name-only <sha>` per commit.
6. Assemble `qg-{story}.json` per `quality-gates-evidence-contract`.
7. Commit the evidence directory in a final `chore(evidence): quality gates for {story}` commit.

If a tool is unavailable in the environment (no Stryker installed, no SDK), the
gate is `status: "fail"` with the captured stderr — NOT `not_applicable`. The
contract treats unverifiable gates strictly so the lens can collapse them to
`inconclusive` upstream.
