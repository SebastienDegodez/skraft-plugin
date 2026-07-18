---
layout: doc
lang: en
title: "brownfield-harness-builder"
description: "Makes a brownfield service SAFE TO CHANGE before refactoring: API contracts, Microcks mocks, golden-master characterization tests. Standalone workflow."
persona: tech-lead
---

# brownfield-harness-builder

> Builds the safety net a brownfield service needs before anyone refactors it: discovers or reconstructs its API contract, stands up Microcks mocks for its dependencies, and locks in what it does RIGHT NOW — bugs included.

## When to use

- Make an existing service safe to change before refactoring it
- "build a safety net", "characterize this API before refactoring", "lock in current behavior"
- Standalone workflow — invoked directly, not an orchestrator phase

## Entry contract

- Target service path or project name (required)
- Existing contract file, if known

## Exit contract

- Discovered or reconstructed contract file(s)
- Characterization test project/files
- Gate verdict report (PASS/CONCERNS/FAIL, coverage gaps)

## Invariants

- **Never "fixes" a bug found during characterization** — captures it as current behavior; fixing it is a later human decision
- **Never touches service code to make the harness pass** — a red test against unmodified code means the harness is wrong
- **Never reinvents stack/mocking wiring** — delegates via `characterize-with-contracts` (contract-testing-roster / mocking-strategy-roster)
- **Never proceeds to refactoring** — out of scope; hand off the verdict and stop

## Why this shape

The harness locks in current behavior before anyone touches it: a green-before-refactor gate (S4) requires the full suite green against unmodified code. On CONCERNS, the human decides (B10) to proceed at acceptable risk or strengthen the net first.

> « A characterization test is a test that characterizes the actual behavior of a piece of code. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Allowed customisation

- Existing contract file supplied if known (otherwise reconstructed from routes)
- Mocking strategy delegated to the roster (Microcks by default)

## See also

- [characterize-with-contracts]({{ "/en/reference/skills/characterize-with-contracts" | relative_url }}) — Skill run (discovery/reconstruction, golden-master tests)
- [brownfield-refactorer]({{ "/en/reference/agents/brownfield-refactorer" | relative_url }}) — Next step: drives the refactor once the verdict is acceptable
- [brownfield-analyst]({{ "/en/reference/agents/brownfield-analyst" | relative_url }}) — Sibling workflow: reverse-engineered PRD
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
