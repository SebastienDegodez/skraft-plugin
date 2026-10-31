---
layout: doc
lang: en
title: "DISCOVER"
description: "Why triage the backlog before choosing a story: priority, duplicates, effort in points and a sprint proposal, judged by lenses that did not do the triage."
persona: software-engineer
---
{% assign cites = "/en/reference/citations" | relative_url %}

# DISCOVER

{% include phase-ribbon.html current="discover" %}

> Triage before choosing: DISCOVER turns a stream of raw issues into a prioritised triage report
> and a sprint proposal.

## Why this phase exists

Without systematic triage, a team works on whatever makes the most noise, not on what brings the
most value. Duplicates go unnoticed, a critical issue stays buried under recent requests, and the
sprint fills beyond what the team can hold.

DISCOVER is the first phase of the `skraft-backlog` plugin. The developer starts the
`backlog-discoverer` agent; the engineering engine is not involved. The agent classifies each
issue (type, priority, effort), spots duplicates and related issues, then proposes a sprint that
fits the declared capacity. It labels issues, but never creates one and never rewrites a body:
the backlog stays the team's.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The idea "enable mobile ordering in the app" enters here as a **raw issue**. DISCOVER gives it
priority **P1**, detects it overlaps an existing "in-app payment" request, and outputs it in a
**triage report**. That report is what DISCUSS receives.
</div>

## Three ways to find the work

The right starting point depends on the question asked. "What is assigned to me?" starts from
the developer's open issues; "what did my recent changes touch?" starts from the week's git
history; "what concerns this topic?" starts from a search by labels, milestone or keywords. The
discoverer picks one of these modes, and its lenses check that none was set aside without a
written reason.

## Points, not days

Effort is estimated in Fibonacci points (1, 2, 3, 5, 8). A point measures relative complexity,
not a duration. SKRAFT nonetheless converts points into team-days, for one reason only: the
team's capacity arrives in days, and two units cannot be compared without a bridge. The
conversion is a local convention, never a measurement nor a promised date.

It is built to push towards splitting: the cost per point never falls as the card grows. An
8-point card is worth more days than two cards of 3 and 5. Above 8, a card must be split before
it enters a sprint. This is the small-batch principle: a smaller batch reduces the waiting and
the risk it carries ([Reinertsen, 2009]({{ cites }}#cite-reinertsen-flow-2009)).

## Whoever triages does not approve the triage

Three lenses review the report, each read-only and from a single angle: completeness,
prioritisation, duplicates. A script, `review-verdict.mjs`, computes the verdict from their
findings; the discoverer has no say. A missing or inconclusive lens never counts as approval.
After three refused attempts, the run stops and hands the unresolved findings back to the
developer.

This is peer review scaled down to a triage report: several independent eyes, criteria written
in advance ([Wiegers, 2002]({{ cites }}#cite-wiegers-peer-reviews-2002)).

## Going further

- [The backlog]({{ "/en/explanation/backlog" | relative_url }}) — the `skraft-backlog` plugin as a whole.
- [Reference: DISCOVER]({{ "/en/reference/phases" | relative_url }}#discover) — modes, outputs, cap, effects on GitHub.
- [Reference: DISCOVER review criteria]({{ "/en/reference/gates" | relative_url }}#discover).
- [DISCUSS]({{ "/en/explanation/pipeline/discuss" | relative_url }}) — the next phase.

## Sources

- [Reinertsen, D. G. *The Principles of Product Development Flow*, 2009.]({{ cites }}#cite-reinertsen-flow-2009)
- [Wiegers, K. *Peer Reviews in Software*, 2002.]({{ cites }}#cite-wiegers-peer-reviews-2002)
