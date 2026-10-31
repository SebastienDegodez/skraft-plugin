---
layout: doc
lang: en
title: "DISCUSS"
description: "Why refine a triaged issue into an INVEST story with domain examples and acceptance criteria before any design, and why the Definition of Ready decides."
persona: software-engineer
---
{% assign cites = "/en/reference/citations" | relative_url %}

# DISCUSS

{% include phase-ribbon.html current="discuss" %}

> Clarify before designing: DISCUSS turns a triaged issue into a story the business and the code
> understand the same way.

## Why this phase exists

A vague story produces code that solves the wrong problem, and the gap only shows at the demo.
DISCUSS moves that discovery upstream: before any architecture, the story must say for whom,
what and why, with examples the business recognises.

It is the second phase of the `skraft-backlog` plugin. The developer starts the
`backlog-planner` agent on DISCOVER's triage report (or on a triage coming from upstream
planning). The planner touches neither the code nor the engine: it writes stories into the
tracking folder and puts a label on each issue saying whether it is ready.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The triage report enters. DISCUSS derives the **INVEST story**: "As a customer, I order a
customised drink to pick up in store." It exits with **3 acceptance criteria** (choice of size,
milk, and payment before preparation). Engineering receives this story.
</div>

## Examples before rules

The planner starts from concrete domain examples, with real values, then derives the acceptance
criteria in *Given / When / Then* form. The order matters: a worked example reveals a
disagreement an abstract rule hides. This is specification by example
([Adzic, 2011]({{ cites }}#cite-adzic-specification-2011)) and the *Given / When / Then*
vocabulary of BDD ([North, 2006]({{ cites }}#cite-north-bdd-2006)).

The story itself follows INVEST: independent, negotiable, valuable, estimable, small, testable
([Wake, 2003]({{ cites }}#cite-wake-invest-2003)). It names a specific role, never "the user":
a vague persona lets everyone imagine their own.

## Ready, or not yet

The **Definition of Ready** is the checklist that decides whether a story can go to engineering:
problem statement, specific persona, examples, scenarios, criteria derived from the examples,
size, technical notes, dependencies. A story that fails it stays in refinement, with the label
that says so, rather than entering a sprint in a shape DESIGN would have to guess.

Four lenses review the stories — INVEST, acceptance-criteria quality, milestone and dependency
coherence, Definition of Ready — and the `review-verdict.mjs` script computes the verdict, as in
DISCOVER. The planner never approves its own stories.

## Going further

- [The backlog]({{ "/en/explanation/backlog" | relative_url }}) — why each planning lens exists.
- [Reference: DISCUSS]({{ "/en/reference/phases" | relative_url }}#discuss) — inputs, outputs, labels.
- [Reference: DISCUSS review criteria]({{ "/en/reference/gates" | relative_url }}#discuss).
- [RESEARCH]({{ "/en/explanation/pipeline/research" | relative_url }}) — where engineering starts.

## Sources

- [Adzic, G. *Specification by Example*, 2011.]({{ cites }}#cite-adzic-specification-2011)
- [North, D. *Introducing BDD*, 2006.]({{ cites }}#cite-north-bdd-2006)
- [Wake, B. *INVEST in Good Stories, and SMART Tasks*, 2003.]({{ cites }}#cite-wake-invest-2003)
