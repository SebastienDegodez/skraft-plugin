# Model catalog (common substrate)

Role-class taxonomy the architect reasons in. Concrete model
mappings and pricing footnotes live in per-harness adapters;
this file defines the abstract roles.

Load this file when:

- Step 3.2 (cost check) decides which role class each module needs.
- A pattern entry in `design-patterns.md` references a role class
  (B11 MODEL ROUTER, B15 EFFORT GOVERNOR).
- A pattern entry in `architectural-patterns.md` composes roles
  across stages (A10 GRADIENT WORKFLOW).
- A Haiku / Sonnet / Opus coding or autonomous-loop boundary needs
  dated empirical evidence; then also read
  `references/benchmark-grounding.md`.

The architect designs in role classes. The coder thread, at step
7b, loads the per-harness adapter to resolve role class to concrete
model + billing unit for the declared target harness.

---

## Why role classes

Concrete model names age out (Sonnet 4.5 -> 4.6 -> 4.7 within
months) and harnesses repackage them under their own SKUs (a
"premium request" today, a "credit" tomorrow). The catalogue must
survive that churn.

Role classes name what the architect is BUYING when they place a
model in a slot: capability profile + cost profile + typical
context size. The per-harness adapter maps role class -> concrete
model name + billing surface AT THE TIME THE OPERATOR READS IT.

---

## The six role classes

### planner

CAPABILITY PROFILE: high-quality reasoning, plans that survive
contact with execution, accurate tool-use plans, robust on long
context windows.

COST PROFILE: highest per-token rate in the harness's catalogue;
often billed with a thinking/reasoning multiplier; total spend
dominated by output (plans are output-heavy).

TYPICAL CONTEXT SIZE: large (the planner often loads the full
codebase summary, the issue body, the constraints).

USED IN: A2 STAFFED PLAN (the plan-producing thread), A10 GRADIENT
WORKFLOW (the heavy front), C2 PERSONA PRELOAD with senior-architect
persona, any synthesizer in A1 PANEL where cross-lens reasoning is
hard.

EXAMPLES (durability disclaimer: refresh from per-harness adapter;
verified against Microsoft Learn Azure Foundry reasoning docs):
Claude Opus tier with high reasoning, GPT-5 / GPT-5.1 with `high`
reasoning_effort, GPT-5 standard at high effort. NOT the same as
RESEARCHER below -- planner produces a bounded plan toward a stated
goal; researcher explores an open question.

### researcher

CAPABILITY PROFILE: open-ended exploration where success criteria
are themselves under discovery. Synthesises across vast corpora,
recurses on novel directions, holds multiple competing hypotheses,
emits structured findings with provenance. Distinct from planner
(which optimises toward a stated goal) and from long-context-
retriever (which extracts from a known corpus).

COST PROFILE: HIGHEST in the harness's catalogue. Reasoning-token
multiplier compounds with deep thinking modes; output volume large
(reports, synthesis docs); context typically the largest of any
class. Often the most expensive single dispatch in a workflow.

TYPICAL CONTEXT SIZE: very large (multiple full repos, multiple
docs sets, long incident histories, multi-vendor pricing pages).

USED IN: deep cross-domain investigation, novel-problem framing,
prior-art surveys, root-cause analysis on multi-system incidents,
architecture exploration when no PRD exists, anything where the
user prompt starts with "research" or "investigate" or "figure
out whether ...".

EXAMPLES (verified against Microsoft Learn Azure Foundry docs --
reasoning_effort `high` / `xhigh`): Claude Opus 4.x with extra-high
reasoning, GPT-5-pro (defaults to and only supports `high`
effort), GPT-5.1 / GPT-5.1-codex-max with `high` or `xhigh`
reasoning_effort, o3-pro tier where exposed. Industry-standard
research-grade models cluster here. **The architect MUST cite
STAKES (irreducible novelty + open-ended success criteria) before
binding researcher** -- this is the most expensive class and the
class most prone to BIND-UP-WITHOUT-JUSTIFICATION because the work
"feels hard." Pattern matching ≠ research; if a rubric exists, the
work is REVIEWER, not RESEARCHER. If a plan exists, the work is
PLANNER, not RESEARCHER.

### implementer

CAPABILITY PROFILE: solid coding, good tool use, follows a given
plan reliably, terse output, low hallucination on routine edits.

