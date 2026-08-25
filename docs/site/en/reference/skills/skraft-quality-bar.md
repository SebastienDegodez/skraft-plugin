---
layout: doc
lang: en
title: "skraft-quality-bar"
description: "The single place a quality threshold is authored. States the permanent mutation and coverage bars and the enforcement level of every gate."
persona: tech-lead
---

# skraft-quality-bar

> The one place a threshold number is written down. Every other mention in the framework references this skill instead of restating it.

## When to use

- Before running, verifying, or reporting any quality gate
- When about to invoke a mutation run
- When deciding whether a gate blocks or merely warns — it always blocks
- When writing or reviewing an evidence record
- When another skill or descriptor appears to state a threshold of its own
- Whenever a number would otherwise be copied from memory or from an older document

## The bar

| Gate | Value | Scope |
|---|---|---|
| Mutation score | 100% | Domain, Application |
| Mutation score | 90% | API, Infrastructure |
| Line coverage | 100% | Domain, Application |

There is no strictness dial. A previous version of the framework carried a `depthTier` setting that could lower these; it was removed, and with it the `advisory` and `warning` levels and the rationale that used to buy an exemption.

## Enforcement

Every gate blocks: Clean Architecture boundaries, TDD cycle respected, test integrity, both mutation scopes, the Gherkin gate, an ADR for non-trivial decisions, and Object Calisthenics on Domain.

A gate that cannot run is not a passed gate. Report it as a failure and stop.

## Running the gate

The comparison is never made by reading a number and judging it. Each `quality-gates-<tech>` adapter bundles two scripts:

1. **Core first** — Domain and Application, expects 100
2. **Boundary second** — API and Infrastructure, expects 90

Core runs first and short-circuits: there is nothing to learn from mutating adapters while the domain is unproven. `--break-at` makes the runner itself exit non-zero below the bar, and that exit code is the verdict.

## Invariants

- **One definition site** — a threshold literal is authored here and nowhere else; adapter scripts carry a copy that a guard test holds equal to this table
- **No override** — no setting, tier, or rationale lowers the bar
- **Exit code, not opinion** — a score read from a report and compared in prose is not a gate

## Boundaries

Does not choose the toolchain command (`resolving-stack-commands`), classify survivors (`mutation-testing`), define the evidence schema (`quality-gates-evidence-contract`), or set the reviewer lens count — each review-criteria skill owns its own.
