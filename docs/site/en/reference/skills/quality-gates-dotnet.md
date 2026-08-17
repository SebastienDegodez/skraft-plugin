---
layout: doc
lang: en
title: "quality-gates-dotnet"
description: "Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must populat..."
persona: tech-lead
---

# quality-gates-dotnet

> .NET adapter that binds the quality gates of `quality-gates-evidence-contract` to concrete `dotnet` and `dotnet stryker` commands.

## When to use

- When the active repository is a .NET solution (`*.sln`, `*.slnx`, `*.csproj`, `Directory.Packages.props`)
- During the COMMIT phase, to produce falsifiable evidence for gates G1 to G10
- At RED, to capture the run that proves the test fails — the only evidence G10 accepts, and it cannot be reconstructed later
- Loaded by the `software-engineer` after .NET stack detection via `resolving-stack-commands`
- If multiple stacks coexist, run in parallel with the other adapters

## Entry contract

- Detected .NET repository (`*.sln` or `*.csproj` marker present at the repo root)
- `$EV` variable pointing to `.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/`
- `state.json::userPreferences.depthTier` for the G6 mutation threshold

## Exit contract

- Evidence files in `$EV/`: stdout redirected to disk, exit code, sha256, RED/GREEN snapshots
- `gates[G1..G10]` entries of the `quality-gates-evidence-contract` populated
- Complete `qg-{story}.json` verifiable by the `quality-gates-lens`

## Invariants

- **Verbatim commands** — `command_executed` contains the exact shell command, never paraphrased
- **Shell-captured stdout** — never transcribed manually; `sha256` computed via `shasum`
- **G7 inversion** — `grep` exit `1` (no match) is the success case for G7
- **G6 threshold by `depthTier`**: `basic` ≥ 80, `standard` ≥ 90, `comprehensive` ≥ 100
- **Missing tool = `fail`**, never `not_applicable` when the tool is not installed
- **G5 marked `not_applicable`** only if no `*.ArchitectureTests` project exists, with `rationale`

## Why this shape

Falsifiability is non-negotiable: an agent cannot prove a test passed by saying so. Each gate deposits disk artifacts referenceable by sha256 and Git path that the lens can verify without re-execution.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

On-disk evidence makes attestation reproducibly verifiable — even weeks after delivery.

## Allowed customisation

- G6 thresholds (via `state.json::userPreferences.depthTier`) (L2)
- G5 optional depending on `*.ArchitectureTests` project presence (L1)
- G4 shared with G3 if Roslyn analyzers are wired into the build (L1)

## See also

- [quality-gates-evidence-contract]({{ "/en/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Tech-agnostic schema
- [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }}) — Stack detection and adapter selection
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Evidence producer agent
