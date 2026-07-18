---
layout: doc
lang: en
title: "strangler-fig-method"
description: "Replace part of a brownfield system incrementally — behind a routing facade, slice by slice, verified by contract equivalence against a green net."
persona: tech-lead
---

# strangler-fig-method

> Replaces a component by growing a new implementation alongside the old one, behind a facade that routes traffic, slice by slice, until the old one has no callers left and can be deleted.

## When to use

- Replace a component too coupled to restructure in place, or targeting a different stack/design
- Loaded internally by [brownfield-refactorer]({{ "/en/reference/agents/brownfield-refactorer" | relative_url }}) when the human chooses replacement over Mikado

## Precondition

Same green safety net as Mikado ([characterize-with-contracts]({{ "/en/reference/skills/characterize-with-contracts" | relative_url }})) — here replayed against BOTH the old and the new implementation; a slice only cuts over when NEW is contract-equivalent to OLD on every harness test.

## Procedure (summary)

1. **Facade** — introduce (or confirm) a routing seam; otherwise the facade is slice zero (transparent, verified against OLD only)
2. **Slice** — partition the contract into independently-cutover-able slices (default: one per endpoint)
3. **Build NEW** — implement one slice, replay the same characterization tests against NEW (contract equivalence)
4. **Cutover gate (S4)** — cut over only if NEW tests pass (same assertions as OLD) AND the full harness stays green
5. **Strangle** — repeat; once OLD is unreachable, remove OLD + the facade's OLD branch (final slice)

## Exit contract

- Persisted slice plan (table): `strangler-<slug>.md` — one row per slice (contract surface, status, cutover verdict)
- Each slice routed to NEW after a green cutover; OLD removed as a final slice

## Invariants

- **Never silently absorbs a behavior difference** — any NEW-vs-OLD difference is a human decision
- **Never cuts over without replaying the FULL harness** — a slice can look correct in isolation while breaking a cross-slice interaction
- **Never skips the facade-transparency check (slice zero)**
- **Never deletes OLD before confirming zero traffic** — verify unreachability
- Worker signals: `ADVANCE` / `EXPAND` / `DONE` / `BLOCKED`

## Why this shape

The facade contains the blast radius: each slice cuts over independently, with fine-grained rollback, and contract equivalence is verified by the same tests against both implementations.

> « Gradually create a new system around the edges of the old, letting it grow slowly over several years until the old system is strangled. »
> — Fowler, M., *Bliki: StranglerFigApplication*, 2004.

## Allowed customisation

- Slice granularity (default: one per endpoint/route)
- Facade seam type (gateway route, feature flag, proxy)

## See also

- [brownfield-refactorer]({{ "/en/reference/agents/brownfield-refactorer" | relative_url }}) — Agent that loads this skill and drives the loop
- [refactoring-worker]({{ "/en/reference/workers/refactoring-worker" | relative_url }}) — Implements/cuts over each slice in a fresh context
- [mikado-method]({{ "/en/reference/skills/mikado-method" | relative_url }}) — Alternative strategy (in-place restructuring)
- [characterize-with-contracts]({{ "/en/reference/skills/characterize-with-contracts" | relative_url }}) — Precondition: the green safety net
- [Brownfield]({{ "/en/explanation/brownfield" | relative_url }}) — Family overview
