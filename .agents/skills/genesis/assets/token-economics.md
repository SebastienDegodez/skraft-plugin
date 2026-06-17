# Token economics (substrate vocabulary)

The substrate concepts that govern what an agentic workflow COSTS
in dollars and credits when it runs. Same register as
`composition-substrate.md`: vocabulary the architect uses to reason,
not how-to.

Load this file when:

- Step 1 (intent + scope) reads the operator's cost stance.
- Step 3.2 (cost check) inspects the design for cost amplifiers.
- Step 6 (handoff packet) records the cost projection.
- Step 8 (validate) confirms the emitted modules honor projected
  model class and do not leak cache invalidators.

Genesis names cost concerns the same way it names threading,
persistence, and attention. Cost is not a runtime concern grafted
on after the design; it is a SHAPE the design has from step 1.

---

## Why cost is a design concern, not a runtime concern

Token cost is determined by the SHAPE of the workflow long before
it executes:

- How many tokens you send to the model on each turn (prefix).
- How many tokens the model emits per turn (output, typically
  billed 3-5x the input rate).
- How many turns the workflow takes.
- How often the prefix changes (cache hit ratio).
- Which model class handles which role.
- How many tools the model has to consider on each turn (the tool
  catalogue is part of the prefix).

All six are decided at design time. A live token meter at runtime
can MEASURE the result but cannot CHANGE the cost shape. The
discipline is the same as latency or memory budgets in
classical systems: name the budget at design time; verify against
it at validation time.

---

## The seven concepts

### 1. CACHEABLE PREFIX

The leading bytes of the prompt that do not change across turns
within a session: the persona body, the loaded skill bodies, the
preserved tool catalogue, project-level rule files. Providers cache
this prefix and bill cache READS at a small fraction of input rate
(typically 10x cheaper than fresh input on Anthropic; similar
discounts on other providers).

The architect's job: maximize the prefix that is stable across
turns, and place all variable content AFTER it.

### 2. VARIABLE SUFFIX

The trailing bytes of the prompt that change per turn: the user
turn, the latest tool result, the running scratchpad. Variable
suffix is billed at the full input rate. Small variable suffix is
not a problem; large variable suffix that grows turn over turn
(unbounded conversation history) is.

### 3. OUTPUT TAX

Output tokens cost 3-5x input tokens on most providers (Anthropic
Sonnet 4.6: $3 input / $15 output per Mtok). Output dominates
total spend on workflows that emit long artifacts (full PRs,
release notes, generated code, long synthesis paragraphs).
"Reasoning" / "thinking" tokens (Anthropic extended thinking,
OpenAI reasoning effort) are billed at output rates.

Implication: workflows that emit terse decisions and lean on
external tools for production-grade artifacts cost less than
workflows that ask the model to be the production system itself.

### 4. CACHE BREAKPOINT

The marker (provider-specific) that tells the cache where to split
the prefix from the suffix. Providers expose a small number of
breakpoints per request (Anthropic: 4). The architect's job: place
breakpoints so the most stable content sits below the lowest
breakpoint and is reused across the entire session.

### 5. CACHE INVALIDATOR

Any change to the prefix bytes-up-to-the-breakpoint that forces a
cache MISS, billing the next turn at fresh-input rates. Common
invalidators:

- TIMESTAMPS inside system prompts ("Current date: 2025-11-14").
- MID-SESSION TOOL CATALOGUE CHANGES (MCP server adds a tool).
- MODEL SWITCH within a session (different model, different cache
  partition).
- EFFORT / THINKING-BUDGET change (some providers treat this as a
  different cache partition).
- EDITS to project-level rule files mid-session.
- CONTEXT COMPACTION (the harness rewrites the prefix to fit a
  budget; bytes change; cache misses).

A design that incurs one cache miss per turn pays roughly the
SAME as a design with no cache at all. Cache discipline is a
boolean per turn, not a gradient.

### 6. TTL TRADEOFF

Providers expose multiple cache TTLs (Anthropic: 5 minutes default,
1 hour at a write-cost premium). Short TTL is cheap to write but
costs again if the session pauses; long TTL costs more to write
but survives a coffee break. The architect picks TTL based on
expected session pattern (interactive vs batch vs long-running
agent).

### 7. PER-HARNESS BILLING UNIT

Different harnesses bill on different units, even on the same
underlying model:

- TOKEN PASS-THROUGH (raw API): provider's per-Mtok rate.
- REQUEST-COUNT BILLING (some IDE assistants): a "premium request"
  abstracts the underlying token cost; one request may map to many
  underlying tokens.
- CREDIT MULTIPLIER: a base unit cost multiplied per model
  (e.g. 1x for trivial, 5x for premium).
- HYBRID: subscription seat + overage at request or token rate.

Cost reasoning in genesis happens in two layers: (a) abstract role
classes in `model-catalog.md` (planner / implementer / reviewer /
trivial / long-context-retriever); (b) per-harness adapter that
maps role class to concrete model AND to that harness's billing
unit. The architect reasons in role classes; the operator sees
projected cost in their harness's actual billing unit.

---

## Cost-shape vocabulary used in the catalogue

When a Tier-2 pattern entry names a cost shape, it uses these
qualitative bands so reviewers can reproduce the reasoning without
chasing volatile numbers:

- **Prefix size**: S (under 5K tokens) / M (5-20K) / L (20-100K)
  / XL (over 100K).
- **Output volume**: S (under 500) / M (500-3K) / L (over 3K).
- **Turn count**: low (1-3) / medium (4-10) / high (10+).
- **Cache hit ratio (runtime-observed, NOT a design-time contract)**:
  high (>0.8) / medium (0.4-0.8) / low (<0.4). Observed at runtime
  and feeds R5 COST PRUNE evidence; never enters the step-6 contract.
- **Model class**: trivial / implementer / planner / reviewer /
  long-context-retriever (see `model-catalog.md`).

These bands are durable. Concrete $/Mtok numbers are footnotes in
per-harness adapters, with a "verified on YYYY-MM-DD" date stamp.

---

## How this vocabulary interlocks with existing substrate

- THREADING (existing substrate): more threads -> more parallel
  prefixes -> more cache writes -> output tokens scale linearly
  with thread count.
- PERSISTENCE (existing substrate): plan files persisted between
  sessions reload as a NEW prefix in the next session; first turn
  pays full input rate again unless the harness supports
  cross-session caching.
- ATTENTION (existing substrate): goal drift forces re-grounding
  turns; each re-grounding turn pays the variable suffix again
  AND emits output tokens to restate context. ATTENTION ANCHOR
  is also a cost pattern, not just a quality pattern.

The cost layer does not replace any of these; it interlocks with
them as the seventh axis the architect reasons about.

