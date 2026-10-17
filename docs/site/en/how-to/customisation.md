---
layout: doc
lang: en
title: "Customise SKRAFT"
description: "What you can adapt today in V2 (components, commands, base, mocking), what comes in the next lots, and the risk of each control you reduce."
persona: tech-lead
---

# Customise SKRAFT

**Goal**: adapt SKRAFT to your repository without removing, by accident, a proof your team relies on.

In V2, the **engine** decides the order of phases, the expected outputs, the retries, the verdicts and the gates. You do not tune those decisions; you describe your repository in `skraft-config.json`, and the engine sticks to it.

## What you can adapt today

Everything goes through `skraft-config.json`, at the root of the working copy that starts the run.

| What | Where | Effect | Guide |
|---|---|---|---|
| Components | `components[]`: `name`, `root`, `stack` | What the engine builds and tests, a neighbour repository included (`../payment-web`) | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Commands | a component's `commands` | A command you write is **always** the one that runs; the engine never replaces it with a default | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Gates | the commands named `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | What `skraft gate` runs, in that order | [Run the gates]({{ "/en/how-to/run-gates" | relative_url }}) |
| Base | global or per-component `baseBranch`, `--base <ref>` at init | The commit compared with: changed components, `{baseSha}` in commands | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Mocking | `mocking.strategy`: `"microcks"` or `"inprocess"` | `microcks` (default) needs Docker for the test gates; `inprocess` does not | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |

What cannot be tuned:

- **Quality thresholds** are not configurable.
- The order of phases, the number of attempts of an agent and the blocking codes live in the engine.
- A component's `paths` and `contractTesting` keys are accepted, but the engine reads them only from lots 3 and 6.

Other top-level keys of `skraft-config.json` are kept as they are by `skraft init`.

## What comes next

> **Coming next.** Ejecting the workflow (DOT graph) into your repository to adapt it: lot 3; its DELIVER gates will be locked and removed only with `unlock="<reason>"`. Agents and lenses of your own repository: lots 3 and 4. Full roadmap: [Home]({{ "/en/" | relative_url }}); why these decisions stay in the engine: [Architecture]({{ "/en/explanation/architecture" | relative_url }}).

## Risks — reducing the controls

Each setting above can also **remove a proof**. The engine runs what you write: it cannot tell whether your command really tests anything. Before you reduce a control, write the reason down where the team will read it (the PR description, an ADR).

| What you do | What disappears | The sign to watch |
|---|---|---|
| Remove a gate from a component (delete `mutation`, `architecture` or `coverage`) | The matching proof: no more mutation testing, no more dependency check, no more coverage | The gate no longer shows in the output of `skraft gate` nor in `gates/<component>/` |
| Replace a command with one that tests nothing (`"test": "node -e 0"`, a script that always exits 0, a filter that excludes almost every test) | The whole gate: it passes every time, whatever the code | `pass` evidence whose `stdout` shows no test run |
| Switch a component to `inprocess` with no contract test | The guarantee that your mocks still look like the real service; tests pass against an imaginary dependency | Green tests, then a failure at integration |
| Leave a component with no gate | Nothing proves that component; the engine reports it as an `environment` failure | `no gate command; …` in the output of `skraft gate` |
| Set `--base` or `baseBranch` to a ref that is too recent | Changed files fall outside the compared range: touched components are no longer kept by `skraft gate` | `no component changed since its base; no gate to run` while you did change code |
| Edit `events.jsonl` by hand to unblock a run | The journal as evidence: the chain breaks and the run is blocked with `journal-tampered` | See [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }}) |

To check that a gate still proves something, open its evidence (`.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log`) and read what the command really did.

What mutation testing measures, and why removing it is costly: [Glossary]({{ "/en/reference/glossary" | relative_url }}) (Jia & Harman, 2011).

## See also

- [skraft-config.json reference]({{ "/en/reference/skraft-config" | relative_url }})
- [Zero hooks, controls in the engine]({{ "/en/explanation/hooks" | relative_url }})
- [Architecture: engine and drivers]({{ "/en/explanation/architecture" | relative_url }})

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
