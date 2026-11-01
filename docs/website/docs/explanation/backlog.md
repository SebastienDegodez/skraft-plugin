---
title: "The backlog: from idea to ready story"
description: "Why product preparation lives in its own plugin, skraft-backlog: PRD to GitHub backlog, refinement, triage and sprint automations, and the readiness lenses."
persona: tech-lead
---

# The backlog: from idea to ready story

The engineering pipeline starts from a ready story. `skraft-backlog` is the half of SKRAFT that
prepares it — and refuses to call it ready until it is.

## Why a separate plugin

Preparing the work and doing it have neither the same rhythm nor the same actors. The backlog is
triaged every week, a sprint is refined before it starts, a PRD is sliced once; a story is
designed and delivered one at a time. Mixing them in one pipeline would make one wait for the
other.

`skraft-backlog` is therefore a separate plugin, which installs and runs without the `skraft`
engineering plugin, and vice versa. The two share **no code**: they share **files**. The stories
the backlog writes into the tracking folder are the ones the engine can read, whoever wrote them;
`skraft init <slug> --from-artifacts` then starts a run directly in DESIGN.

## Three paths to a ready story

```mermaid
flowchart LR
    PRD["approved PRD"] -->|skraft-prd-backlog<br/>workflow| BL["epics + stories<br/>on GitHub"]
    IS["existing issues"] -->|backlog-discoverer| TR["triage +<br/>sprint proposal"]
    TR -->|backlog-planner| ST["ready stories<br/>in the tracking folder"]
    ONE["one issue"] -->|/skraft-refine (Claude Code)<br/>/skraft-backlog:skraft-refine (Copilot CLI)<br/>or gh-aw workflow| CO["refinement proposal<br/>as a comment"]
    ST -->|skraft init --from-artifacts| ENG["engineering pipeline<br/>in DESIGN"]
```

*Figure 1 — The three entries of `skraft-backlog`: a PRD to slice, a backlog to triage and
refine, a single issue to refine; only the planner's stories go to the engine.*

### From PRD to backlog

When a PRD is approved, the `skraft-prd-backlog` Copilot CLI dynamic workflow turns it into epics
and INVEST stories on GitHub, with their dependencies and milestones. The workflow's principle
fits in one sentence: **it decides nothing a script or a human decides.**

- A script inventories every requirement of the PRD; the `backlog-slicer` agent cuts it into epics
  and stories; a script checks that every requirement is covered and that the dependencies form a
  graph with no cycle. The run then stops on the story map, for a human to approve it.
- One `story-writer` per story writes each one in parallel; a script checks it against the
  Definition of Ready; the four planning lenses review it.
- The run stops again: nothing is published until a human has ticked their review. Publication
  goes through `gh`, and every issue carries a hidden marker: running the workflow again creates
  nothing twice.