COST PROFILE: middle of the harness's catalogue; the sweet spot
for $/quality on bulk implementation work; output volume bounded
by what is being edited.

TYPICAL CONTEXT SIZE: medium (the file being edited + immediate
neighbors + the relevant section of the plan).

USED IN: per-todo executor in A2 STAFFED PLAN, per-stage worker in
A3 PIPELINE, fan-out workers in A1 PANEL when the lenses are
domain-narrow, the middle layer of A10 GRADIENT WORKFLOW.

EXAMPLES (verified against Microsoft Learn Azure Foundry docs):
Claude Sonnet tier, GPT-5 / GPT-5.1 at `medium` reasoning_effort
(the default), GPT-5-codex for coding-heavy work.

### reviewer

CAPABILITY PROFILE: pattern-matches against a checklist or rubric,
emits structured verdicts, low fabrication when given a concrete
artifact to grade.

COST PROFILE: low to middle; bounded output (verdict + short
rationale, not generation); high cache hit ratio (the rubric is
the cacheable prefix, the artifact under review is the variable
suffix).

TYPICAL CONTEXT SIZE: medium (rubric + artifact + recent context).

USED IN: A7 ADVERSARIAL REVIEW, S4 VALIDATION DECORATOR, the
back layer of A10 GRADIENT WORKFLOW, COLD READER SIMULATION.

PATTERN CROSS-LINK: fixed-schema REVIEWER spawns (rubric-graded
lenses with JSON output) qualify for B14b CAVEMAN BRIEF in
CAVEMAN_FULL intensity. Open-ended REVIEWER spawns do NOT —
caveman compression collapses multi-dimension judgement (see
B14b ANTI-PATTERN: CAVEMAN ON REVIEWER).

EXAMPLES: Claude Sonnet tier (often the same model as implementer
but with a reviewer persona), GPT-5 / GPT-5.1 at `low` or `medium`
reasoning_effort, GPT-5-mini at `medium` effort for checklist-
grade reviews.

### trivial

CAPABILITY PROFILE: classification, extraction, short
summarization, format normalization, simple Q&A; tasks where any
modern frontier model gets it right one-shot.

COST PROFILE: cheapest in the harness's catalogue; output is
always short; cache hit ratio irrelevant because the body is tiny.

TYPICAL CONTEXT SIZE: small.

USED IN: C3 CONDITIONAL DISPATCH classifiers, lazy-asset
selection prompts, file-name normalizers, branch-name suggestions,
"is this a bug or feature" pre-filters, B11 MODEL ROUTER's own
routing call.

PATTERN CROSS-LINK: TRIVIAL spawns are the canonical site for
B14b CAVEMAN BRIEF. Whenever the architect routes a spawn to
trivial, EITHER apply B14b OR record one-line justification under
the spawn's PER-SPAWN DECLARATION TABLE row. See design-patterns.md
§B14b and composition-substrate.md §7.

EXAMPLES: Claude Haiku tier, GPT-5-mini / GPT-5.1 at `none` or
`minimal` reasoning_effort, GPT-5-nano where exposed, Gemini Flash
tier.

### long-context-retriever

CAPABILITY PROFILE: ingests very large context windows (200K+
tokens), retrieves precise spans, summarizes faithfully, low
hallucination when the answer is grounded in the supplied corpus.
The capability profile is "needle in haystack", not "reason hard".

COST PROFILE: per-token rate often equal to a mid-tier model, but
TOTAL cost dominated by input volume; cache discipline is
existential (one cache miss = full corpus re-billed at fresh
input rate).

TYPICAL CONTEXT SIZE: very large (full repos, full docs sets,
full incident histories).

USED IN: C6 EXTERNAL CORPUS GROUNDING when the corpus exceeds
implementer-tier context, large-codebase summarization workflows,
incident-history retrieval, long-document Q&A.

EXAMPLES: Claude Sonnet tier (1M context variant where offered),
GPT-5 / GPT-5.1 with extended context at `low` reasoning_effort,
Gemini Pro 2M-context tier.

---

## Routing axes (when a workflow uses more than one class)

