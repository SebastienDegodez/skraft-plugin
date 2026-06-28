<!-- markdownlint-disable-file -->
---
adr: 5
title: Config as Published Language; the dispatch guard as a Conformist consumer
status: Accepted
chosen: Conformist — the guard conforms to the #48 config Published Language (phaseOrder + phaseAgents)
decision: >
  We will treat the generated skraft-framework.config.json (phaseOrder + phaseAgents) as a Published
  Language owned by the #48 config context, and make the dispatch guard a Conformist downstream
  consumer of it — no Anti-Corruption Layer — combining the published shape with recorded state to
  derive the expected next agent.
supersedes: null
date: 2026-06-28
ratified_by: sebastiendegodez (human ratification, 2026-06-28)
---

# ADR-005 — Config as Published Language; the dispatch guard as a Conformist consumer

**Date:** 2026-06-28
**Status:** Accepted
**Deciders:** Solution Architect (US3)

## Context
The guard must know two things to decide: the canonical **order** of phases/agents, and the **current
progress** of the run. #48 already generates `plugins/skraft-framework.config.json` with `phaseOrder`
and `phaseAgents.{phase}.{specialist,reviewer}`. This file is not an internal detail of the guard — it
is the **framework-wide contract** that #48 publishes and that the rest of the pipeline already
consumes. The open question for this story is therefore a **context-mapping** one: what relationship
does the guard (downstream) hold to the config context (upstream)?

Two upstream/downstream patterns are live candidates. An **Anti-Corruption Layer** would translate the
published config into a guard-private model, insulating the guard from upstream change at the cost of a
redundant translation layer the guard does not need. A **Conformist** relationship has the guard adopt
the published shape verbatim, accepting coupling to it in exchange for zero translation and automatic
propagation of any phase reorder, agent rename, or `skipPhases` change (AC-01 rows a/b/e depend on
advance, skip, and `skipPhases` semantics).

## Decision
We will treat the generated `skraft-framework.config.json` as a **Published Language** owned by the #48
config context, and make the guard a **Conformist** downstream consumer of it — **no Anti-Corruption
Layer**. The policy reads the published JSON shape (`phaseOrder` + `phaseAgents`) directly as its
ordering source, and reads the recorded state as its progress source. `expectedNextAgent` resolves the
next agent name *only* from `config.phaseAgents`, advancing through `config.phaseOrder` while skipping
`state.skipPhases`; the retry budget is read as `config.retryBudget ?? 3`.

**Core language vs. conformed vocabulary (why a Core subdomain may conform here).** The guard's
**Core** Ubiquitous Language — `expected-next-agent`, `dispatch decision`, `deny`/`block`,
`out-of-order` — is wholly *owned* by this context and never conformed to anything. What the guard
conforms to is only the **generic config vocabulary** (`phaseOrder`, `phaseAgents` and the literal
phase/agent *names*), which carries no behaviour and which the guard never translates. Because no
translation occurs and the Core decision language is never surrendered, this is a genuine
**Conformist** relationship, not a disguised Anti-Corruption Layer — and the Core subdomain stays
protected.

## Consequences
**Positive:**
- Conforming to the Published Language means phase reorders, agent renames, and skip changes flow
  through automatically — no policy edit, no parallel guard model to maintain.
- Config and state have a clean single responsibility each (order vs progress).
- The guard tracks the same contract the rest of the framework already publishes (#48) — one shared
  language, no divergent dialect.
- **As a consequence of conforming, the policy contains no literal phase name and no literal agent
  name** — "no hardcoding" falls out of the context-mapping choice; it is an effect, not the decision.

**Negative / trade-offs:**
- Conformist coupling: a breaking change to the published config schema breaks the guard directly,
  with no ACL to absorb it (accepted — the config is a first-party, generated, stable contract).
- The policy is only as correct as the generated config — a bad config produces a bad expectation
  (mitigated upstream by the build-time `dispatch-policy.mjs` presence invariant).
- Two inputs to thread through every decision instead of one.

**Neutral:**
- `retryBudget` becomes a recognised (optional) config key, defaulting to 3 when absent.

## Alternatives rejected

| Alternative | Reason rejected |
|---|---|
| Anti-Corruption Layer over the config (guard-private model) | Adds a translation layer the guard does not need; the config is already a first-party Published Language consumed framework-wide — insulation buys nothing here and duplicates derivation logic |
| Hardcode `phaseOrder`/agent names in the policy | Refuses the Published Language entirely; drifts from config on any reorder/rename and reintroduces exactly the wrong-agent class #49 targets |
| Read agent descriptors / front-matter directly in the policy | Bypasses the published config contract #48 provides and duplicates its derivation logic in the guard (a second, divergent reading of the same upstream) |
| Infer order from the recorded state alone | The state records progress, not the canonical order; cannot decide "skipped a phase" without the published config |