The first story of each epic is its **tracer bullet**: the thinnest path through every layer the
epic touches, demonstrable when done. This is the *tracer bullets* idea
([Hunt & Thomas, 2019](../reference/citations.mdx#cite-hunt-pragmatic-2019)), a cousin of the walking skeleton
DISTILL demands later. A canvas, *skraft backlog*, shows the map and each story as a checklist.
Marking a story reviewed and creating it on GitHub are the human's actions there: the agent can
read the state, explain a story and simulate the creation, never publish.

### Triage, then refine

On a backlog that already exists, two agents take over: `backlog-discoverer` triages and proposes
a sprint ([DISCOVER](./pipeline/discover.md)), then
`backlog-planner` refines the selected issues into stories
([DISCUSS](./pipeline/discuss.md)). The developer starts each as
the main agent of their session; that producer starts its lenses, and no sub-agent starts
another. Under Copilot, `/skraft backlog [criteria…]` is the entry to this path: it starts no
agent, it tells the developer which agent to select next and, once the stories are written, to
type `/skraft <slug> --from-artifacts`. It never moves to development on its own, because a
router that started the producer would put its lenses at depth 2. How to do it:
[Refine the backlog](../how-to/refine-backlog.md).

### Refine a single issue

For a single issue, `refinement-proposal` posts **one comment**: the issue's Definition of Ready
as written, a ready or needs-refinement verdict, a size, the defects of the current criteria and a
proposed story with its examples. The developer runs it on their
own model, with `/skraft-refine <number>` in Claude Code or `/skraft-backlog:skraft-refine <number>` in
Copilot CLI (measured; VS Code not measured yet); a team can also install the `skraft-refine` GitHub Agentic Workflow, which runs it when
an issue is opened or on a label. A marker in the comment avoids proposing twice for the same
version of the issue, and scripts do everything that must not depend on the model: finding the
linked PRD, validating the proposal, rendering the comment.

## Automations that set a rhythm

Under VS Code, the plugin offers two automation templates: a **weekly triage**, on Monday
morning, which runs the discoverer and proposes a sprint, and a **refinement of the proposed
sprint**, run by hand, which puts that sprint through the planner. Neither is active until the
developer creates an automation from it, choosing the model and the permissions. The idea is to
make triage an appointment rather than a chore that gets postponed, without ever starting an
agent nobody authorised.

## The planning lenses: why each one

A story is not "ready" because its author says so. Four lenses, each read-only, judge it from a
precise angle, and the `review-verdict.mjs` script computes the verdict.

- **INVEST** (G1, G2): each story is independent, negotiable, valuable, estimable, small and
  testable ([Wake, 2003](../reference/citations.mdx#cite-wake-invest-2003)), and the sprint holds no circular
  dependency. A story that silently depends on another betrays a split to redo.
- **Acceptance-criteria quality** (G3, G4): at least three criteria, none dictating the
  implementation, and above all none a domain expert could read two ways. An ambiguous criterion
  (G4) is blocking: an HTTP status code, a class name or "the customer is notified" without saying
  how do not mean the same thing to everyone. The worked examples of specification by example
  remove those ambiguities ([Adzic, 2011](../reference/citations.mdx#cite-adzic-specification-2011)).
- **Coherence** (G5, G6): each story serves its milestone's theme, and the delivery order follows
  unambiguously from the dependency graph.
- **Definition of Ready** (G7, G8): the eight checklist items pass, and no anti-pattern shows up —
  a developer persona, an "implement" verb, no example. A story missing two items or more is
  rejected outright: it is not to be fixed, it is to be rewritten.

A missing or inconclusive lens never counts as approval, and three refused attempts hand control
back to the developer. The detail of the criteria and the computation:
[Gates](../reference/gates.md#discuss).

## Trade-offs

- **The backlog stays the team's.** The agents add labels and comments; they never rewrite an
  issue's title or body.
- **Two human stops in the PRD workflow.** The story map and the publication wait for a person. A
  backlog published by mistake costs more to clean up than a pause.
- **No engine on the backlog side.** DISCOVER and DISCUSS have no event journal and no command
  gates: their checks are scripts and lenses, not a resumable run.

## Sources

- [Adzic, G. *Specification by Example*, 2011.](../reference/citations.mdx#cite-adzic-specification-2011)
- [Hunt, A. & Thomas, D. *The Pragmatic Programmer*, 20th anniversary ed., 2019.](../reference/citations.mdx#cite-hunt-pragmatic-2019)
- [Wake, B. *INVEST in Good Stories, and SMART Tasks*, 2003.](../reference/citations.mdx#cite-wake-invest-2003)

## See also <!-- #see-also -->

- [Turn a PRD into a GitHub backlog](../how-to/prd-to-backlog.md) — the `skraft-prd-backlog` workflow step by step.
- [Refine a backlog issue](../how-to/refine-backlog.md) — `/skraft-refine` and the gh-aw workflow.
- [Reference: DISCOVER and DISCUSS](../reference/phases.md#discover) — inputs, outputs, effects on GitHub.
- [Reference: DISCOVER and DISCUSS review criteria](../reference/gates.md#discover).
- [The agent and skill catalogue](pathname:///dashboard/).
- [The SKRAFT pipeline](./pipeline/index.mdx).