The architect picks role class per element along three axes:
quality ceiling, output volume, repeat count. Cheapest class
meeting capability profile; promoted only on cited STAKES.
See `design-patterns.md` §B12 SELECTION RULE for the canonical
rule and `design-patterns.md` WRONG-PRIMITIVE BINDING for the
binding-site requirement (adapters MUST name the per-element
binding site; absence breaks B12). If a Haiku / Sonnet / Opus coding
or autonomous-loop boundary is contested, cite
`references/benchmark-grounding.md` (verified 2026-05-29).

---

## How per-harness adapters extend this file

Each adapter in `runtime-affordances/per-harness/<x>.md` SHOULD
include a `model-catalog` section that:

- Maps each role class to one or more concrete model SKUs the
  harness offers.
- Names the billing unit for that harness (token pass-through /
  request count / credit multiplier / hybrid).
- Records a "verified on YYYY-MM-DD" date stamp.
- Footnotes the published price page so the operator can
  re-verify when the date stamp is stale (more than 90 days).
- NAMES THE PER-ELEMENT BINDING SITE explicitly: which primitive
  type (custom agent / skill / workflow step / etc.) accepts a
  `model:`-equivalent field, and which primitive types do NOT.
  Without this, B12 MODEL ROUTER cannot be applied per agentic
  element on that harness -- the architect will at best bind once
  at the session level.

Adapters MAY omit a role class if the harness genuinely does not
offer one (e.g. a harness with no trivial tier). The architect
checks for that gap at step 3.2 and either picks an alternative
role class or warns the operator.

---

## OpenAI / GPT-5 family specifics (durability disclaimer)

GPT-5 series introduced a per-call `reasoning_effort` parameter
that materially changes COST PROFILE without changing the model
SKU. The architect MUST treat `reasoning_effort` as part of the
role-class binding decision -- the same SKU at `none` vs `xhigh`
spans most of the role-class spectrum at vastly different cost.

Grounded against Microsoft Learn Azure Foundry reasoning docs
(verified URLs in footnotes below):

- `reasoning_effort` values: `none` | `minimal` | `low` | `medium`
  | `high` | `xhigh`. (Older o-series only supports `low`/`medium`/
  `high`.)
- `gpt-5.1` defaults to `none` (no reasoning). Tool calls supported
  at all effort levels for gpt-5.1.
- All models BEFORE gpt-5.1 default to `medium`. They do NOT
  support `none`.
- `gpt-5-pro` defaults to AND only supports `high`. This is a
  research-grade SKU and binds to RESEARCHER class.
- `xhigh` is supported only on models AFTER `gpt-5.1-codex-max`.
- `gpt-5-codex` does NOT support `minimal` effort.

Suggested role-class to OpenAI-SKU + reasoning_effort mapping:

| Role class | Default OpenAI binding | Reasoning effort |
|---|---|---|
| trivial | gpt-5-mini OR gpt-5.1 | `none` or `minimal` |
| reviewer | gpt-5 OR gpt-5.1 OR gpt-5-mini | `low` or `medium` |
| implementer | gpt-5 OR gpt-5.1 OR gpt-5-codex | `medium` (default) |
| long-context-retriever | gpt-5.1 (extended context) | `low` |
| planner | gpt-5 OR gpt-5.1 | `high` |
| **researcher** | **gpt-5-pro** OR **gpt-5.1-codex-max** | **`high` or `xhigh`** |

Naming the SKU alone is INSUFFICIENT for OpenAI bindings -- the
architect MUST also declare the `reasoning_effort` setting in the
handoff packet, because the same SKU spans 2-3 role classes
depending on effort. The PER-ELEMENT CAPABILITY PROFILE (see
`architectural-patterns.md` §A1 PANEL and `design-patterns.md`
§B12 BULK IDENTICAL BINDING) extends to effort selection: same
question (cross-file? STAKES? multi-step?) drives effort decision
once the SKU is chosen.

Footnotes (verify the linked pages if the stamp below is more
than 90 days stale):

- Azure Foundry reasoning docs (effort levels, defaults, SKU
  matrix): https://learn.microsoft.com/azure/foundry/openai/how-to/reasoning
- Azure Foundry responses API (ReasoningEffort component): https://learn.microsoft.com/rest/api/aifoundry/azureopenai/responses
- OpenAI GPT-5 prompting guide (referenced by Azure docs): https://cookbook.openai.com/examples/gpt-5/gpt-5_prompting_guide

Verified: 2026-05-29. Refresh if more than 90 days old.
