---
layout: doc
lang: en
title: "craft-discipline"
persona: tech-lead
---

# craft-discipline

> Self-discipline checkpoints the engineer runs after each TDD phase, before considering the work complete.

## When to use

- After completing a TDD phase (RED, GREEN, REFACTOR)
- Before submitting code to the reviewer
- As a personal checklist, not a review contract

## Entry contract

- Code and tests being implemented
- Identified TDD phase (RED, GREEN, or REFACTOR)

## Exit contract

- Checklist validated by the engineer themselves
- Confidence that the deliverable is ready for review

## Invariants

- **Self-assessment, not review** — This skill is a personal checkpoint; the reviewer verifies independently
- **No shortcut** — Each checklist item is verified, not "globally OK"
- See [Customisation]({{ "/en/customisation" | relative_url }}) for the full list

## Why this shape

Craft discipline is personal hygiene. Clean code is not code that survived a review — it is code the author consciously verified before submitting.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

Self-discipline reduces noise in review cycles: the reviewer can focus on real problems rather than trivial oversights.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Allowed customisation

- Checklist items (L1)
- Quality thresholds (complexity, duplication) (L2)
- Checkpoint frequency (L2)

## See also

- [red-synthesize-green]({{ "/en/reference/skills/red-synthesize-green" | relative_url }}) — TDD cycle
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Agent that uses this skill
- [software-engineer-reviewer]({{ "/en/reference/agents/software-engineer-reviewer" | relative_url }}) — The reviewer that verifies independently
