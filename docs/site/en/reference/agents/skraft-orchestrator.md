---
layout: doc
lang: en
title: "skraft-orchestrator"
persona: tech-lead
---

# `skraft-orchestrator`

> Orchestrates the RESEARCH → DESIGN → DISTILL → DELIVER engineering pipeline by dispatching work to specialised agents.

## When to use

- Select the `skraft-orchestrator` agent with a refined story
- Single entrypoint for the engineering pipeline
- Persona: tech-lead

## Entry contract

- Refined story or its GitHub issue number
- Repository with initialised project structure

## Exit contract

- Required phases completed in RESEARCH → DESIGN → DISTILL → DELIVER order
- Artifacts committed on the working branch
- `state.json` updated with final status

## Invariants

- **Phase ordering** — RESEARCH → DESIGN → DISTILL → DELIVER, never reversed
- **CQS** — The orchestrator dispatches commands but never writes artifacts directly; it reads `state.json` to decide the next action
- **Bounded retry** — Each executor → reviewer cycle has a maximum number of attempts
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

The orchestrator is a pure coordinator. It owns no business logic, no artifact-writing capability. This separation applies CQS at the system level: commands go to executors, queries come back from reviewers.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

The single entry point reflects the pragmatic principle of textual modularity. Each agent is a self-contained, composable, replaceable file — the orchestrator assembles them without merging them.

> « Keep knowledge in plain text. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

## Allowed customisation

- Number of retries per phase (L2)
- Dispatch message vocabulary (L1)
- Adding intermediate phases (L3, with caution — see [Customisation]({{ "/en/how-to/customisation" | relative_url }}))

## See also

- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — CQS view of the pipeline
- [Pipeline]({{ "/en/explanation/pipeline/" | relative_url }}) — Each phase description
- [Core concepts]({{ "/en/explanation/concepts" | relative_url }}) — CQS, CQRS, Walking Skeleton
