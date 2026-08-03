---
layout: doc
lang: en
title: "ordered-test-list"
description: "Use when starting any non-trivial feature, fix, or refactoring with TDD: plan an ORDERED test list (BDD semantics + TPP transformation + logical contradiction) before any production code, then execute it one test at a time."
persona: tech-lead
---

# ordered-test-list

> Before a single line of production code: an ordered test list across the three pyramid levels, each entry carrying its TPP transformation and the logical contradiction that justifies it.

## When to use

- At the start of the DELIVER phase, before the first RED — planning precedes code
- As soon as a feature is complex and the temptation is to generate the code in one block
- Alongside [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) (levels and boundaries) and [red-synthesize-green]({{ "/en/reference/skills/red-synthesize-green" | relative_url }}) (cycle mechanics)

## Entry contract

- Expected behaviour: Gherkin scenario, INVEST story or bug report
- Outer acceptance test already written in DISTILL (it stays RED)
- Existing code (possibly empty)

## Exit contract

- Ordered test list, persisted in `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/test-list-{story}.md`
- Per entry: level (unit / integration / e2e), BDD semantics, TPP transformation, logical contradiction
- A re-planning log whenever the order changes along the way

## Invariants

- **Planning first** — no production code before the list exists in writing
- **One test at a time** — the list is consumed head-first, never in parallel
- **Declared transformation** — GREEN applies exactly the planned TPP transformation, nothing more
- **Contradiction required** — an entry without a logical contradiction is a redundant test: drop it
- **Tracked re-planning** — reordering is allowed, silent reordering is not

## Why this shape

The TPP ranks code transformations from the simplest to the most complex. Picking, at each step, the highest transformation in the list prevents the design jump: the design emerges by accumulating micro-steps instead of by anticipation.

> « As the tests get more specific, the code gets more generic. »
> — Martin, R. C., *The Transformation Priority Premise*, 2013.

Test order is therefore not an organisational detail: it decides the sequence in which design is allowed to appear. The written list makes that order auditable — and the FLFI rule (Failing, Least, Fast, Incremental) makes it decidable: degenerate cases first, the general case reached by accumulation.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Pitfalls & anti-patterns

- Writing the list **after** the implementation to document it: that is retro-fitting
- Opening two REDs at once (except the outer acceptance test deliberately left red)
- Implementing, in passing, what a later entry will require
- Merging two entries "to save a cycle": the contradiction disappears, the design stops emerging

## Allowed customisation

- Entry granularity (one entry = one behaviour slice) (L2)
- Split across unit / integration / e2e levels (L2)
- Location of the test-list artifact (L1)

## See also

- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — Pyramid levels and boundaries
- [red-synthesize-green]({{ "/en/reference/skills/red-synthesize-green" | relative_url }}) — RED → GREEN mechanics for each entry
- [test-design-mandates]({{ "/en/reference/skills/test-design-mandates" | relative_url }}) — Which cases deserve a test
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Agent producing and consuming the list
