---
name: skraft-quality-bar
description: Use before running, verifying, or reporting any quality gate. States the one permanent threshold for mutation score (global, developer-owned) and line coverage, and the enforcement level of every gate. Load when about to invoke a mutation run, when deciding whether a gate blocks or merely warns, when writing or reviewing an evidence record, when a skill or descriptor appears to state a threshold of its own, and whenever a number would otherwise be copied from memory or from an older document. There are no tiers, no advisory level, and no override. Does not choose the toolchain command (resolving-stack-commands), classify survivors (mutation-testing), define the evidence schema (quality-gates-evidence-contract), or set the reviewer lens count (each review-criteria skill owns its own).
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
| Mutation score | 80% | each scope: core and boundary (Clean Architecture), or global (single project) |
| Line coverage | 100% | Domain, Application |

Core is Domain and Application; boundary is API, Infrastructure and UI. For line coverage,
Domain and Application are any folder (or .NET project) whose name ends with `domain` or
`application`.

TDD variant is Outside-In double-loop, always. `outside-in-tdd` owns the sequence.

## Enforcement

Every gate blocks. There is no advisory level, no warning level, no override, and no
rationale that grants an exemption.

| Gate | Level |
| --- | --- |
| Clean Architecture boundaries | blocking |
| TDD cycle respected | blocking |
| Test integrity | blocking |
| Mutation meets the bar, when the developer declared a command | blocking |
| Mutation with no declared command | not run, reported |
| Gherkin gate (user-approved scenarios) | blocking |
| ADR for non-trivial decisions | blocking |
| Object Calisthenics (Domain) | blocking |

A gate that cannot run is not a passed gate. Report it as a failure and stop. The one
exception is mutation with no command declared: G6 is `not_run`, never `pass`, and the report
says so.

## Mutation is the developer's responsibility

Mutation testing must be done on every story, and running it is the developer's
responsibility, not SKRAFT's. SKRAFT ships no mutation tool, no mutation config and no
scaffold. The developer:

1. picks the tool (Stryker.NET, StrykerJS, cosmic-ray, mutmut, PIT…) and its configuration;
2. declares, per component in `skraft-config.json`, the command that runs it
   (`components[].commands.mutation`, the v2 shape);
3. makes that command compute the scores and write them as JSON to the file named by
   `SKRAFT_MUTATION_RESULT`: `core` and `boundary` for a Clean Architecture component, `global`
   for a single project; each scope may list its surviving mutants, one `file:line detail` line
   each, which the team can leave out;
4. may set the tool's own break threshold; SKRAFT judges 80% on every scope regardless.

`mutation-testing`'s `mutation-gate` runs each declared command, reads each result and returns
the verdict as its exit code: 0 pass, 1 fail, 2 blocked, 3 not run. You never judge a score by
reading a number. No caller argument sets the bar: the gate refuses one.

A team may run mutation outside the pipeline (`mutation.pipeline: false`, set by
`/skraft-init mutation`): the developer runs `/skraft-mutation`, and DELIVER reuses that run when
it judged HEAD on a clean working copy. With no command declared, or no such run, the gate exits
3 and G6 is recorded `not_run` with its rationale. You
never write the command, the tool config or the result yourself to make G6 run: tell the
developer it is theirs to declare.
