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
| **Execution model by difficulty** | Each work item carries a `difficulty` in `state.json` (`simple`, `medium`, `medium-hard`, `challenging`), assessed once at DISCOVER exit. It decides how DELIVER runs: an inline TDD cycle for the simpler tiers, a sub-agent dispatched per Gherkin scenario plus intermediate artifacts for the harder ones. Effort goes where the work demands it and nowhere else. This is an execution shape, not a strictness setting — it never changes what has to be proven. |
| **Structural pruning** | On an incoming HVE handoff, the DISCOVER phase is skipped: the backlog and prioritisation arrive already formed. The pipeline does not re-execute what it has no reason to recompute. |

These levers are not independent. Cache discipline and role-class allocation reinforce
each other: a low-class model reloaded from the KV cache costs a fraction of what a
high-class model recomputed from scratch would. Tool surface and per-scenario dispatch
both narrow the decision surface inside a single turn, which shortens responses and
reduces the context window required.

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
**9.0×** for the *frontier* class (claude-sonnet-5) and **0.33×** for the *capable*
class (claude-haiku-4.5). At equal normalised work, allocating the capable class rather
than frontier therefore costs **9.0 / 0.33 ≈ 27× less** in effective tokens — making the
class choice the dominant multiplier of spend.

*Provenance: gh-aw `SDLC` run on issue #72 of the `meetup-coding-with-ai` repository,
Effective Tokens schema v0.2.0, reference model `claude-sonnet-4.5`.*

## Without cutting quality

The economy described here comes exclusively from **form**: caching, model class,
output volume, allocated effort. It never touches the mechanisms that guarantee the
reliability of deliverables.

That separation used to be a matter of discipline; it is now a matter of fact. The bar
lives in a single skill, `skraft-quality-bar`, and nothing reads a setting to lower it:
mutation score 100% on Domain and Application and 80% on API and Infrastructure, line
coverage 100% on Domain and Application, all four adversarial lenses on every review,
the Gherkin gate, an ADR for every non-trivial decision, Object Calisthenics on the
Domain. Every gate blocks. The *advisory* and *warning* levels no longer exist, and
neither does the rationale that used to buy an exemption.

The adversarial review lenses, their weights, their synthesis protocol, and the
acceptance score threshold are therefore outside the scope of the token economy.
Reducing the number of lenses or lowering thresholds is not a cost lever — it is a
quality degradation, and it is no longer expressible. To understand why these
safeguards are non-negotiable, see the page
[Review before review]({{ "/en/explanation/why-review-before-review" | relative_url }}).

### What that costs

Stated plainly: the framework no longer trades strictness for tokens. The repo-wide
depth dial that once did exactly that — fanning review out to 1, 2, or 4 lenses,
scoping the mutation runs, switching the Gherkin gate on or off — has been removed, and
it was also the pipeline's cost governor. Every run now pays the full shape: four
lenses on every review, both sequenced mutation runs, the Gherkin gate always on. That
is a real and permanent increase in the floor cost of a run, and nothing on the quality
side offsets it. The repository owner accepted the trade deliberately: quality is not
negotiable, and a dial that lets a run buy its way under the bar is not a saving — it
is a deferred defect.

What remains — and it is the larger half of the spend — is the form levers: model
class, cache discipline, tool surface, output volume, structural pruning. The
distinction matters in practice: when a run exceeds an estimated token budget, the first
question is not "which reviewers can we disable?" — that question no longer has an
answer — but "which form lever has not yet been applied?"

## What is in place — what is coming

### In place

The model class is **actually applied**: a deterministic resolver (`plugins/skraft-framework/src/`,
Clean Architecture, zero dependencies) reads each agent's `cost_role_class` and
`model_requirement` floor, then **pins the `model:` field** of its `.md` descriptor to the
resolved concrete model. The "Measured results" section states the policy:
`reviewer → claude-haiku-4.5`, `implementer → claude-sonnet-4.5`,
`planner → claude-sonnet-5`, with the Sonnet floor raising the two exceptions
(`software-engineer`, `software-engineer-reviewer`). One source of truth; a CI linter
(`resolve-model --check`) fails if an agent drifts from the policy. Together with cache
discipline, that resolver is the principal governor of spend at present — and now the
only one: the depth dial that used to share the job is gone, so the quality side of a
run is a fixed cost rather than a variable one. The mutation gate illustrates it: each
`quality-gates-<tech>` adapter bundles two sequenced scripts, core (Domain,
Application) then boundary (API, Infrastructure), each carrying its expected value into
the runner's `--break-at` so that the exit code is the verdict. Both run, every time.

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
