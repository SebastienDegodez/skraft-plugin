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
| Mutation score | 100% | Domain, Application |
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
| ADR for non-trivial decisions | blocking |
| Object Calisthenics (Domain) | blocking |

A gate that cannot run is not a passed gate. Report it as a failure and stop.

## Running the gate

The engine runs each gate from the component's `commands` in `skraft-config.json` and keeps
the evidence; a gate's exit code is its verdict. The `quality-gates-<stack>` skill of each
component holds the default command lines and the two durable scope configs:

1. **Core first** -- Domain and Application, expects 100.
2. **Boundary second** -- API and Infrastructure, expects 80.

Boundary never runs while core is red.

## Threshold flags

Stated once so recipes copy rather than invent. The `quality-gates-<stack>` scripts and config scaffolds
carry each value as a literal, and guard tests assert those literals still equal the
table above — checked restatements, not independent definitions.

| Scope | Mutation | Coverage |
| --- | --- | --- |
| Domain, Application | `thresholds.break = 100` in the checked-in core Stryker config (written by the skill's scaffold) | 100% line coverage, enforced by the skill's coverage script |
| API, Infrastructure | `thresholds.break = 80` in the checked-in boundary config | not gated on coverage |

The runner reads the threshold from its config and exits non-zero below it; the
coverage script exits non-zero below the bar. That exit code is the verdict. A run
whose score is read from a report and judged in prose is not a gate — it is an
opinion about a gate. No caller argument sets a threshold: the scripts refuse one.
