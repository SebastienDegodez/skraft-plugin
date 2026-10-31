---
layout: doc
lang: en
title: "DESIGN"
description: "Why DESIGN makes every architecture decision explicit, reuses before creating, has the lenses review it and a human ratify it before any specification."
persona: software-engineer
---
{% assign cites = "/en/reference/citations" | relative_url %}

# DESIGN

{% include phase-ribbon.html current="design" %}

> Decide, write it down, have it ratified: DESIGN turns a story into explicit architecture
> decisions, and none reaches specification until a human has accepted it.

## Why this phase exists

Without explicit decisions, every developer — and every agent — invents their own structure, and
the next one contradicts it unknowingly. DESIGN fixes the shape of the solution before a test is
written: the `solution-architect` models the story's flow as events, places the context
boundaries, chooses the patterns, then records each structural decision in an **ADR**
(Architecture Decision Record) with its context, options and consequences.

The model is not one more deliverable: it is the language the team, the business and the code
share ([Evans, 2003]({{ cites }}#cite-evans-ddd-2003)). The why of this approach, from the
ubiquitous language to aggregates, is developed in
[Domain-Driven Design]({{ "/en/explanation/domain-driven-design" | relative_url }}); the
dependency rule the contracts follow, in
[Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}).

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The ordering story enters. DESIGN proposes an **ADR** "delegate payment to an external provider
via an anti-corruption layer (ACL)" and an **event model** `PlaceOrder` → `OrderPaid` →
`OrderReady`. A human ratifies the ADR; this model feeds DISTILL.
</div>

## Reuse before creating

The architect does not start from scratch. It receives the RESEARCH document and a **structural
scan** the engine writes before each of its attempts: the aggregates, contexts and patterns
already present in the components' code. Its first step classifies each existing element —
reused as is, extended or new — citing the research or the scan, and it searches the code only
for what they leave open. A commitment the scan detects with no accepted ADR covering it gets a
catch-up ADR: it becomes a written decision, not a fait accompli.

Before the code, it reads what earlier stories left in the repository: the context map, the
tactical design of each context and the event model under `docs/`, and the ADRs. It completes
those files on the story's branch rather than rewriting them, so the pull request shows what
changed in the model. When they already cover the story, the architect says so in its consistency
matrix, cites them and moves on.

This choice saves tokens, but above all it prevents a design that ignores what exists: the scan
is the same source the lenses read afterwards.

## Review, then ratify

Three lenses review the design, each in a fresh context: **consistency** across ADRs, diagrams,
contracts and event model; **compliance** with the architecture (the dependency rule, where
interfaces live, relations between contexts); **fitness** of the patterns, which refuses any
aggregate or pattern no story justifies. The engine also checks, with no lens, the traces a
human should not have to reread: consistency matrix, naming and register of superseded ADRs, the decisions index, and the ADR rules (no version, a one-sentence decision, a closed status vocabulary, a published ADR changed only in its status lines).

The review happens **before** ratification. A human thus only reads ADRs that are already
consistent; they answer `RATIFIED` or `REJECTED` with a reason that goes back to the architect.
Only the engine moves an ADR to `Accepted`, after that answer. No agent can ratify in the human's
place: an architecture decision commits the team, not the model that proposed it.

## Trade-offs

- **The run waits for a human.** Without an answer it stays waiting; that is intended. An ADR
  accepted by default would only be a suggestion.
- **A published ADR is not rewritten silently.** Once on the base branch, it is superseded or
  amended; until then it is corrected in place. The decision history stays readable without
  filling up with stillborn ADRs.

## Going further

- [Reference: DESIGN]({{ "/en/reference/phases" | relative_url }}#design) — nodes, outputs, engine checks, edges.
- [Reference: DESIGN review criteria]({{ "/en/reference/gates" | relative_url }}#design).
- [Reference: unpublished ADRs]({{ "/en/reference/run-journal" | relative_url }}#unpublished-adrs).
- [Reference: durable documentation]({{ "/en/reference/run-journal" | relative_url }}#durable-docs) — what goes to `docs/`, what stays in the tracking folder.
- [DISTILL]({{ "/en/explanation/pipeline/distill" | relative_url }}) — the next phase.

## Sources

- [Evans, E. *Domain-Driven Design*, 2003.]({{ cites }}#cite-evans-ddd-2003)
