---
layout: doc
lang: en
title: "For executives"
description: "Why an organisation that delivers with AI assistants needs SKRAFT: discipline enforced by code, the same on every host, traceable and verifiable."
persona: manager
---

# For executives

> SKRAFT makes AI assistants follow the same engineering pipeline, on every workstation and
> every tool. The checks are made by a tested program, not left to the model's goodwill.

## Situation

Your teams already deliver with AI assistants: Claude Code, GitHub Copilot CLI, Copilot in
VS Code. Code arrives faster than before. Each developer picks their tool, their system
(Windows or macOS) and their way of asking.

## Complication

Speed guarantees neither quality nor consistency. An assistant produces plausible code; it
does not prove the code is tested. When the method lives in written instructions (the
"prose" of the prompts), each model applies it its own way, and each tool checks it its own
way.

The first version of SKRAFT showed it. A pipeline could take 8 h on a near-empty .NET
project under VS Code. The causes were structural:

- decisions left to the agent's prose;
- **hooks** (scripts the host runs on every tool call) that were costly and behaved
  differently on each host;
- sub-agents spawned by other sub-agents;
- bash recipes run under PowerShell;
- quality evidence assembled by the model itself.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Question

How do you get disciplined work from AI assistants, identical from one workstation to the
next, and verifiable by someone who was not there?

## Answer

SKRAFT V2 has the RESEARCH → DESIGN → DISTILL → DELIVER pipeline driven by an **engine**: a
tested program, shipped in the plugin, the same on every host. The engine decides the phase
order, the expected outputs, the retries and the gates. The assistants do the work; they do
not decide whether it is finished.

The enforced discipline has not changed since v1: Outside-In TDD, Clean Architecture,
adversarial review, mutation testing, BDD. What changes is who enforces it.

The research of Forsgren, Humble and Kim (*Accelerate*, 2018) points the same way: the
highest-performing teams do not trade speed against stability; they get both.

## What the organisation gets

### Discipline enforced by code, not by prose

The engine checks what an instruction can only hope for. It pre-creates the document an
agent must fill, checks it is filled, retries the agent once with the list of what is
missing, then stops and names the cause. No agent spawns another agent: only the **host
driver** (the part of SKRAFT specific to each tool) spawns agents, on the engine's order.

### The same pipeline on every tool and every system

The same engine runs in Claude Code (through a mod) and in GitHub Copilot CLI (through a
dynamic workflow). Commands run without a shell, with the same form under sh and
PowerShell. The engine's tests run on Windows, macOS and Linux.

> **Coming next.** VS Code will go through the Copilot SDK, with an agent-driven fallback
> loop: planned for lot 10.

### Auditable traceability

Every run writes an **event journal**: one line per fact (step started, result recorded,
phase closed, gate run). Each line carries the SHA-256 hash of the previous line. A hand
edit breaks that chain and the engine stops and says so. **Gate evidence** (command,
directory, result, output) is written by the engine, never by the model.

### Autonomous teams, without waiting for a release

Each repository describes its components and their commands in `skraft-config.json`: build,
test, format, lint, coverage, architecture, mutation. SKRAFT detects the projects (.NET,
Java, Python, TypeScript, JavaScript, React), proposes default commands, and checks that each
one can run. A command written by the team is always the one that runs. Quality thresholds,
however, are not negotiable: they are not configurable.

### What it takes to qualify a delivery

The coverage and mutation gates leave their evidence in the run folder. The QA team reads
the service's fragility there, and the end-to-end tests still to plan.

> **Coming next.** The test plan for the QA team and the run report (time, cost, retries
> per step): planned for lot 8. The mutation closing loop: planned for lot 7.

### Controlled cost

V2 ships no command hook: no program starts on each tool call.

> **Coming next.** Removing from the agents' prompts what the engine already checks, so they no
> longer pay to read instructions a program enforces: planned for lot 6 (goal: prompts at least
> 40 % smaller).

## Measurable goals

The V2 plan sets targets. They are **goals**, not measured results.

| Goal | Target |
| --- | --- |
| Duration of the reference run (empty .NET fixture, Mac and Windows) | Divided by at least 4 compared with the 8 h |
| Inconclusive evidence on that run | Zero |
| Retries caused by the environment on that run | Zero |
| Sum of agent prompts | Reduced by at least 40 % (284 KB in v1) |
| `skraft next` and `skraft record` (VS Code fallback) | Under 300 ms each |
| Overhead per tool call | 0 ms (no hook) |

The path to these targets is itself checked. Each lot is compared with v1 on the same test
projects: phases reached, verdicts, gates, artefacts, duration, cost, retries. A regression
blocks the lot's PR. The engine is covered by acceptance tests per use case and by mutation
testing in CI (80 % global threshold; the core aims at 100 %).

The same research (*Accelerate*, 2018) links software delivery performance to the
organisation's performance.

## How to adopt it

1. **A pilot on one repository.** Pick a real repository and a willing team. Install the
   `skraft` plugin in Claude Code or GitHub Copilot CLI. Prerequisites: Node 22 or later and
   Git; Docker if a component mocks its dependencies with Microcks (the default).
2. **Describe and check the components.** `skraft init` detects the projects and writes
   `skraft-config.json`; `skraft doctor` checks that each command can run. The team fixes
   the commands that do not work on their machines.
3. **A first RESEARCH run.** Start a story and read what it leaves: the research document,
   the run journal, the state shown by `skraft status`.
4. **Extend.** Add repositories and teams as lots ship: each lot adds a phase or a check.

The [getting started tutorial]({{ "/en/tutorials/getting-started" | relative_url }}) walks
through this step by step.

## Available today and roadmap

**Today (lots 0 to 2)**: the RESEARCH phase end to end in Claude Code and Copilot CLI; the
chained journal and resume; component-based `skraft-config.json`, detection,
`skraft doctor`; the comparison base per repository; gates, run by hand with `skraft gate`.

| Lot | What it adds |
| --- | --- |
| 3 | DESIGN, DISTILL and DELIVER driven by the engine; write scope checked by git diff at each step; customisable workflow |
| 4 | Code review through isolated lenses, verdict computed by the engine |
| 5 | Human decisions (`skraft decide`): ADR ratification, escalations |
| 6 | Agents and skills pruned, smaller prompts |
| 7 | Mutation closing loop |
| 8 | Full views (Copilot Canvas, Claude Code panel), run report, screenshots published in the PR |
| 9 | `skraft-brownfield` plugin for existing code |
| 10 | VS Code (Copilot SDK, then fallback) |
| 11 | Switch-over and version 2.0.0 |

## Who it is for

| Role | What SKRAFT gives them |
| --- | --- |
| Engineering leadership, team lead | One method across every team, and a verifiable trace of each run |
| Developer on VS Code (Windows or Mac) | A run that progresses with no hidden setting or silent block, and resume after an interruption (lot 10) |
| Developer on Claude Code or Copilot CLI | The same run, faster when the host allows it |
| Developer whose script does not work on their machine | Replace a command in `skraft-config.json` without waiting for a release |
| QA team | The test plan and the coverage and mutation evidence |
| SKRAFT maintainer | A tested engine, safe to change, where every check has a proven value |

## Going further

- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — the engine, the host drivers, depth 1.
- [Guardrails: from hook to engine]({{ "/en/explanation/hooks" | relative_url }}) — why V2 starts with zero hooks.
- [State and recovery]({{ "/en/explanation/hve-core" | relative_url }}) — the chained journal.
- [Configure components]({{ "/en/how-to/configure-components" | relative_url }}).

## Sources

- Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.
- Martin, R. C., *Clean Architecture*, 2017.
