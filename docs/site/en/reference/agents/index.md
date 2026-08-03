---
layout: doc
lang: en
title: "Reference — Agents"
description: "All SKRAFT pipeline agents: role, phase, reviewer."
---

# Reference — Agents

> Each phase has a producing agent and an independent reviewer. The reviewer never
> edits the work: it issues a verdict before the phase transition.

| Usage order | Phase | Producing agent | Reviewer |
| --- | --- | --- | --- |
| 0 | (meta)   | [skraft-orchestrator](skraft-orchestrator.html) | — |
| 1 | DISCOVER | [backlog-discoverer](backlog-discoverer.html) | [backlog-discoverer-reviewer](backlog-discoverer-reviewer.html) |
| 2 | DISCUSS  | [backlog-planner](backlog-planner.html) | [backlog-planner-reviewer](backlog-planner-reviewer.html) |
| 3 | RESEARCH | [solution-researcher](solution-researcher.html) | — |
| 4 | DESIGN   | [solution-architect](solution-architect.html) | [solution-architect-reviewer](solution-architect-reviewer.html) |
| 5 | DISTILL  | [acceptance-designer](acceptance-designer.html) | [acceptance-designer-reviewer](acceptance-designer-reviewer.html) |
| 6 | DELIVER  | [software-engineer](software-engineer.html) | [software-engineer-reviewer](software-engineer-reviewer.html) |

The orchestrator is the **single entry point**: it reads the state, dispatches the
current phase agent, triggers the reviewer, applies the verdict (and retries), then
moves on to the next phase.

## Internal test-wiring workers (DELIVER phase)

In DELIVER, the `software-engineer` delegates **test wiring** to internal subagents
(`user-invocable: false` — not directly invocable). Each worker emits test wiring
only; the business TDD cycle stays with the `software-engineer`, who verifies the
worker in TIER-1 (RED → GREEN). A conditional fidelity lens joins the adversarial
review panel when the capability is active.

| Capability | Worker | Fidelity lens |
| --- | --- | --- |
| Mocking (consumer) | mock-integration-worker | mock-fidelity-lens |
| Contract (provider) | contract-testing-worker | contract-fidelity-lens |

## See also

- [Gates crossed per phase]({{ "/en/reference/gates" | relative_url }})
- [The adversarial review lenses]({{ "/en/reference/lens" | relative_url }})
- [The pipeline overview]({{ "/en/explanation/pipeline/" | relative_url }})
