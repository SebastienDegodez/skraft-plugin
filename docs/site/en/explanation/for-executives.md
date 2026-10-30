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
agent must fill, checks it is filled, retries the agent with the list of what is missing (at
most three attempts), then stops and names the cause. It also checks after each step that the
agent wrote only where it may, and that each red TDD commit really fails. No agent spawns another agent: only the **host
driver** (the part of SKRAFT specific to each tool) spawns agents, on the engine's order.

### The same pipeline on every tool and every system

The same engine runs in Claude Code (through a mod), in GitHub Copilot CLI (through a
dynamic workflow) and in VS Code (through the Copilot SDK, or an agent-driven fallback loop
when the SDK is missing). Commands run without a shell, with the same form under sh and
PowerShell. The engine's tests run on Windows, macOS and Linux.

### Auditable traceability

Every run writes an **event journal**: one line per fact (step started, result recorded,
phase closed, gate run). Each line carries the SHA-256 hash of the previous line and a
signature under a key of the machine that runs it. A hand edit breaks that chain and the
engine stops and says so. **Gate evidence** (command,
directory, result, output) is written by the engine, never by the model.

### Autonomous teams, without waiting for a release

Each repository describes its components and their commands in `skraft-config.json`: build,
test, format, lint, coverage, architecture, mutation. SKRAFT detects the projects (.NET,
Java, Python, TypeScript, JavaScript, React), proposes default commands, and checks that each
one can run. A command written by the team is always the one that runs. Quality thresholds,
however, are not negotiable: they are not configurable.

### What it takes to qualify a delivery

The coverage and mutation gates leave their evidence in the run folder. Mutation must reach
100 % on the business core and 80 % elsewhere; the engine sends the surviving mutants back to
the engineer, file by file, until the bar is met or the run names what remains. `qa-report.md`
gathers the test plan, the gates, the mutation scores and the review verdicts for the QA team;
`run-report.md` gives the time, cost and retries of each step. The run ends with a pull request
described from the journal, with the screenshots of a front end.

### Controlled cost

V2 ships no command hook: no program starts on each tool call. The agents' prompts no longer
carry what the engine already checks, so they do not pay to read instructions a program
enforces. Each agent's model is a family chosen in the configuration: an economical one for
the review lenses, a stronger one where planning needs it.

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
   `skraft` plugin in Claude Code, GitHub Copilot CLI or VS Code. Prerequisites: Node 22 or later and
   Git; Docker if a component mocks its dependencies with Microcks (the default outside TypeScript, JavaScript and React).
2. **Describe and check the components.** `skraft init` detects the projects and writes
   `skraft-config.json`; `skraft doctor` checks that each command can run. The team fixes
   the commands that do not work on their machines.
3. **A first run.** Start a story and read what it leaves: the research document, the ADRs,
   the acceptance tests, the delivered code, `qa-report.md` and the draft pull request.
4. **Extend.** Add repositories and teams; adapt the workflow in `.skraft/` where a team needs
   an extra agent, lens or question.

The [getting started tutorial]({{ "/en/tutorials/getting-started" | relative_url }}) walks
through this step by step.

## Available today and roadmap

**Today**: the four phases RESEARCH, DESIGN, DISTILL and DELIVER driven by the engine in
Claude Code, Copilot CLI and VS Code; a customisable workflow; write scope checked by git diff
at each step; code review through isolated lenses, with a verdict computed by the engine;
human decisions (ADR ratification, escalations); the mutation closing loop; the Claude Code
pane, the run report and the QA report; the end-of-run pull request with its screenshots and
issue comment; `skraft review --pr` to review any pull request with the same lenses;
`skraft migrate` for runs started with v1; the `skraft-brownfield` plugin for existing code.

**Coming in 2.0.0**: a Copilot Canvas view, and the final v1/V2 comparison on every fixture.

## Who it is for

| Role | What SKRAFT gives them |
| --- | --- |
| Engineering leadership, team lead | One method across every team, and a verifiable trace of each run |
| Developer on VS Code (Windows or Mac) | A run that progresses with no hidden setting or silent block, and resume after an interruption |
| Developer on Claude Code or Copilot CLI | The same run, faster when the host allows it |
| Developer whose script does not work on their machine | Replace a command in `skraft-config.json` without waiting for a release |
| QA team | The test plan and the coverage and mutation evidence |
| SKRAFT maintainer | A tested engine, safe to change, where every check has a proven value |

## Going further

- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — the engine, the host drivers, depth 1.
- [Guardrails: from hook to engine]({{ "/en/explanation/guardrails" | relative_url }}) — why V2 starts with zero hooks.
- [The event journal]({{ "/en/explanation/event-journal" | relative_url }}) — the chained journal.
- [Configure components]({{ "/en/how-to/configure-components" | relative_url }}).

## Sources

- Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.
- Martin, R. C., *Clean Architecture*, 2017.
