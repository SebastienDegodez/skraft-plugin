---
title: "Adapting skraft: what each setting costs"
description: "What skraft lets you adapt and what it keeps in the engine, why, and the proof each setting can remove without anyone noticing."
persona: tech-lead
---

# Adapting skraft: what each setting costs

The engine runs what you write. It cannot tell whether your command really tests anything: each
setting that adapts skraft can also remove a proof.

## What you describe, what the engine decides

skraft splits the roles. You describe your repository: its components, their commands, their
base, their mocking, your agents' models, and, if you copy the workflow, lenses, agents and
questions of your own. The engine decides the rest: the order of phases, the expected outputs, the
number of attempts, the verdicts, the gates and their thresholds.

| What you adapt | Where | Guide |
| --- | --- | --- |
| Components, commands, gates, base, mocking, test infrastructure | `skraft-config.json` | [Configure the components](../how-to/configure-components.md) |
| Each agent's model and reasoning effort | `models`, `assign` (four layers) | [Choose the agents' models](../how-to/choose-models.md) |
| A review's lenses | `.skraft/pipeline.skraft.dot`, `.skraft/review.skraft.dot` | [Add a lens to a review](../how-to/customise-review.md) |
| Agents and questions of your repository | `.skraft/pipeline.skraft.dot` | [The DOT workflow](../reference/workflow-dot.mdx) |
| Publishing the pull request and screenshots | `publish` | [Publish a run's pull request](../how-to/publish-pull-request.md) |
| Whether a component describes its behaviour in Gherkin | `bdd` | [Configure the components](../how-to/configure-components.md) |

What cannot be tuned, and why:

- **Quality thresholds.** A tunable threshold becomes a threshold negotiated at each hard story;
  80 % of mutants detected on the business core and elsewhere stays the same for every team.
- **The engine's checks** (chained journal, write scope, expected outputs, order and kinds of commits).
  They are not workflow nodes: no copy can remove them.
- **DELIVER's reviews.** The engine refuses no DELIVER attempt for its gate runs: the
  `quality-gates` lens of the DELIVER review reads their trace and reports a missing, failing or stale run. The review
  fan-ins, the `deliver_review` call and the `test-integrity` and `architecture-boundaries` lenses
  are mandatory: no reason removes them.

So the engine makes some workarounds impossible, and the others visible. What it cannot see is a
command that runs and proves nothing.

## Risks — reducing the controls

| What you do | What disappears | The sign to watch |
| --- | --- | --- |
| Remove a gate from a component (`architecture`, `coverage`) | The matching proof: no more dependency check, no more coverage | The gate no longer shows in the `Quality evidence` table of the pull request nor in `evidence.checked`, and the `quality-gates` lens has nothing to judge for it |
| Remove a review, the call to `review`, or its `test-integrity` or `architecture-boundaries` lens | Nothing: the engine refuses the workflow | `… this node is mandatory and cannot be removed` from `skraft workflow check` |
| Never run your own mutation testing | The proof that the tests would catch a mistake | Nothing in the run: the pipeline runs no mutation, so only your own reports show it |
| Replace a command with one that tests nothing (`"test": "node -e 0"`, a filter that excludes almost everything) | The whole gate: it passes every time | A traced run that passes whose log shows no test run |
| Switch a component to `inprocess` with no contract test | The guarantee that your mocks still look like the real service | Green tests, then a failure at integration |
| Leave a component with no gate | Any proof about that component; the `quality-gates` lens reports the run missing | The gate is missing from `Quality evidence` unless the engineer declared it absent with a reason |
| Set `--base` or `baseBranch` to a ref that is too recent | Changed files fall outside the compared range | A component whose code changed is not in `Quality evidence` |
| Remove the `adr` ask node | Human ratification of the ADRs, which stay `Proposed` | `skraft workflow diff` shows the node gone |
| Remove the `scenario_review` ask node | A human's reading of the scenarios, the walking skeleton and S1's acceptance test before DELIVER builds them | `skraft workflow diff` shows the node gone |
| Run the walking skeleton's entry point or internal gateways in memory (`infrastructure`) | The integration proof of the story: the walking skeleton no longer reaches a real entry point or database | `skraft doctor` prints the row with `source skraft-config.json` |
| Set a component to `bdd: false` | The business-readable specification of that component: DISTILL is asked for no `.feature`, so its acceptance tests no longer carry the verbatim values of a scenario a domain expert can read | No `.feature` written for its features, and the test plan's `Feature File` column all dashes |
| Edit `events.jsonl` by hand to unblock a run | The journal as evidence: the run is blocked with `journal-tampered` | [Resume or unblock a run](../how-to/resume-a-run.mdx) |

Before you reduce a control, write the reason down where the team will read it: the pull request's
description, an ADR. To know whether a gate still proves something, open the log of its
traced run (`logs/runs/<step>-<visit>-<attempt>/`) and read what the command really did.

## The case of mutation testing

Mutation testing plants small faults in the code and checks that the tests catch them (Jia &
Harman, 2011). It is the only measure of the tests themselves: 100 % coverage says the code ran,
not that a test would have noticed it change. It is also the slowest step a story can pay for,
and the one that depends most on a tool and its configuration.

So neither the plugin's pipeline nor the engine runs it: it is a recipe of the developer's own
session (the `skraft-mutation` skill, [Run mutation](../how-to/run-mutation.md)), with the tool and
the configuration they chose, against the bar of `skraft-quality-bar`. The risk moves with it: a team
that never runs it loses the proof that the other gates prove anything, and no run will say so.

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.

## See also <!-- #see-also -->

- [Software craftsmanship](./software-craftsmanship.md) — why a
  fixed bar.
- [Architecture](./architecture.md) — why these decisions live in
  the engine.
- [Gates](../reference/gates.md).
