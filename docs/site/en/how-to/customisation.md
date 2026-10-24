---
layout: doc
lang: en
title: "Customise SKRAFT"
description: "What you can adapt today in V2 (components, commands, base, mocking, models and effort per agent, questions to a human), what comes in the next lots, and the risk of each control you reduce."
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
| Models and effort | `models`, `assign`, also in `~/.skraft/config.json` and `skraft-config.local.json` | The model and the reasoning effort of each agent, per host | [below](#models-and-effort) |

What cannot be tuned:

- **Quality thresholds** are not configurable.
- The order of phases, the number of attempts of an agent and the blocking codes live in the engine.
- A component's `paths` and `contractTesting` keys are accepted, but the engine reads them only from lots 3 and 6.

Other top-level keys of `skraft-config.json` are kept as they are by `skraft init`.

## Choose the model and the effort of each agent {#models-and-effort}

`models` and `assign` choose what each agent runs on, on Claude Code and on Copilot. Four files apply, each one a JSON Merge Patch on the ones before it (an object is merged key by key, a list or a value replaces the earlier one, `null` removes it):

1. the plugin's defaults: `economy` → `haiku`, `standard` → `sonnet`, `frontier` → `opus` on Claude Code; lenses on `reviewer`, `solution-researcher` on `researcher`, `solution-architect` on `planner`, every other agent on `implementer`;
2. `~/.skraft/config.json`, yours, for every repository;
3. `skraft-config.json`, the team's, committed;
4. `skraft-config.local.json`, yours, never committed: `skraft init` adds it to `.gitignore`.

Files 2 and 4 follow `plugins/skraft-framework/schemas/skraft-config.local.schema.json` and hold neither `components` nor `workflow`; file 3 follows `skraft-config.schema.json`.

- **A family** is a tier (`economy` < `standard` < `frontier`, the only rank), a role whose tier is built in (`reviewer` → economy, `researcher` and `implementer` → standard, `planner` → frontier; `"tier"` changes it) or a free family that declares its `"tier"` (`gpt-codex`). A family is never a versioned model: `gpt-5.5` is a model.
- **`models`** gives each family, per host (`claude-code`, `copilot`), a `model` — or a list tried in order, with the same effort — and an `effort` (`low`, `medium`, `high`, `xhigh`, `max`). What a family leaves out comes from its tier, then the host decides.
- **`assign`** chooses the family: a string names it, `inherit` leaves the choice to the host, an object adds an `effort` per host (never a model), `null` removes a rule a lower file set.

Resolution, family and effort apart:

| What | First that applies |
|---|---|
| Family | `assign.agents.<agent>` → the family an ejected workflow names (`model=`, `<lens>@<family>`, `refuter=`) → `assign.types.<phase, lens, refuter, worker>` → `assign.default` → the host (Claude Code: the agent file's `model:`; Copilot: `/agents`, then the session) |
| Model on a host | the family's for that host → its tier's → the host |
| Effort on a host | `assign.agents.<agent>` for that host → `assign.types.<type>` for that host → the family's → its tier's → the host |
| Refuter | a rule or `refuter=` naming its family, else one tier above the strongest lens it checks, `frontier` at most |

A developer's local file, for instance:

```json
{
  "$schema": "./plugins/skraft-framework/schemas/skraft-config.local.schema.json",
  "models": {
    "economy":  { "claude-code": { "model": "haiku",  "effort": "low" },    "copilot": { "model": "gpt-5.5", "effort": "low" } },
    "standard": { "claude-code": { "model": "sonnet", "effort": "medium" }, "copilot": { "model": "gpt-5.5", "effort": "high" } },
    "frontier": { "claude-code": { "model": "opus",   "effort": "high" },   "copilot": { "model": "gpt-6.0", "effort": "xhigh" } },
    "implementer": { "copilot": { "model": ["gpt-6.0", "gpt-5.5"] } },
    "gpt-codex":   { "tier": "standard", "copilot": { "model": "gpt-5.5-codex", "effort": "medium" } },
    "deep-review": { "tier": "frontier", "claude-code": { "model": "opus", "effort": "max" }, "copilot": { "model": "gpt-6.0", "effort": "xhigh" } }
  },
  "assign": {
    "types": { "lens": "economy" },
    "agents": {
      "software-engineer": "gpt-codex",
      "cold-reader-lens": "deep-review",
      "architecture-boundaries-lens": { "claude-code": { "effort": "high" }, "copilot": { "effort": "high" } },
      "solution-architect": { "family": "planner", "claude-code": { "effort": "max" } },
      "fitness-lens": null
    }
  }
}
```

With the team's `{ "assign": { "agents": { "fitness-lens": "implementer" } } }`, the `null` gives `fitness-lens` back to the type rule: every lens runs on `economy`, `cold-reader-lens` on `deep-review` (opus · max, gpt-6.0 · xhigh), `software-engineer` on `gpt-codex` (sonnet · medium from its tier, gpt-5.5-codex · medium), `acceptance-designer` tries gpt-6.0 then gpt-5.5 on Copilot.

- Without any of these files, Claude Code gets the aliases of the defaults and Copilot gets no model: it runs each agent on the session's model.
- `skraft doctor` shows, per host, each agent the workflow dispatches with its family, tier, model, effort and the source of each, and warns of a family with no model for a host, of `max` on a Copilot model whose name has no `claude`, of `CLAUDE_CODE_EFFORT_LEVEL` and of a `~/.copilot/settings.json` agent setting skraft masks; an agent rule naming an agent nobody provides fails, with the closest name.
- `skraft workflow check` warns of a `model=`, `@<family>` or `refuter=` of your workflow that an agent rule masks, the plugin's defaults included.
- A run journals what each agent ran on; a resumed run replays it, whatever the files say since.
- The Claude Code mod passes the model but not the effort: `$.agent.spawn` takes none (Claude Code 2.1.305); the agent file's own effort applies.

## Ask a human in the workflow

The workflow is a DOT graph (`workflows/skraft.dot` in the plugin; `skraft workflow eject` copies it into your repository). A node of shape `hexagon` is an **ask node**: it puts a question to a human, and the run waits until the answer comes. The default workflow asks for the ratification of the ADRs DESIGN proposed, once the design review approved them (the review loops after DESIGN shortened):

```text
start -> research -> design -> design_review
design_review -> design  [label="NEEDS_REWORK", max_visits=3]
design_review -> adr     [label="APPROVED"]
adr      [shape=hexagon, question="adr-ratification"]
adr -> distill   [label="RATIFIED"]
adr -> design    [label="REJECTED", max_visits=3]
distill -> distill_review -> deliver -> gates -> mutation -> deliver_review -> exit
mutation -> kill_mutants [label="FAIL", max_visits=5]
kill_mutants [agent="software-engineer", each="survivor-file"]
kill_mutants -> mutation_review   // lenses="test-integrity"
mutation_review -> gates [label="APPROVED"]
```

The `gates` and `mutation` nodes are `locked=true`: a repository workflow drops one only with `unlock="<reason>"`. Unlocking `mutation` is the only way to run without mutation testing; it is not recommended.

The engine judges mutation from the report the tool writes, not from its exit code. It scores the files changed since the component's base (every file of the report when there is no base or Git cannot list the changes): the core (a file under a folder of the component whose last word is `domain` or `application`, as in `Checkout.Domain`, `checkout-domain`, `src/cart/application`) must reach 100 %, the boundary (everything else) 80 %. A score is detected mutants (killed, timed out, and PIT's memory errors) over detected and surviving ones (survived, no coverage); the bar is not configurable and decides, whatever the tool's exit code. When a scope misses its bar, the engine sends that scope's surviving mutants to `kill_mutants`, one dispatch per file. `mutation_review` checks the new tests with `test-integrity`, then the gates run again. The loop stops when mutation passes; when two rounds leave no fewer mutants alive than the best round before them (`mutation-stalled`); or at its `max_visits`. The last two stops name the mutants that remain.

The report is read where each stack's default command writes it: `StrykerOutput/reports/mutation-report.json` (.NET), `reports/mutation/mutation.json` (JavaScript, TypeScript, React), `target/pit-reports/mutations.xml` (Java, Maven) or `build/reports/pitest/mutations.xml` (Gradle). It must be in the mutation-testing-elements JSON format or be PIT's XML. A command that writes elsewhere names its file with `mutationReport` on the component, relative to its root. With Gradle, set PIT's `outputFormats` to include `XML` in the build; a multi-module Maven project writes one report per module, so name the one to read with `mutationReport`. Python has no default report: give `mutationReport`, for example the `mutation-report.json` that the `quality-gates-python` mutation script writes in its evidence folder. A mutation run without a readable report waits for a human, whatever its exit code. Each default uses its tool's incremental mode, so a round of the loop does not mutate the whole project again: StrykerJS `--incremental`, PIT `-DwithHistory`, Stryker.NET `--since:{baseSha}`; whatever the tool mutates, the bar is judged on the files changed since the base.

| Question | Answers | Refusal |
|---|---|---|
| `adr-ratification` | `RATIFIED`, `REJECTED` | `REJECTED`, with a reason |
| `reporting-consent` | `ACCEPTED`, `DECLINED` | — |

`reporting-consent` asks once per repository whether skraft may publish the screenshots and videos of its runs; the answer goes into `skraft-config.json` (`publish.visuals`). It is not in the default workflow yet; your repository's workflow can add it.

Edge rules out of an ask node:

- each edge is labelled with an answer;
- one unlabelled edge takes every answer that has no edge of its own, except a refusal;
- a refusal needs its own labelled edge, normally back to the node whose work it refuses, with `max_visits` to bound the loop;
- an ask node inherits its phase like any other node.

The engine refuses a workflow with an unknown question, an ask node without `question`, two unlabelled edges out of an ask node, two edges for the same answer, a label that is not an answer, a refusal without its own edge, or a loop none of whose edges carries `max_visits`. Examples: `node adr: REJECTED needs an edge of its own, back to the node whose work it refuses`, `node adr: no edge for RATIFIED; label one RATIFIED, or leave one unlabeled`, `loop adr -> design -> design_review -> adr has no max_visits`.

## What comes next

> **Coming next.** Agents and lenses of your own repository: lots 3 and 4. Full roadmap: [Home]({{ "/en/" | relative_url }}); why these decisions stay in the engine: [Architecture]({{ "/en/explanation/architecture" | relative_url }}).

## Risks — reducing the controls

Each setting above can also **remove a proof**. The engine runs what you write: it cannot tell whether your command really tests anything. Before you reduce a control, write the reason down where the team will read it (the PR description, an ADR).

| What you do | What disappears | The sign to watch |
|---|---|---|
| Remove a gate from a component (delete `architecture` or `coverage`) | The matching proof: no more dependency check, no more coverage | The gate no longer shows in the output of `skraft gate` nor in `gates/<component>/` |
| Unlock the `mutation` node | Mutation testing, and the loop that kills surviving mutants | `skraft workflow diff` shows the unlock; the run journals the node as skipped with its reason. Deleting a component's `mutation` command instead stops the run at `mutation` as an `environment` failure |
| Replace a command with one that tests nothing (`"test": "node -e 0"`, a script that always exits 0, a filter that excludes almost every test) | The whole gate: it passes every time, whatever the code | `pass` evidence whose `stdout` shows no test run |
| Switch a component to `inprocess` with no contract test | The guarantee that your mocks still look like the real service; tests pass against an imaginary dependency | Green tests, then a failure at integration |
| Leave a component with no gate | Nothing proves that component; the engine reports it as an `environment` failure | `no gate command; …` in the output of `skraft gate` |
| Set `--base` or `baseBranch` to a ref that is too recent | Changed files fall outside the compared range: touched components are no longer kept by `skraft gate` | `no component changed since its base; no gate to run` while you did change code |
| Remove the `adr` ask node | Human ratification of the architecture decisions: ADRs stay `Proposed` | `skraft workflow diff` shows the node gone. Removing only its `REJECTED` edge's `max_visits` removes nothing: the engine refuses the workflow (`loop adr -> design -> design_review -> adr has no max_visits`) |
| Edit `events.jsonl` by hand to unblock a run | The journal as evidence: the chain breaks and the run is blocked with `journal-tampered` | See [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }}) |

To check that a gate still proves something, open its evidence (`.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log`) and read what the command really did.

What mutation testing measures, and why removing it is costly: [Glossary]({{ "/en/reference/glossary" | relative_url }}) (Jia & Harman, 2011).

## See also

- [skraft-config.json reference]({{ "/en/reference/skraft-config" | relative_url }})
- [Zero hooks, controls in the engine]({{ "/en/explanation/hooks" | relative_url }})
- [Architecture: engine and drivers]({{ "/en/explanation/architecture" | relative_url }})

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
