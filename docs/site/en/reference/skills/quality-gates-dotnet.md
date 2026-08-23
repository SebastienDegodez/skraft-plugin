---
layout: doc
lang: en
title: "quality-gates-dotnet"
description: "Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must populat..."
persona: tech-lead
---

# quality-gates-dotnet

> .NET adapter that binds the quality gates of `quality-gates-evidence-contract` to concrete `dotnet` and `dotnet stryker` commands, and bundles the two mutation scripts that close the mutation gate.

## When to use

- When the active repository is a .NET solution (`*.sln`, `*.slnx`, `*.csproj`, `Directory.Packages.props`)
- During the COMMIT phase, to produce falsifiable evidence for gates G1 to G10
- At RED, to capture the run that proves the test fails — the only evidence G10 accepts, and it cannot be reconstructed later
- Loaded by the `software-engineer` after .NET stack detection via `resolving-stack-commands`
- If multiple stacks coexist, run in parallel with the other adapters

## Entry contract

- Detected .NET repository (`*.sln` or `*.csproj` marker present at the repo root)
- `$EV` variable pointing to `.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/`
- `dotnet` on `PATH` with Stryker available — the mutation scripts exit `3` otherwise
- For G6, the production and test `.csproj` paths of each scope, handed to the bundled mutation scripts. No threshold is read from anywhere: `skraft-quality-bar` owns it

## Exit contract

- Evidence files in `$EV/`: stdout redirected to disk, exit code, sha256, RED/GREEN snapshots
- Two mutation evidence sets — `qg-mutation.*` (core) and `qg-mutation-boundary.*` (boundary), each with `.stdout`, `.exit`, `.stdout.sha256` and the copied Stryker `.json` report
- `gates[G1..G10]` entries of the `quality-gates-evidence-contract` populated
- Complete `qg-{story}.json` verifiable by the `quality-gates-lens`

## Invariants

- **Verbatim commands** — `command_executed` contains the exact shell command, never paraphrased
- **Shell-captured stdout** — never transcribed manually; `sha256` computed via `shasum`
- **G7 inversion** — `grep` exit `1` (no match) is the success case for G7
- **G6 bar set by `skraft-quality-bar`** — 100% on Domain and Application, 90% on API and Infrastructure. One permanent bar: no tier, no repository setting, no rationale lowers it
- **G6 verdict = exit code** — the bundled scripts hand the bar to Stryker's `--break-at`, so the runner itself fails below it. A score read from a report and judged in prose is an opinion about a gate, not a gate
- **Missing tool = `fail`**, never `not_applicable` when the tool is not installed
- **G5 marked `not_applicable`** only if no `*.ArchitectureTests` project exists, with `rationale`

## Bundled mutation scripts

Two scripts ship inside this adapter, under `scripts/`. They run in sequence, and the order is part of the contract: there is nothing to learn from mutating adapters while the domain is unproven, so core runs first and short-circuits the boundary run when it fails.

| Order | Script | Scope | Bar | Evidence prefix |
| --- | --- | --- | --- | --- |
| 1 | `scripts/mutation-core.sh` | Domain, Application | `--break-at 100` | `qg-mutation` |
| 2 | `scripts/mutation-boundary.sh` | API, Infrastructure | `--break-at 90` | `qg-mutation-boundary` |

Both take the same three arguments, and neither takes a threshold:

```bash
scripts/mutation-core.sh \
  --prod "src/MonAssurance.Domain/MonAssurance.Domain.csproj" \
  --test "tests/MonAssurance.UnitTests/MonAssurance.UnitTests.csproj" \
  --evidence "$EV"
```

Each script runs `dotnet stryker` with the shared exclusions (`!**/*Marker.cs`, `!**/DependencyInjection.cs`, `!**/obj/**`), writes `{prefix}.stdout`, `{prefix}.exit` and `{prefix}.stdout.sha256` into `$EV`, copies the Stryker JSON report to `{prefix}.json`, and prints one JSON verdict object on stdout.

**The exit code is the verdict** — `0` gate passed, `1` gate failed, `2` usage error, `3` toolchain missing. Each script carries its scope's value as a literal and passes it to `--break-at`, so Stryker exits non-zero below the bar; a guard test asserts those literals still equal the table in `skraft-quality-bar`. Passing `--expected` is refused outright: the bar is not a runtime argument. The `measured` score in the printed JSON is recorded for the log only — never read it and judge it in prose.

Both runs happen on every pass. The removed depth dial was also the framework's cost governor, so each run now pays the full mutation shape rather than a reduced one. The trade was accepted deliberately: the bar is not negotiable.

## Why this shape

Falsifiability is non-negotiable: an agent cannot prove a test passed by saying so. Each gate deposits disk artifacts referenceable by sha256 and Git path that the lens can verify without re-execution.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

On-disk evidence makes attestation reproducibly verifiable — even weeks after delivery. The mutation gate goes one step further: its evidence is an exit code produced by the runner, which no reader has to interpret.

## Allowed customisation

- `--prod` / `--test` project paths passed to each mutation script, per scope (L1)
- G5 optional depending on `*.ArchitectureTests` project presence (L1)
- G4 shared with G3 if Roslyn analyzers are wired into the build (L1)
- **Not customisable** — the mutation bar itself; it lives in `skraft-quality-bar` and the scripts refuse `--expected`

## See also

- [quality-gates-evidence-contract]({{ "/en/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Tech-agnostic schema
- [skraft-quality-bar]({{ "/en/reference/skills/skraft-quality-bar" | relative_url }}) — The one place the bar is authored
- [mutation-testing]({{ "/en/reference/skills/mutation-testing" | relative_url }}) — Mutation scope, exclusions and survivor triage
- [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }}) — Stack detection and adapter selection
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Evidence producer agent
