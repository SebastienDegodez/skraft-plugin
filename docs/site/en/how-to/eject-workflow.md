---
layout: doc
lang: en
title: "Copy and adapt the workflow"
description: "Copy the plugin's workflow into .skraft/ with skraft workflow eject, adapt it (skip a locked gate with its reason, change a loop, remove a lens), validate it with check, compare it with diff, update it after a plugin upgrade or go back to the plugin's workflow."
persona: tech-lead
---

# Copy and adapt the workflow

**Goal**: have the runs of your repository follow an adapted version of the pipeline or of the
DELIVER review, and keep it up to date with the plugin.

## Prerequisites

- A configured repository, Git, and a terminal at the root of the working copy; `skraft` stands
  for `node "<plugin folder>/engine/drivers/cli/skraft.mjs"`.

## 1. Copy the workflow

| To adapt… | Command | File written |
|---|---|---|
| the pipeline (phases, DESIGN and DISTILL reviews, gates, mutation, publication) | `skraft workflow eject` | `.skraft/pipeline.skraft.dot` |
| the DELIVER review, also run by `skraft review --pr` | `skraft workflow eject review` | `.skraft/review.skraft.dot` |

```text
.skraft/pipeline.skraft.dot holds the skraft 2.0.0-alpha.19 pipeline; the run follows it
```

The copy carries `skraft_version="2.0.0-alpha.19"` in its `graph [...]`. As soon as it exists,
every run of the working copy follows it. An existing copy is never overwritten.

## 2. Edit the copy

Some common edits, in `.skraft/pipeline.skraft.dot`:

| To… | Write |
|---|---|
| skip a locked gate (`gates`, `mutation`) | `unlock="<reason>"` on the node, which stays in place: `mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true, unlock="no mutation tool for this component"]` |
| allow more rework on a loop | change `max_visits` on the back edge: `design_review -> design [label="NEEDS_REWORK", max_visits=3]` |
| remove a lens that is not mandatory | delete its `shape=note` node and its two edges |
| add a lens of the team | [Add a lens to a review]({{ "/en/how-to/customise-review" | relative_url }}) |
| add a step run by a repository agent | [Add a repository agent to the pipeline]({{ "/en/how-to/add-repository-agent" | relative_url }}) |
| change an agent's model family | `model="<family>"` on its node ([Choose the agents' models]({{ "/en/how-to/choose-models" | relative_url }})) |

The reason of an `unlock` is carried into the run's journal and pull request. The reviews' fan-ins,
the `deliver_review` call and, in the review, `verdict`, `test_integrity` and
`architecture_boundaries` are mandatory: no copy can remove or bypass them.

## 3. Validate and compare

```text
skraft workflow check
skraft workflow diff
```

Expected result, for a skipped mutation gate:

```text
.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH; mutation is unlocked and skipped: no mutation tool for this component
~ node mutation: unlock none → no mutation tool for this component
.skraft/pipeline.skraft.dot: 1 changes from the skraft 2.0.0-alpha.19 workflow
```

Commit `.skraft/`: the whole team follows the same workflow.

## 4. Update the copy after a plugin upgrade

After the plugin is updated, `diff` reports the version gap on its first line:

```text
skraft_version 2.0.0-alpha.17 → 2.0.0-alpha.19
~ edge design_review -> design: max_visits 1 → 3
.skraft/pipeline.skraft.dot carries skraft_version 2.0.0-alpha.17, this plugin is 2.0.0-alpha.19; 1 changes from the skraft 2.0.0-alpha.19 workflow
```

The lines that follow mix your edits and those of the new workflow. To start again from the new
workflow:

1. Keep the output of `skraft workflow diff`: it lists your edits.
2. Rename the copy (`.skraft/pipeline.skraft.dot.old`), then `skraft workflow eject`.
3. Carry your edits over into the new copy.
4. `skraft workflow check`, then `skraft workflow diff`: the `skraft_version` line is gone and
   only your edits remain. Delete the old copy and commit.

## 5. Go back to the plugin's workflow

Delete the copy (`.skraft/pipeline.skraft.dot` or `.skraft/review.skraft.dot`) and commit.
`skraft workflow diff` then answers `the working copy has neither .skraft/pipeline.skraft.dot nor
.skraft/review.skraft.dot; the plugin's run as shipped …`.

## Troubleshooting

| Message | Action |
|---|---|
| `.skraft/pipeline.skraft.dot already exists; edit it, or remove it` | Edit the existing copy, or rename it before copying (step 4). |
| `locked node mutation is missing; keep it with unlock="<reason>" to skip it` | Put the node back and add `unlock="<reason>"`. |
| `<node> reaches the exit without passing gates; keep the run going through gates, or skip gates with unlock="<reason>"` | A node added after the gates bypasses them: place it before `gates`. |
| `loop a -> b -> a has no max_visits` | Add `max_visits` on an edge of the loop. |
| `mandatory node … is missing; this node is mandatory and cannot be removed` | Put the mandatory node back. |
| `the workflow has no node <id> any more; restore the workflow the run started with` | A run in progress was on the removed node: put the node back until that run finishes, or start a new slug. |

## See also

- [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }}) — syntax, validity rules,
  [locked]({{ "/en/reference/workflow-dot" | relative_url }}#locked-nodes) and
  [mandatory nodes]({{ "/en/reference/workflow-dot" | relative_url }}#mandatory-nodes).
- [`skraft workflow`]({{ "/en/reference/cli" | relative_url }}) — output and exit codes.
- [Adapting skraft: what each setting costs]({{ "/en/explanation/customisation-trade-offs" | relative_url }})
