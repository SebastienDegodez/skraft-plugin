---
name: design-quality-gates-dotnet
description: Use in a .NET component (`.sln` / `.slnx` / `.csproj`) to pick or check the gate command lines of its skraft-design-config.json entry, or to read and kill the surviving mutants of the developer's own Stryker.NET run. Provides the bundled coverage and no-mocks scripts and the Stryker.NET survivor and suppression rules.
---

# Quality Gates — .NET

In a skraft pipeline step, the engine runs each gate from the component's `commands` in
`skraft-design-config.json`, from the component root, and keeps the evidence: never run a gate to
produce evidence, never write an evidence file, never launch a mutation run. Outside a
pipeline, when the developer asks for a gate, run its command line below from the component
root and report its exit code and verdict line. Thresholds come from `design-skraft-quality-bar`
and live in the scripts; no caller argument changes them.

Mutation testing is the developer's: skraft runs no mutation tool and ships no mutation
script or config. The developer writes the Stryker.NET configs and runs them apart from the
pipeline.

`<skill>` is the absolute path of the folder holding this SKILL.md; the scripts are in the
scripts/ folder next to this SKILL.md, never in the consumer repository. Every script runs with
`node` and no shell, so one line works in bash and PowerShell.

## Gate command lines

| Gate | Command line in `skraft-design-config.json` |
|---|---|
| build | `dotnet build --nologo` |
| test | `dotnet test --nologo` |
| format | `dotnet format --verify-no-changes` |
| architecture | `dotnet test --nologo --filter "FullyQualifiedName~.ArchitectureTests."` when any test project, `*.IntegrationTest` included, holds an `ArchitectureTests` class (NetArchTest / ArchUnitNET); otherwise `node "<skill>/scripts/no-mocks-in-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/architecture` |
| coverage | `node "<skill>/scripts/coverage-core.mjs" --root . --evidence .copilot-tracking/skraft-gates/coverage` |

`--evidence` is the folder where the script keeps its own report files, relative to `--root`;
for a component below the repository root, climb to the repository's `.copilot-tracking/`
(`../../.copilot-tracking/skraft-gates/coverage`).

- `no-mocks-in-core.mjs` scans every `*.Domain` and `*.Application` project, plus the
  `*.UnitTest` project (`*.UnitTests` too) and any `*.Domain.*Tests` or `*.Application.*Tests`
  project, for Moq, NSubstitute,
  FakeItEasy and AutoMoq; it prints one hit per line and exits non-zero on any hit.
- `coverage-core.mjs` runs the tests once with the XPlat Code Coverage collector
  (`coverlet.collector`; add it to a test project that lacks it), sums the Cobertura lines of
  every `*.Domain` and `*.Application` package, and fails below 100%, on a failing test, or when
  no core package was measured. `--threshold` is refused.

## Read the survivors

When the developer hands over their own Stryker.NET report, `files.<path>.mutants[]` with
`status` `Survived` or `NoCoverage` are the mutants to handle; `location.start.line`,
`mutatorName` and `replacement` say what changed.

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
