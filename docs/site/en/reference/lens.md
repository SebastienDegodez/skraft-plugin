---
layout: doc
lang: en
title: "Review lenses"
description: "The 4 adversarial review lenses: their angle of attack and what they oppose to the produced work."
---

# Review lenses

> A *lens* is an adversarial angle of attack. The DELIVER reviewer does not read the
> code "in general": it examines it 4 times, from 4 independent angles, then
> synthesises a weighted verdict.

## Why — the problem it solves

A single reader has blind spots: they validate what they already know to look for. By
breaking the review into independent lenses, each weakness is hunted *for its own
sake* — by a lens whose sole mission it is. None may "let it slide" on behalf of the
others.

## Key concepts — how it works

| Lens | Angle of attack | What it opposes |
| --- | --- | --- |
| **cold-reader** | Reads code and tests **with zero prior context**. | Verifies business language, naming clarity, intent visibility. |
| **architecture-boundaries** | Verifies the **dependency direction** of Clean Architecture. | No mocks in Domain/Application, Object Calisthenics on the Domain. |
| **test-integrity** | Hunts **test theater** and Iron Rule violations. | Tests that assert nothing, tests coupled to implementation, fake RED/GREEN. |
| **quality-gates** | Falsifies the quality-gates **evidence log** against the Git tree. | Read-only: confronts what is declared with what is actually committed. |

The 4 verdicts are **weighted** then synthesised (Genesis A7 pattern): a single BLOCKER
on one lens is enough to reject.

### Conditional fidelity lenses (DELIVER)

On top of the 4 CORE lenses, two fidelity lenses join the panel **only when the
matching capability is active**. They enter when the `software-engineer` has
delegated test wiring to a worker (see the
[DELIVER fan-out]({{ "/en/explanation/pipeline/deliver" | relative_url }})).

| Lens | Activated when | What it opposes |
| --- | --- | --- |
| **mock-fidelity-lens** | `mock-integration-worker` wired a mock. | Does the mock faithfully reflect the downstream contract (statuses, headers, error shapes) rather than a complacent double? |
| **contract-fidelity-lens** | `contract-testing-worker` wired a contract test. | Does the test actually cover the provider contract (schema, codes, ProblemDetails) without bypassing it? |

They follow the same synthesis rule: a BLOCKER on a conditional lens rejects just like
a CORE lens.

## Why this practice

> « The combined attention of several reviewers finds defects a single reader misses. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Several independent lenses are the automated equivalent of several reviewers with
complementary skills.

## Pitfalls & anti-patterns

- **Redundant lens**: two lenses hunting the same thing waste effort without reducing
  blind spots.
- **Soft synthesis**: if the synthesis averages verdicts instead of honouring BLOCKERs,
  a critical flaw slips through.

## Going further

- [Gates crossed per phase](gates.html)
- [The review-before-review deep dive]({{ "/en/explanation/deep-dive/review-before-review" | relative_url }})

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Terms to know: **lens**, **test theater**, **Iron Rule of tests**, **Object
Calisthenics** — see the [glossary]({{ "/en/reference/glossary" | relative_url }}).
