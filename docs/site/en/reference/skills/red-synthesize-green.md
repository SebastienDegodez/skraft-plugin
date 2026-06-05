---
layout: doc
lang: en
title: "red-synthesize-green"
persona: tech-lead
---

# red-synthesize-green

> TDD implementation cycle: RED (failing test) → GREEN (minimal implementation) → REFACTOR (cleanup without regression).

## When to use

- During the DELIVER phase, for each code increment
- In combination with [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) for the overall strategy
- Before each [craft-discipline]({{ "/en/reference/skills/craft-discipline" | relative_url }}) checkpoint

## Entry contract

- Acceptance test or unit test to make pass
- Existing code (may be empty on the first cycle)

## Exit contract

- Passing test (GREEN)
- Refactored code without regression
- Ready for the next RED cycle

## Invariants

- **RED required** — Code is only written when a test fails
- **Minimal GREEN** — The simplest implementation that makes the test pass
- **REFACTOR without regression** — Refactoring breaks no existing test
- See [Customisation]({{ "/en/customisation" | relative_url }}) for the full list

## Why this shape

The RED-GREEN-REFACTOR cycle is the fundamental rhythm of TDD. Each micro-iteration produces a verified increment — feedback is immediate.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

The RED phase is a diagnostic: if the test passes immediately, either the test is trivial or the code already does more than necessary. The GREEN phase is a synthesis: write the minimal code. The REFACTOR phase is cleanup: eliminate duplication without changing behaviour.

> « Refactoring is the process of changing a software system in such a way that it does not alter the external behavior of the code. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

## Allowed customisation

- Increment size (micro vs macro) (L2)
- Allowed refactoring rules (L2)
- Commit frequency (L1)

## See also

- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — Overall TDD strategy
- [craft-discipline]({{ "/en/reference/skills/craft-discipline" | relative_url }}) — Self-discipline checkpoints
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Agent that uses this skill
