---
layout: doc
lang: en
title: "quality-gates-evidence-contract"
description: "Use when producing or verifying the structured evidence log that attests quality gates (tests, build, mutation, commi..."
persona: tech-lead
---

# quality-gates-evidence-contract

> Tech-agnostic schema that attests quality gates as falsifiable references — Git SHAs, hashed file paths, tool outputs captured on disk.

## When to use

- In the COMMIT phase, for the `software-engineer` to produce the evidence log `qg-{story}.json`
- During review, for the `quality-gates-lens` to verify attestations without re-execution
- Always loaded together with a tech adapter (`quality-gates-dotnet`, etc.)

## Entry contract

- Full test suite run, stdout captured by the shell
- RED and GREEN snapshots extracted via `git show` for each TDD cycle
- `git rev-parse HEAD` as the repo root reference

## Exit contract

- `qg-{story}.json` file conforming to the `quality-gates-evidence/v1` schema
- Ancillary files in `.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/`
- Each gate G1-G9 with `status`, `command_executed`, `exit_code_ref`, `stdout_ref`, `stdout_sha256`, `stdout_tail`
- `snapshots/` directory containing `red-{n}-{file}` / `green-{n}-{file}` pairs

## Invariants

- **Falsifiability** — every field resolves from the Git tree without re-execution
- **No manual transcription** — stdout and sha256 are produced by shell tools, never dictated
- **`not_applicable` ≠ `fail`** — an inapplicable gate requires an explicit `rationale` field
- **RED→GREEN integrity (G9)** — only added lines are allowed between RED and GREEN; any removal or mutation of an existing line is a G9 violation
- **Fixed gate identifiers** — G1 to G9 only; adding an identifier is a schema version change
- **Hidden gate = `inconclusive`** — concealing a failure by omitting the log fails harder on the lens side

## Why this shape

The `quality-gates-lens` re-runs no tool; it falsifies the attestation against the Git tree. This constraint forces the producer to deposit real artifacts rather than assert a result.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

A missing or incoherent evidence log is treated as `inconclusive` (NEEDS_REWORK), which is more blocking than an honest `fail`.

## Allowed customisation

- Adding fields within an existing gate (L2, backward-compatible)
- Version bump (`evidence/v2`) to add or remove a gate (L3)
- Custom tech adapters (`quality-gates-<stack>`) (L2)

## See also

- [quality-gates-dotnet]({{ "/en/reference/skills/quality-gates-dotnet" | relative_url }}) — .NET adapter
- [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }}) — Stack command resolution
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Evidence producer
