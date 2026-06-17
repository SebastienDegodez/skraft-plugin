---
layout: doc
lang: en
title: "test-refactoring-catalog"
description: "Use when refactoring tests — extracting helpers, renaming for business clarity, deduplicating fixtures, consolidating..."
persona: tech-lead
---

# test-refactoring-catalog

> Catalog of safe test-code transformations — each transformation preserves behavioral coverage while improving readability, maintainability, and signal-to-noise ratio.

## When to use

- After GREEN: tests pass, you notice duplication or unclear naming
- During COMMIT & VERIFY: cleanup before commit, no new behavior added
- Reviewing test code that smells (long arrange, repeated setup, cryptic names)

## Entry contract

- Fully green test suite
- GREEN phase reached and confirmed
- Production code stabilised (no parallel production refactoring)

## Exit contract

- Tests refactored according to catalog rules R1–R7
- Test suite still green after each applied transformation
- No behavioral coverage lost

## Invariants

- **Every transformation preserves behavior** — suite green before AND after; run the suite before each application
- **Immediate revert if red** — any test turning red during refactoring → revert before continuing
- **No new behavior** — the catalog restructures; it does not add test cases
- **R6 — Single-use helper = noise** — a helper called once is inlined, not extracted
- **R3 — Same scenario only** — methods consolidate into `[Theory]` only if they represent the same behavior class; different assertions = different scenarios

## Why this shape

A well-named test is an executable specification. Refactoring tests improves living documentation without touching coverage. The R1–R7 decision flow prevents over-engineering: each transformation responds to a specific smell and stops there.

> « Any fool can write code that a computer can understand. Good programmers write code that humans can understand. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

The behavior-preservation rule applies with the same rigour as the Iron Rule of Tests: no deletion, no neutralisation.

## Allowed customisation

- Helper naming conventions (prefix `A`, `An`, `Create` + business noun) (L1)
- Test naming pattern (`When<Condition>_Should<Outcome>`) (L1)
- R3 consolidation threshold (number of similar methods before merging) (L2)

## See also

- [craft-discipline]({{ "/en/reference/skills/craft-discipline" | relative_url }}) — Self-discipline checkpoints before commit
- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — TDD cycle (REFACTOR phase)
- [test-design-mandates]({{ "/en/reference/skills/test-design-mandates" | relative_url }}) — Test design mandates
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Agent that executes this catalog
