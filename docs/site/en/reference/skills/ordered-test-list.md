---
layout: doc
lang: en
title: "ordered-test-list"
persona: tech-lead
---

# ordered-test-list

> DELIVER enforcement skill: strict one-test-at-a-time progression with TPP + FLFI.

## When to use

- During DELIVER, when implementation is driven by TDD increments
- With [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) and [red-synthesize-green]({{ "/en/reference/skills/red-synthesize-green" | relative_url }})
- Before each production edit, to freeze active test order

## Entry contract

- Ordered test list for active behavior slice
- One identified active test (`pending` → `red` → `green`)
- Existing acceptance/unit suite to run regressions

## Exit contract

- Active test moved to `green` with execution proof
- Ordered list cursor advanced to next test
- Regression checks green before moving forward

## Invariants

- **TPP** — Advance with smallest next test step (constant, triangulation, boundary, error path)
- **FLFI** — First failing test is only active fix target
- **Single active test** — No parallel test progression in same increment
- **No hidden reorder** — Test list order is stable during active slice
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

Strict ordering prevents batch implementation and protects feedback quality. The agent always knows which test currently authorizes production code.

## Allowed customisation

- Granularity of ordered list (scenario-level vs test-level) (L2)
- Regression scope after each green (single suite vs module suite) (L2)
- Escalation threshold when first failing test stays red (L1)

## See also

- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — Global strategy
- [red-synthesize-green]({{ "/en/reference/skills/red-synthesize-green" | relative_url }}) — RED/GREEN mechanics
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Agent using this skill
