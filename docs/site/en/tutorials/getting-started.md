---
layout: doc
lang: en
title: "Getting Started"
description: "Install SKRAFT with /plugin, choose the right journey, and run the first workflow."
persona: software-engineer
---

# Getting Started

> Install the plugin in your assistant, choose your starting point, then run the workflow that fits your project.

## Before you begin

- **Claude Code**, to use the `/plugin` commands below
- a target repository open in your assistant
- GitHub access only when you want to work from issues

Node.js, APM, and a clone of the SKRAFT repository are not required to use the
plugin. They belong to development of the plugin itself.

## 1. Install SKRAFT with `/plugin`

Enter these commands in the Claude Code conversation, not in a terminal:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

The first command adds the repository as a marketplace. The second installs the
`skraft` plugin published by that marketplace. Then open `/plugin` and check that
`skraft` appears under installed plugins.

## 2. Choose your journey

Do not automatically run one global chain. The right starting point depends on
what your repository already has.

| Your situation | Start with | Then |
| --- | --- | --- |
| A refined story already exists | `skraft-orchestrator` | engineering pipeline |
| Issues exist but are not prepared | `backlog-discoverer`, then `backlog-planner` | `skraft-orchestrator` |
| Code exists without product documentation | `brownfield-analyst` | PRD, issue creation, product preparation, then `skraft-orchestrator` |
| Legacy code is unsafe to change | `brownfield-harness-builder`, then `brownfield-refactorer` | return to a prepared story, then `skraft-orchestrator` |

The Brownfield, DISCOVER, and DISCUSS workflows are invoked directly. They are
not hidden phases of `skraft-orchestrator`. Read the
[Brownfield journey]({{ "/en/explanation/brownfield" | relative_url }}) when
taking over an existing system.

## 3. Run the first workflow

### Story already prepared

In the agent selector, choose `skraft-orchestrator`, then give it the refined
story. This is the sole entrypoint for the engineering pipeline. It loads its
persistent state and resumes from the last validated point.

### Backlog still raw

First choose `backlog-discoverer` in the agent selector. Once triage is complete,
choose `backlog-planner` to refine the selected issue. The refined story then
becomes the input to `skraft-orchestrator`.

## 4. Understand what will run

The core journey has two distinct areas:

1. **Optional standalone product preparation**
	- **DISCOVER** triages and prioritizes issues
	- **DISCUSS** turns an issue into a verifiable story
2. **Engineering pipeline driven by `skraft-orchestrator`**
	- **RESEARCH** reduces uncertainty when the work justifies it
	- **DESIGN** makes and records architecture decisions
	- **DISTILL** produces executable scenarios and the plan
	- **DELIVER** implements with Outside-In TDD and gathers evidence

RESEARCH may be skipped when routing concludes that a dedicated investigation
would add no value. DISCOVER and DISCUSS are never dispatched by
`skraft-orchestrator`: you choose them before it when your input is not yet a
ready story.

## 5. Continue reading

- [Choose an entrypoint and see the pipeline]({{ "/en/explanation/pipeline/" | relative_url }})
- [Follow one request end to end]({{ "/en/explanation/pipeline/fil-rouge" | relative_url }})
- [Take over a Brownfield system]({{ "/en/explanation/brownfield" | relative_url }})
