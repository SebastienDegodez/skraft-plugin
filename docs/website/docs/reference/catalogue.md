---
title: "Agentic catalogue and quality"
description: "Every agent, worker, review lens and skill skraft ships, with its context profile and its evaluation evidence."
persona: software-engineer
---

# Agentic catalogue and quality

The catalogue lists everything the skraft plugin ships: agents, workers, review lenses and
skills, the orchestration chains that link them, and, for each one, its context profile and
the evidence of its controlled evaluations. It is built from the plugin sources each time the
handbook is published, so it never lists a component the plugin no longer ships.

**[Open the catalogue](pathname:///dashboard/)**

![The catalogue: the number of skills, of agents, workers and review lenses, of skills with an evaluation spec and of subjects with published evidence, then the Catalogue, Quality, Efficiency and Models tabs and their filters](/img/screenshots/en/dashboard-catalogue-light.png#gh-light-mode-only)
![The catalogue: the number of skills, of agents, workers and review lenses, of skills with an evaluation spec and of subjects with published evidence, then the Catalogue, Quality, Efficiency and Models tabs and their filters](/img/screenshots/en/dashboard-catalogue-dark.png#gh-dark-mode-only)

## What each view shows

| View | What it shows |
|---|---|
| Catalogue | Each agent, worker, lens and skill, its source file, its context profile and its latest verdict. The usage order: optional product workflows, then the engineering pipeline, then the independent roots. |
| Quality | Per skill and per agent model: the baseline score, the score with the skill, the lift, the activation rate and the verdict across paired trials. |
| Efficiency | Per skill and per agent model: median duration, tokens, turns and tool calls, with and without the skill. |
| Models | The agent models scored by the same judge on the same skill, one row each. |

The search box and the agent-model filter apply to every view. A component with no published
run says so: no data is not a pass.
