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
| **Class by role** | Each agent carries a B12 target class — `implementer`, `planner`, or `reviewer`. Artifact producers (discoverer, planner, architect, engineer) receive the most capable class; phase reviewers and lenses, whose task is bounded, receive the cheapest class that holds the work. Two roles are an exception and require a *Sonnet-class or above* model regardless of role: `software-engineer` and `software-engineer-reviewer` (multi-constraint arbitration). |
| **Tool surface** | No agent receives a full MCP catalogue. Each agent sees only the tools it needs for its specific task. Every superfluous tool is an invitation to reason unnecessarily. |
| **Depth (`depthTier`)** | The depth of each run is governed by `depthTier` (shallow / standard / deep): fan-out to 1, 2, or 4 adversarial lenses; mutation score threshold; Gherkin gate enabled or not. A *shallow* run does not instantiate the full reviewers. |
| **Structural pruning** | On an incoming HVE handoff, the DISCOVER phase is skipped: the backlog and prioritisation arrive already formed. The pipeline does not re-execute what it has no reason to recompute. |

These levers are not independent. Cache discipline and role-class allocation reinforce
each other: a low-class model reloaded from the KV cache costs a fraction of what a
high-class model recomputed from scratch would. Tool surface and depth together limit
the decision surface inside each turn, which shortens responses and reduces the context
window required.

## Measured results

The first two levers — cache discipline and model class — were measured on a real run
of the SKRAFT pipeline executed as an *agentic workflow* (gh-aw), via the harness's
*Effective Tokens* (ET v0.2.0) schema. The figures below come from the `agent_usage.json`
files emitted by eight agent and reviewer executions — they are not estimated.

### Cache discipline — −42.6% effective tokens

The KV-cache hit rate is stable around **48%** of total input across the eight
executions. The ET schema weights a token read from cache at **0.1×** versus **1.0×**
for a recomputed token — ten times cheaper.

| Effective tokens (8 phases) | Without cache | With cache | Gain |
|---|---|---|---|
| Total | 47.6 M | 27.3 M | **1.74× — −42.6%** |

The gain comes from the **form** of the prompts: a stable system prefix, not rewritten
between turns, stays cache-eligible. This is precisely the lever that
[hooks]({{ "/en/explanation/hooks" | relative_url }}) preserve on the infrastructure
side — an invariant held by code does not shift the prefix, whereas an invariant
re-injected as prose would make it miss.

### Model class — a 27× separation

The same schema applies a per-model multiplier. On this run, two classes were observed:
**9.0×** for the *frontier* class (claude-sonnet-4.6) and **0.33×** for the *capable*
class (claude-haiku-4.5). At equal normalised work, allocating the capable class rather
than frontier therefore costs **9.0 / 0.33 ≈ 27× less** in effective tokens — making the
class choice the dominant multiplier of spend.

*Provenance: gh-aw `SDLC` run on issue #72 of the `meetup-coding-with-ai` repository,
Effective Tokens schema v0.2.0, reference model `claude-sonnet-4.5`.*

## Without cutting quality

The economy described here comes exclusively from **form**: caching, model class,
output volume, allocated effort. It never touches the mechanisms that guarantee the
reliability of deliverables.

The adversarial review lenses, their weights, their synthesis protocol, and the
acceptance score threshold are outside the scope of the token economy. Reducing the
number of lenses or lowering thresholds is not a cost lever — it is a quality
degradation. To understand why these safeguards are non-negotiable, see the page
[Review before review]({{ "/en/explanation/why-review-before-review" | relative_url }}).

The distinction matters in practice: when a run exceeds an estimated token
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
