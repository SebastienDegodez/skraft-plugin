---
layout: doc
lang: en
title: "Token economy"
description: "Why an agentic pipeline's cost is a design-time architectural form, not a runtime setting — and how SKRAFT holds it via the Genesis discipline levers."
---

# Token economy

> The cost of an agentic pipeline is not a dial to turn in production: it is a
> constraint of form, decided at design time, like a memory budget or an acceptable
> latency target.

## The thesis

In the product-development literature, the cost of a batch of work is determined long
before execution — by batch size, dependencies, and the number of feedback loops.
Donald Reinertsen puts it this way:

> « The cost of queuing delays is determined by the shape of the flow, not by the
> speed of individual activities. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

Applied to an agent pipeline, the insight translates directly: the tokens consumed by
a SKRAFT run are not driven primarily by the content of the user's request, but by the
**architectural form of the pipeline** — how many agents are instantiated, which tools
they see, which model class is allocated to each role, and how often the context must
be reloaded from scratch.

That form is decided when the agents and skills are written, not when they are
invoked. This is why SKRAFT treats the token economy as a design invariant — a budget,
not a hope.

## The levers

SKRAFT applies five levers from the Genesis discipline to hold that budget. Each lever
acts on a distinct dimension of spend.

| Lever | What it does |
|-------|--------------|
| **Cache discipline** | System prompts and shared instructions are designed to be *reloaded* between turns without recomputation — anything that can be KV-cached is, and message structure guarantees it. |
| **Class by role** | The orchestrator and reviewers run on a *frontier*-class model (broad reasoning, low frequency); specialist agents — implementer, planner, researcher — run on a *capable*-class model (high frequency, bounded tasks). |
| **Tool surface** | No agent receives a full MCP catalogue. Each agent sees only the tools it needs for its specific task. Every superfluous tool is an invitation to reason unnecessarily. |
| **Depth (`depthTier`)** | The depth of each run is governed by `depthTier` (shallow / standard / deep): fan-out to 1, 2, or 4 adversarial lenses; mutation score threshold; Gherkin gate enabled or not. A *shallow* run does not instantiate the full reviewers. |
| **Structural pruning** | On an incoming HVE handoff, the DISCOVER phase is skipped: the backlog and prioritisation arrive already formed. The pipeline does not re-execute what it has no reason to recompute. |

These levers are not independent. Cache discipline and role-class allocation reinforce
each other: a *capable* model reloaded from the KV cache costs a fraction of what a
*frontier* model recomputed from scratch would. Tool surface and depth together limit
the decision surface inside each turn, which shortens responses and reduces the context
window required.

## Without cutting quality

The economy described here comes exclusively from **form**: caching, model class,
output volume, allocated effort. It never touches the mechanisms that guarantee the
reliability of deliverables.

The adversarial review lenses, their weights, their synthesis protocol, and the
acceptance score threshold are outside the scope of the token economy. Reducing the
number of lenses or lowering thresholds is not a cost lever — it is a quality
degradation. To understand why these safeguards are non-negotiable, see the page
[Review before review]({{ "/en/explanation/why-review-before-review" | relative_url }}).

The distinction matters in practice: when a run exceeds an estimated (estimated) token
budget, the first question is not "which reviewers can we disable?" but "which form
lever has not yet been applied?"

## What is in place — what is coming

### In place

The `cost_role_class` annotations in the phase agents allocate the correct model class
to each role. The `depthTier` field in `state.json` governs the lens fan-out and the
activation of optional gates. These two mechanisms are the principal governor of spend
at present.

### Designed, not yet implemented

The largest lever not yet activated is the **out-of-LLM verdict schema**: having
review verdicts rendered in a structured format (JSON), then transformed into a
Markdown report by a template engine — without routing through the model for
formatting. Today that rendering is still delegated to the LLM, which represents a
non-trivial tax on reviewer output (estimated). This lever is designed; its
implementation is not yet in the main pipeline.

## See also

- [Key concepts]({{ "/en/explanation/concepts" | relative_url }}) — phases, agents, gates, artifacts
- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — how the agents assemble
- [The HVE-Core substrate]({{ "/en/explanation/hve-core" | relative_url }}) — the foundation SKRAFT builds on
- [Review before review]({{ "/en/explanation/why-review-before-review" | relative_url }}) — why the lenses are non-negotiable
- [Reference: patterns]({{ "/en/reference/patterns" | relative_url }}) — the complete Genesis pattern catalogue

## Sources

> « The cost of queuing delays is determined by the shape of the flow, not by the
> speed of individual activities. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.
