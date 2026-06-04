---
layout: doc
lang: en
title: "Reference — Agents"
description: "All SKRAFT pipeline agents: role, phase, reviewer."
---

# Reference — Agents

> Each phase has a producing agent and an independent reviewer. The reviewer never
> edits the work: it issues a verdict before the phase transition.

| Phase | Producing agent | Reviewer |
| --- | --- | --- |
| DISCOVER | [backlog-discoverer](backlog-discoverer.html) | [backlog-discoverer-reviewer](backlog-discoverer-reviewer.html) |
| DISCUSS  | [backlog-planner](backlog-planner.html) | [backlog-planner-reviewer](backlog-planner-reviewer.html) |
| DESIGN   | [solution-architect](solution-architect.html) | [solution-architect-reviewer](solution-architect-reviewer.html) |
| DISTILL  | [acceptance-designer](acceptance-designer.html) | [acceptance-designer-reviewer](acceptance-designer-reviewer.html) |
| DELIVER  | [software-engineer](software-engineer.html) | [software-engineer-reviewer](software-engineer-reviewer.html) |
| (meta)   | [skraft-orchestrator](skraft-orchestrator.html) | — |

The orchestrator is the **single entry point**: it reads the state, dispatches the
current phase agent, triggers the reviewer, applies the verdict (and retries), then
moves on to the next phase.

## See also

- [Gates crossed per phase](../../catalogue/gates.html)
- [The adversarial review lenses](../../catalogue/lens.html)
- [The pipeline overview](../../pipeline/)
