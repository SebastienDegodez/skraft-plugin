---
name: skraft-quality-bar
description: Use before running, verifying, or reporting any quality gate. States the one permanent threshold for mutation score and line coverage, and the enforcement level of every gate. Load when about to invoke a mutation run, when deciding whether a gate blocks or merely warns, when writing or reviewing an evidence record, when a skill or descriptor appears to state a threshold of its own, and whenever a number would otherwise be copied from memory or from an older document. There are no tiers, no advisory level, and no override. Does not choose the toolchain command (resolving-stack-commands), classify survivors (mutation-testing), define the evidence schema (quality-gates-evidence-contract), or set the reviewer lens count (each review-criteria skill owns its own).
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

The comparison is never made by reading a number and judging it. Each
`quality-gates-<tech>` adapter owns two durable scope configs plus deterministic runners
that return verdicts as exit codes:

1. **Core first** -- Domain and Application, expects 100.
2. **Boundary second** -- API and Infrastructure, expects 80.

Core runs first and short-circuits: there is nothing to learn from mutating adapters
while the domain is unproven. `resolving-stack-commands` detects the stack and routes
to the adapter; the adapter owns the invocation.

For .NET, [configure-mutation.sh](../quality-gates-dotnet/scripts/configure-mutation.sh)
scaffolds `stryker-config-core.json` and `stryker-config-boundary.json` at consumer
repository root. [mutation-core.sh](../quality-gates-dotnet/scripts/mutation-core.sh)
and [mutation-boundary.sh](../quality-gates-dotnet/scripts/mutation-boundary.sh) validate
and execute them. Checked-in configs are also local-debug and CI/CD interface.

## Threshold flags

Stated once so recipes copy rather than invent. Adapter wrappers and config scaffold
carry each scope value as literals, and guard tests assert those literals still equal
the table above -- checked restatements, not independent definitions.

| Scope | Mutation flag | Coverage flags |
| --- | --- | --- |
| Domain, Application | `--break-at 100` | `/p:Threshold=100 /p:ThresholdType=line /p:ThresholdStat=total` |
| API, Infrastructure | `--break-at 80` | not gated on coverage |

`--break-at` makes the runner itself exit non-zero below the bar. That exit code is
the verdict. A run whose score is read from a report and judged in prose is not a
gate -- it is an opinion about a gate.
