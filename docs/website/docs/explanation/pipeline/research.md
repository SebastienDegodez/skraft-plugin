---
title: "RESEARCH"
description: "Why engineering starts with a sourced investigation that recommends without deciding: evidence from the code and the sources before any architecture."
persona: tech-lead
phase: research
---

# RESEARCH — reduce uncertainty before designing

RESEARCH looks for evidence in the code, the conventions and external sources. It recommends
an approach without writing code or making the architecture decision.

## Why this phase exists

An architect who designs without looking at what exists reinvents an aggregate that is already
there, or picks a library the repository has abandoned. RESEARCH separates two jobs: **knowing
what is true** and **deciding what to do**. The `solution-researcher` only does the first.
Because it builds nothing, what it reports can be trusted: it has no stake in defending a
solution it already wrote.

It is the first phase the engine conducts. Before starting the researcher, the run asks the
developer whether they consent to publishing the pull request and, for a front end, the
screenshots: these questions come early so they do not interrupt the run later.

:::info[☕ Running example — Starbucks *(illustrative)*]

The story "order a customised drink" enters with its criteria. RESEARCH spots the existing
payment provider, the repository's constraints and the integration options. It hands DESIGN a
sourced recommendation, without choosing the ADR.
:::

## A claim without a source is removed

Every finding of the research document cites a repository path with its lines, or a URL. A claim
the researcher cannot verify is not hedged: it is removed. The document compares several
approaches, recommends one with its reasons and keeps the others with the evidence against them,
then lists what DESIGN will have to decide.

```mermaid
graph LR
    S[Refined story] --> Q[Research questions]
    Q --> E[Evidence<br/>code and sources]
    E --> C[Approaches compared]
    C --> H[Handoff to DESIGN]
```

*Figure 1 — A story's path through RESEARCH: from questions to evidence, from evidence to
compared approaches, then the handoff to DESIGN.*

## Start from what the repository documents

Before the code, the researcher reads the documentation earlier stories left under `docs/`: the
context map, the tactical design, the event model, the scenarios and the ADRs. When it already
answers the story, the research document says so, cites those files and goes no further. The
engine checks only that the document exists, not what it cites. The research document itself stays in the tracking
folder: it serves one story.

## No review, but a judge downstream

RESEARCH is the only engineering phase without review lenses. The engine only checks that the
document exists and is filled: not empty, not identical to the template, no placeholder left.
Judging the substance falls to DESIGN, which must cite these findings rather than search the
code again; consistency between the research and the ADRs is then judged by the DESIGN review.
One more review would cost a round of lenses on a document the next phase reads anyway.

When the stories come from DISCUSS with `skraft init --from-artifacts`, the run starts in
DESIGN: the research happened during product preparation.

## Going further

- [Reference: RESEARCH](../../reference/phases.md#research) — nodes, output, check, attempts.
- [Reference: the research document](../../reference/run-journal.md#research-document).
- [Reference: durable documentation](../../reference/run-journal.md#durable-docs) — what goes to `docs/`, what stays in the tracking folder.
- [DESIGN](./design.md) — the phase that decides.
