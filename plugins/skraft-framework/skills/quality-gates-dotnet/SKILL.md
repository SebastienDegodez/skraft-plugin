---
name: quality-gates-dotnet
description: Use in a .NET component (`.sln` / `.slnx` / `.csproj`) to pick or check the gate command lines of its skraft-config.json entry, to scaffold the Stryker.NET mutation configs once, or to read and kill the surviving mutants the engine's mutation gate reports. Provides the bundled coverage, no-mocks and mutation scripts and the Stryker.NET survivor and suppression rules.
---

# Quality Gates — .NET

In a skraft pipeline step, the engine runs each gate from the component's `commands` in
`skraft-config.json`, from the component root, and keeps the evidence: never run a gate to
produce evidence, never write an evidence file, never launch a mutation run. Outside a
pipeline, when the developer asks for a gate, run its command line below from the component
root and report its exit code and verdict line. Thresholds come from `skraft-quality-bar`
and live in the scripts; no caller argument changes them.

`<skill>` is the absolute path of the folder holding this SKILL.md; the scripts are in the
scripts/ folder next to this SKILL.md, never in the consumer repository. Every script runs with
`node` and no shell, so one line works in bash and PowerShell.

## Gate command lines

| Gate | Command line in `skraft-config.json` |
|---|---|
| build | `dotnet build --nologo` |
| test | `dotnet test --nologo` |
| format | `dotnet format --verify-no-changes` |
| architecture | `dotnet test --nologo --filter "FullyQualifiedName~.ArchitectureTests."` when any test project, `*.IntegrationTests` included, holds an `ArchitectureTests` class (NetArchTest / ArchUnitNET); otherwise `node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/architecture` |
| coverage | `node "<skill>/scripts/coverage-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/coverage` |
| mutation | `node "<skill>/scripts/mutation-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/mutation --since {baseSha}` |

`--evidence` is the folder where the script keeps its own report files, relative to `--root`;
for a component below the repository root, climb to the repository's `.copilot-tracking/`
(`../../.copilot-tracking/skraft-gates/coverage`). `{baseSha}` is replaced by the engine. Outside a pipeline, put the commit `git merge-base HEAD main` prints in its place.

- `no-mocks-in-core.mjs` scans every `*.Domain` and `*.Application` project, plus the
  `*.Domain.*Tests`, `*.Application.*Tests` and `*.UnitTests` projects, for Moq, NSubstitute,
  FakeItEasy and AutoMoq; it prints one hit per line and exits non-zero on any hit.
- `coverage-core.mjs` runs the tests once with the XPlat Code Coverage collector
  (`coverlet.collector`; add it to a test project that lacks it), sums the Cobertura lines of
  every `*.Domain` and `*.Application` package, and fails below 100%, on a failing test, or when
  no core package was measured. `--threshold` is refused.
- `mutation-core.mjs` runs `stryker-config-core.json` (bar 100); `mutation-boundary.mjs` runs
  `stryker-config-boundary.json` (bar 80) with the same options and refuses to judge a report
  with zero mutants or an untested mutant. `--expected` is refused. A scope the story did not
  change passes with `No … mutant changed`.

## Configure mutation once

Mutation configuration is repository infrastructure. Scaffold the root files once, review
them and commit them:

```bash
node "<skill>/scripts/configure-mutation.mjs" --root .
```

- `stryker-config-core.json` — whole solution, Domain/Application source globs, 100.
- `stryker-config-boundary.json` — whole solution, Api/Infrastructure source globs, 80.

It needs `.Domain` and `.Application` projects (several bounded contexts allowed); with no
`.Api` (any case) or `.Infrastructure` project it writes `stryker-config-core.json` alone and says so.
Re-run configure-mutation when a boundary project appears. It delegates JSON generation to
`dotnet stryker init`. Several solutions: pass `--solution`. A single project holding its layers
as `Domain`, `Application`, `Infrastructure` and `Api` folders (a BFF): pass those folders as
explicit globs, never invent projects or other layer names:

```bash
node "<skill>/scripts/configure-mutation.mjs" --root . --solution Storefront.sln --core-mutate "**/Storefront.Bff/Domain/**/*.cs" --core-mutate "**/Storefront.Bff/Application/**/*.cs" --boundary-mutate "**/Storefront.Bff/Infrastructure/**/*.cs" --boundary-mutate "**/Storefront.Bff/Api/**/*.cs"
```

A differing existing config is kept; pass `--force` only after reviewing why it should be
replaced. Never add `ignore-mutations` or broad exclusions to buy a score.

## Read the survivors

The mutation gate's output ends with the score line; the native report is
`qg-mutation-report.json` (core) or `qg-mutation-boundary-report.json` in the `--evidence`
folder. In it, `files.<path>.mutants[]` with `status` `Survived` or `NoCoverage` are the
mutants to handle; `location.start.line`, `mutatorName` and `replacement` say what changed.

| Survivor | Action |
|---|---|
| Real gap: a behavior change no test catches | Write ONE test at the exact edge, through the use case or the public surface, asserting the observable outcome |
| `NoCoverage` | Write the missing behavior test; a DTO or ViewModel survivor still means unasserted behavior |
| Equivalent: no observable difference (removed log call, dead path, null check the type already forbids, arithmetic on an unused value) | Suppress that one construct with a reason; never write a test for it |

```csharp
// Survivor: `age >= 18` → `age > 18`
[Fact]
public void A_driver_aged_exactly_18_is_eligible() { /* age = 18 */ }
```

```csharp
// Stryker disable once Arithmetic: the normalized value is never observed
var normalized = value + 0;
```

Name only the relevant mutator; `all` only when every mutation of the next construct is
proven equivalent. The reason is mandatory. Never use `ignore-mutations`, file exclusions,
threshold changes or a prose waiver. A test that kills no mutant is noise: delete it.
