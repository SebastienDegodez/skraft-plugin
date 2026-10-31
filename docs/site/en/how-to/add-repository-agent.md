---
layout: doc
lang: en
title: "Add a repository agent to the pipeline"
description: "Hand a pipeline step to an agent written in your repository: write its file for each host, add it as a node of the ejected workflow with its outputs and write paths, place it before the gates, and check with check, diff and doctor."
persona: tech-lead
---

# Add a repository agent to the pipeline

**Goal**: have every run perform a step of your team's own (updating the user guide, for
instance), by an agent written in your repository.

For a review rather than a step that produces:
[Add a lens to a review]({{ "/en/how-to/customise-review" | relative_url }}).

## Prerequisites

- A configured repository, Git, and a terminal at the root of the working copy; `skraft` is the command that [`npm i -g @skraft/cli`]({{ "/en/how-to/install-on-a-host" | relative_url }}#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.
- The workflow copied into `.skraft/pipeline.skraft.dot`
  ([Copy and adapt the workflow]({{ "/en/how-to/eject-workflow" | relative_url }})).

## 1. Write the agent

Pick a kebab-case id no skraft agent carries: with the same id, the plugin's agent is taken
first. Create its file for each host the team uses:

| Host | File |
|---|---|
| Claude Code | `.claude/agents/user-docs-writer.md` |
| Copilot CLI, VS Code | `.github/agents/user-docs-writer.agent.md` (or `.md`) |

```markdown
---
name: user-docs-writer
description: Updates the user guide under docs/user for the run's story.
---
Read the brief, update docs/user for what the story changes, then write the summary it asks for.
```

## 2. Add the node to the workflow

In `.skraft/pipeline.skraft.dot`, declare a `shape=box` node that names the agent, then wire it.
An agent that changes the working copy goes **before** `gates`, so that its changes pass the
gates and the DELIVER review:

```text
user_docs [shape=box, agent="user-docs-writer", outputs="changes/{date}/user-docs-{slug}.md", writes="docs/user"]

deliver -> user_docs -> gates
```

and remove the `deliver -> gates` edge it replaces.

| Attribute | Effect |
|---|---|
| `agent` | the agent's id, looked for in the plugin, then in `.claude/agents/` or `.github/agents/` |
| `outputs` | the files the agent must fill, relative to the run's tracking folder; `{date}` and `{slug}` are filled at dispatch |
| `writes` | the paths of the working copy it may change; without `writes`, it writes only in the tracking folder |
| `max_attempts` | attempts per pass; default 3 |
| `model` | its model family ([Choose the agents' models]({{ "/en/how-to/choose-models" | relative_url }})) |

The brief the engine gives the agent lists these outputs, the paths it may write and the other
steps' outputs to read. After each attempt, the engine checks that every output is filled and
that nothing was written outside those paths.

## 3. Check

```text
skraft workflow check
skraft workflow diff
skraft doctor
```

Expected result:

```text
.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH
+ node user_docs (agent user-docs-writer)
+ edge deliver -> user_docs
+ edge user_docs -> gates
- edge deliver -> gates
.skraft/pipeline.skraft.dot: 4 changes from the skraft 2.0.0-alpha.19 workflow
```

In the `skraft doctor` tables, a `user_docs  user-docs-writer` row gives the family and the model
the agent will run on, on each host.

Commit `.skraft/` and the agent's files: the step runs on the next run.

## Troubleshooting

| Message | Action |
|---|---|
| `node user_docs: agent user-docs-writer not found in the plugin, .claude/agents/ or .github/agents/` | Create the agent's file under the id's exact name, for the host in use. |
| `user_docs reaches the exit without passing gates; keep the run going through gates, or skip gates with unlock="<reason>"` | The node sits after the gates: move it before `gates`. |
| `user_docs reaches the exit without passing mandatory node deliver_review; …` | Same cause: the node bypasses the DELIVER review. |
| `node user_docs: attribute <key> is not supported on a box node (supported: …)` | Use only the attributes listed in step 2. |
| `out of write scope: <path>` in the journal | The agent wrote outside `writes`: widen `writes`, or tighten its prompt. |
| `missing-outputs` | The agent did not fill an output of `outputs` after its attempts: fix its prompt, then start a new slug. |
| The plugin's agent runs instead of yours | A skraft agent carries the same id: rename yours. |

## See also

- [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }}#node-attributes) — every
  attribute of an agent node.
- [Copy and adapt the workflow]({{ "/en/how-to/eject-workflow" | relative_url }})
- [Adapting skraft: what each setting costs]({{ "/en/explanation/customisation-trade-offs" | relative_url }})
