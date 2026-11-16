---
name: skraft-quality-bar
description: Use before judging, reviewing or reporting any quality gate. States the one permanent threshold for mutation score and line coverage, and the enforcement level of every gate. Load when deciding whether a gate blocks, when reviewing a gate result, when a skill or descriptor appears to state a threshold of its own, and whenever a number would otherwise be copied from memory or from an older document. There are no tiers, no advisory level, and no override. Does not choose the gate commands (the component's commands in skraft-config.json and its quality-gates-<stack> skill), classify survivors (quality-gates-<stack>), or set the reviewer lens count (each review-criteria skill owns its own).
---
<!-- markdownlint-disable-file -->

# SKRAFT Quality Bar

The single place a threshold is authored. Every other mention in this framework is a
reference to this file, never a second definition.

There is no strictness dial. The bar below applies to every repository, every work
item, and every phase. A previous version of this framework carried a `depthTier`
setting that could lower it; that dial is gone, and with it the `advisory` and
`warning` levels and the rationale that used to buy an exemption.

## The bar

| Gate | Value | Scope |
| --- | --- | --- |
| Mutation score | 80% | Domain, Application |
| Mutation score | 80% | API, Infrastructure |
| Line coverage | 100% | Domain, Application |

TDD variant is Outside-In double-loop, always. `outside-in-tdd` owns the sequence.

## Enforcement

Every gate blocks. There is no advisory level, no warning level, no override, and no
rationale that grants an exemption.

| Gate | Level |
| --- | --- |
| Clean Architecture boundaries | blocking |
| TDD cycle respected | blocking |
| Test integrity | blocking |
| Mutation Domain/Application meets the bar | blocking |
| Mutation API/Infrastructure meets the bar | blocking |
| Gherkin gate (user-approved scenarios) | blocking |
| ADR for non-trivial decisions the architecture documents do not already state | blocking |
| Object Calisthenics (Domain) | blocking |

A gate that cannot run is not a passed gate. Report it as a failure and stop.

## Running the gate

The engine runs each gate from the component's `commands` in `skraft-config.json` and keeps
the evidence. Every gate takes its exit code as its verdict.

Mutation testing is the developer's: the story's pipeline runs no mutation, and skraft ships no
mutation script or config. The developer's mutation run (`workflows/mutation.skraft.dot`) runs
each component's `mutation` command and judges each scope against the bar above:

- **Core** -- a file under a folder whose name ends with the word `domain` or `application`
  (`Checkout.Domain`, `orders-application`, `src/<feature>/application`), relative to the
  component root: 80.
- **Boundary** -- every other file: 80.
- **Global** -- the one scope of a single project, when the command computes its score so: 80.

The command may write its result, score already computed, to the file `SKRAFT_MUTATION_RESULT`
names: `{ "scopes": [{ "name": "core" | "boundary" | "global", "score": <percent>, "survivors":
["<file>:<line> <detail>"] }] }`. That result is judged; without it, the report the stack's tool
writes at its default path, whatever exit code a finished run returns. A result or report that
cannot be read fails the gate as environment.

## Threshold flags

| Scope | Mutation | Coverage |
| --- | --- | --- |
| Domain, Application | `thresholds.break = 80` in the developer's core mutation config | 100% line coverage, enforced by the `quality-gates-<stack>` coverage script |
| API, Infrastructure | `thresholds.break = 80` in the developer's boundary mutation config | not gated on coverage |

The coverage script exits non-zero below the bar and refuses a threshold argument. A score
judged in prose is not a gate — it is an opinion about a gate.
