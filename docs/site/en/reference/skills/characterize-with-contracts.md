---
layout: doc
lang: en
title: "characterize-with-contracts"
description: "Discovers or reconstructs a service's API contract and produces golden-master characterization tests that lock in CURRENT behavior — bugs included."
persona: tech-lead
---

# characterize-with-contracts

> Reuses the roster/adapter machinery of `contract-testing-roster` and `mocking-strategy-roster`, but with the opposite intent: encode what the code ACTUALLY does, right now, to verify a refactor does not change behavior.

## When to use

- Build a contract-based safety net before refactoring a brownfield service
- "characterize this API", "lock in current behavior", "build a contract-based safety net"
- Loaded by [brownfield-harness-builder]({{ "/en/reference/agents/brownfield-harness-builder" | relative_url }})

## Entry contract

- Service path / project name
- Existing contract file, if known

## Exit contract

- Discovered or reconstructed contract file(s), committed under the test project
- Characterization test project/files (the golden master)
- Gate verdict report (PASS/CONCERNS/FAIL): endpoints covered, CONCERNS causes

## Invariants

- **Never "fixes" a bug found** — write it as current behavior with `// CHARACTERIZATION`; fixing it is a later human decision
- **Never touches service code to make the harness pass** — a red characterization test = wrong harness, not wrong code
- **Delegates wiring** — stack via `contract-testing-roster`, mocking via `mocking-strategy-roster`; no new wiring vocabulary
- **Green-before-refactor gate (S4)** — full suite green against UNMODIFIED code, every discovered endpoint covered

## Why this shape

A characterization test encodes the exact current behavior (status, shape, value) — a golden master — so a refactor is verified non-regressive. The contract, discovered or reconstructed, is the common language between old and new behavior.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Allowed customisation

- Base contract: discovered (existing spec) or reconstructed (framework tooling preferred over hand-transcription)
- Mocking strategy resolved by the roster (Microcks by default)

## See also

- [brownfield-harness-builder]({{ "/en/reference/agents/brownfield-harness-builder" | relative_url }}) — Agent that loads this skill
- [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }}) — Resolves the stack adapter
- [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) — Resolves the mocking strategy (Microcks by default)
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
