---
layout: doc
lang: en
title: "mutation-testing"
description: "Use when entering COMMIT & VERIFY phase, killing surviving mutants, verifying test quality via mutation score, or ana..."
persona: tech-lead
---

# mutation-testing

> Verifies that tests actually catch bugs — not just execute code — by entering the COMMIT & VERIFY phase of the TDD cycle.

## When to use

- Entering phase 4 (COMMIT & VERIFY) of the TDD cycle
- Investigating a surviving mutant after the test baseline is green
- Confirming a kill is effective after writing a boundary test
- Verifying test quality before a merge

**Never run on a red baseline** — fix tests first.

## Entry contract

- 100% green test baseline
- `dotnet stryker` available (`dotnet tool install -g dotnet-stryker` if missing)
- Identified paths: `--project` (production .csproj) and `-tp` (test .csproj)

## Exit contract

- Mutation score (percentage)
- List of surviving mutants classified: **real** (missing test) or **equivalent** (no observable difference)
- Boundary tests added for each real survivor
- Verdict: ✅ Proceed to commit / ❌ BLOCK — return to step 4

## Invariants

- **S7 — Deterministic execution** — Mutation testing MUST be executed via terminal tool calls. Do not assert results from prose
- **A test that kills no mutant is noise** — delete it
- **Scope exclusions** — Never mutate: DTOs, ViewModels, infrastructure adapters, `DependencyInjection.cs`, `Program.cs`, marker interfaces, generated code
- **Mutation score 100%** on business logic to proceed to commit (or < 100% with only documented equivalent mutants)

## Why this shape

Code coverage measures execution, not bug detection. Mutation testing injects controlled faults (arithmetic operators, comparisons, booleans, conditionals, return values, LINQ) and verifies that tests fail. A surviving mutant reveals an untested edge case or an insufficiently assertive test.

> « A test that kills no mutant is noise. DELETE IT. »

The deterministic 5-step flow (run → parse JSON → classify → kill → re-run scoped) guarantees reproducible confidence in test quality, independent of human interpretation.

## Allowed customisation

- `--break-at`, `--threshold-high`, `--threshold-low` thresholds (L1)
- Exclusion patterns `--mutate "!..."` (L1)
- `--since:main` mode for fast development vs `--mutate "**/*.cs"` before merge (L2)

## See also

- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — TDD cycle whose COMMIT & VERIFY phase uses this skill
- [craft-discipline]({{ "/en/reference/skills/craft-discipline" | relative_url }}) — Self-discipline checkpoints before commit
- [quality-gates-evidence-contract]({{ "/en/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Evidence contract that consumes the mutation score
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that runs this skill
