---
layout: doc
lang: en
title: "Adapting skraft: what each setting costs"
description: "What skraft lets you adapt and what it keeps in the engine, why, and the proof each setting can remove without anyone noticing."
persona: tech-lead
---

# Adapting skraft: what each setting costs

> The engine runs what you write. It cannot tell whether your command really tests anything: each
> setting that adapts skraft can also remove a proof.

## What you describe, what the engine decides

skraft splits the roles. You describe your repository: its components, their commands, their
base, their mocking, your agents' models, and, if you copy the workflow, lenses, agents and
questions of your own. The engine decides the rest: the order of phases, the expected outputs, the
number of attempts, the verdicts, the gates and their thresholds.

| What you adapt | Where | Guide |
| --- | --- | --- |
| Components, commands, gates, base, mocking | `skraft-config.json` | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Each agent's model and reasoning effort | `models`, `assign` (four layers) | [Choose the agents' models]({{ "/en/how-to/choose-models" | relative_url }}) |
| A review's lenses | `.skraft/pipeline.skraft.dot`, `.skraft/review.skraft.dot` | [Add a lens to a review]({{ "/en/how-to/customise-review" | relative_url }}) |
| Agents and questions of your repository | `.skraft/pipeline.skraft.dot` | [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }}) |
| Publishing the pull request and screenshots | `publish` | [Publish a run's pull request]({{ "/en/how-to/publish-pull-request" | relative_url }}) |

What cannot be tuned, and why:

- **Quality thresholds.** A tunable threshold becomes a threshold negotiated at each hard story;
  100 % on the business core and 80 % elsewhere stay the same for every team.
- **The engine's checks** (chained journal, write scope, expected outputs, replay of red commits).
  They are not workflow nodes: no copy can remove them.
- **DELIVER gates and reviews.** The `gates` and `mutation` nodes are locked: removing one takes
  writing `unlock="<reason>"`, which `skraft workflow diff` shows and the journal keeps. The review
  fan-ins, the `deliver_review` call and the `test-integrity` and `architecture-boundaries` lenses
  are mandatory: no reason removes them.

So the engine makes some workarounds impossible, and the others visible. What it cannot see is a
command that runs and proves nothing.

## Risks — reducing the controls

| What you do | What disappears | The sign to watch |
| --- | --- | --- |
| Remove a gate from a component (`architecture`, `coverage`) | The matching proof: no more dependency check, no more coverage | The gate no longer shows in the output of `skraft gate` nor in `gates/<component>/` |
| Remove a review, the call to `review`, or its `test-integrity` or `architecture-boundaries` lens | Nothing: the engine refuses the workflow | `… this node is mandatory and cannot be removed` from `skraft workflow check` |
| Unlock the `mutation` node | Mutation testing, and the loop that treats surviving mutants | `skraft workflow diff` shows the unlock; the run journals the node as skipped with its reason |
| Delete a component's `mutation` command | Nothing silently: the run stops at `mutation` as an `environment` failure | The `environment` question on the `mutation` node |
| Replace a command with one that tests nothing (`"test": "node -e 0"`, a filter that excludes almost everything) | The whole gate: it passes every time | `pass` evidence whose `stdout` shows no test run |
| Switch a component to `inprocess` with no contract test | The guarantee that your mocks still look like the real service | Green tests, then a failure at integration |
| Leave a component with no gate | Any proof about that component; the engine reports it as an `environment` failure | `no gate command; …` from `skraft gate` |
| Set `--base` or `baseBranch` to a ref that is too recent | Changed files fall outside the compared range | `no component changed since its base; no gate to run` while code did change |
| Remove the `adr` ask node | Human ratification of the ADRs, which stay `Proposed` | `skraft workflow diff` shows the node gone |
| Edit `events.jsonl` by hand to unblock a run | The journal as evidence: the run is blocked with `journal-tampered` | [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }}) |

Before you reduce a control, write the reason down where the team will read it: the pull request's
description, an ADR. To know whether a gate still proves something, open its evidence
(`.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log`) and read what the
command really did.

## The case of mutation testing

Mutation testing plants small faults in the code and checks that the tests catch them (Jia &
Harman, 2011). It is the only gate that measures the tests themselves: 100 % coverage says the
code ran, not that a test would have noticed it change. Removing it does not just shorten a run;
it removes the proof that the other gates prove anything. That is why its node is locked rather
than optional.

## Further reading

- [Software craftsmanship]({{ "/en/explanation/software-craftsmanship" | relative_url }}) — why a
  fixed bar.
- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — why these decisions live in
  the engine.
- [Gates]({{ "/en/reference/gates" | relative_url }}) and
  [locked nodes]({{ "/en/reference/workflow-dot" | relative_url }}#locked-nodes).

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
