---
title: "Add a lens to a review"
description: "Add a repository lens to the design or DELIVER review, change a lens's model family, and check the workflow with check and diff."
persona: tech-lead
---

# Add a lens to a review

Have every run reviewed by a lens of your team (a threat model, for instance), on top of skraft's
lenses.

## Prerequisites

- A configured repository, Git, and a terminal at the root of the working copy; `skraft` is the command that [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.
- The lens's prompt, written as an agent of your repository named `<name>-lens`.

## 1. Write the lens's agent

A `threat-model` lens runs as the agent `threat-model-lens`. Create its file for each host the
team uses:

| Host | File |
|---|---|
| Claude Code | `.claude/agents/threat-model-lens.md` |
| Copilot CLI, VS Code | `.github/agents/threat-model-lens.agent.md` (or `.md`) |

The lens answers in the format the engine reads:
[A lens's answer](../reference/gates.md#lens-answer).

## 2. Copy the workflow of the review you target

| Review | Command | File copied |
|---|---|---|
| DESIGN, DISTILL or mutation | `skraft workflow eject` | `.skraft/pipeline.skraft.dot` |
| DELIVER (and `skraft review --pr`) | `skraft workflow eject review` | `.skraft/review.skraft.dot` |

```text
.skraft/review.skraft.dot holds the skraft 2.0.0-alpha.19 review; every call to review runs it
```

Once a file is copied, every run of the working copy follows it.

## 3. Add the lens node and its two edges

A lens is a `shape=note` node between the review's fan-out and its refuter (`shape=octagon`), which leads to the fan-in.

**Design review**, in `.skraft/pipeline.skraft.dot`:

```text
design_review_threat_model [shape=note, lens="threat-model"]
design_review_lenses -> design_review_threat_model -> design_review_refuter
```

**DELIVER review**, in `.skraft/review.skraft.dot`, between `lenses` and `refuter`:

```text
threat_model [shape=note, lens="threat-model"]
lenses -> threat_model -> refuter
```

Node options:

- `model="<family>"` chooses the lens's model family (an `assign.agents` rule wins, see
  [Choose the agents' models](./choose-models.md));
- `when="mock"` or `when="contract"` runs it only when the changes touch mocks or contracts
  ([conditional lenses](../reference/workflow-dot.mdx#conditional-lenses)).

## 4. Check the workflow

```console
$ skraft workflow check
$ skraft workflow diff
```

Expected result:

```text
.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH
+ node design_review_threat_model (lens threat-model)
.skraft/pipeline.skraft.dot: 1 changes from the skraft 2.0.0-alpha.19 workflow
```

Commit `.skraft/` and the agent's file: the lens runs at the next review, with the others.

## Troubleshooting

| Message | Action |
|---|---|
| `node deliver_review: lens threat-model (agent threat-model-lens) not found in the plugin, .claude/agents/ or .github/agents/` | Create the agent's file under the name `<name>-lens`. |
| `mandatory node test_integrity (…) is missing; this node is mandatory and cannot be removed` | Put the node back: the fan-ins, `deliver_review` and the `test-integrity` and `architecture-boundaries` lenses are mandatory ([mandatory nodes](../reference/workflow-dot.mdx#mandatory-nodes)). |
| `.skraft/pipeline.skraft.dot already exists; edit it, or remove it` | Edit the existing copy. |
| A `lenses="a,b,c"` node refused | A workflow copied before the current form: replace the node with the nodes and edges the message writes out. |
| The lens does not run | Check that no `when` leaves it out, and that the run follows `.skraft/` (`skraft workflow check` names the file). |

## Next steps <!-- #next-steps -->

- [Review: fan-out, lens nodes, refuter, fan-in](../reference/workflow-dot.mdx#reviews)
  and [call node](../reference/workflow-dot.mdx#call-node).
- [Gates](../reference/gates.md#review-run) — a lens's answer, refutation,
  verdict.
- [Adapting skraft: what each setting costs](../explanation/customisation-trade-offs.md)
