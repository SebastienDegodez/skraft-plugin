---
layout: doc
lang: en
title: "Evaluate a skill"
description: "Prove that a skill actually improves the agent's answer: write an evaluation spec, validate it without spending quota, run the comparison, read the verdict and publish the evidence."
persona: tech-lead
---

# Evaluate a skill

A skill is a **claim**: *"an agent that loads this file produces a better result than one that does not."* Until someone measures it, that claim is an intuition.

This guide covers the task: turning that intuition into evidence published on the [dashboard]({{ "/dashboard/" | relative_url }}).

## The principle in one sentence

The same prompts are sent twice — **once with no skill at all** (baseline), **once with only the skill under test** (skilled) — and a judge compares the two trajectories. Nothing else differs between the two passes, so any difference in outcome is attributable to the skill and to nothing else.

## Step 1 — Create the evaluation spec

Create `tests/skills/<skill>/eval.yaml`, where `<skill>` is **exactly** the directory name under `plugins/skills/`. That path is how the experiment resolves which skill to load: if the two names diverge, the baseline and the skilled pass become identical and the evaluation measures nothing.

```yaml
name: outside-in-tdd
description: Checks that the feature is driven from an observable business behaviour.
type: capability
defaults:
  timeout: 3m
  runs: 3
stimuli:
  - name: Drive a business rule from the outside
    prompt: |
      Our online ordering application must apply a loyalty discount to the
      payable total. An unknown order must produce a not-found error.
      Implement it.
    graders:
      - type: prompt
    rubric:
      - Starts from a test that crosses the service's visible boundary, described in business terms.
      - Lets the internal breakdown emerge from the tests instead of fixing it up front.
      - Ties every production change to a test that failed before it and passes after it.
```

## Step 2 — Follow the four rules that keep the measurement honest

A badly written spec produces a reassuring number that measures nothing. These four rules are what separates evidence from a placebo.

1. **Never name the skill in a prompt**, and never copy its wording. A prompt that tells the agent which technique to use removes exactly what the evaluation is trying to observe.
2. **Judge the outcome, not the technique.** "Identified the missing dependency as the cause of the failure" is an outcome. "Ran the diagnostic command with the verbose flag" is an implementation detail that a different, equally valid approach would fail.
3. **Include a non-activation case.** Add a stimulus that *looks* like the skill's territory but falls outside it, and mark it `tags: { intent: non-activation }`. Restraint is part of the expected behaviour: a skill that fires everywhere costs context and returns nothing.
4. **Budget at least 5 trials** (`stimuli × runs`). Below that no verdict is credible — and the dashboard will report it as inconclusive rather than as a pass.

## Step 3 — Validate without spending quota

Neither command calls a model. Run both before any real execution.

```bash
npx --yes @microsoft/vally-cli@0.12.0 lint --eval-spec tests/skills/<skill>/eval.yaml --strict
npx --yes @microsoft/vally-cli@0.12.0 experiment run skraft-plugin.experiment.yaml --dry-run
```

The dry run prints a `baseline` plan and a `skilled` plan for every evaluation. Check two things in it:

- the two variants' **`Eval hash`** are **identical** — the prompts did not move;
- their **`Config hash`** are **different** — the skill set genuinely changed.

If the config hashes match, the directory name does not resolve to a shipped skill. Fix that before going further.

## Step 4 — Run the evaluation

A run drives a real agent. It needs `COPILOT_GITHUB_TOKEN`: a fine-grained PAT carrying the **Account › Copilot Requests** permission. The auto-generated Actions token cannot reach Copilot.

```bash
./eng/run-skill-evals.sh <skill>   # a single skill
./eng/run-skill-evals.sh           # every evaluated skill
```

In continuous integration the `skill-evaluation` workflow does the same on a schedule, then publishes the verdicts.

## Step 5 — Read the verdict

The judge reports a tally of wins, ties and losses. That tally becomes a verdict through an **exact two-sided binomial sign test**: a majority of wins is not enough, it must also be unlikely under chance.

| Verdict | What it means |
|---|---|
| `pass` | complete comparison, enough trials, significant advantage |
| `regression` | same bar, but the advantage lies with the baseline — the skill degrades the answer |
| `no-improvement` | sound comparison, but the margin is indistinguishable from chance |
| `inconclusive` | a trial errored, a trial was unmatched, or there were fewer than 5 trials |

A missing or fragile result is **never** rendered as a pass. No data is not a passing result.

## Step 6 — Look at the evidence

The [dashboard]({{ "/dashboard/" | relative_url }}) shows the whole catalogue — every skill, its context cost, its evaluation coverage — and, for those that were evaluated, the verdict and its trend over the last runs.

Every trial also records the agent's full trajectory. When sessions have been published, the dashboard opens a replay view where the baseline and skilled passes of the same scenario play side by side. That is where a verdict stops being a number and becomes an explanation — you can see *where* the agent diverged.

## Evaluating an agent rather than a skill

A skill is *offered* to a plain agent; an agent *replaces* it. It is the same experiment — add one thing on the treatment side, change nothing else — but the execution differs: Vally knows how to load skills, not custom agents.

An agent is therefore evaluated by driving the real Copilot CLI twice:

```text
baseline   copilot -p "…" --no-custom-instructions
treatment  copilot -p "…" --plugin-dir plugins --agent skraft:skraft-orchestrator
```

```bash
./eng/run-agent-evals.sh                  # every pipeline suite
./eng/run-agent-evals.sh order-checkout   # a single story
AGENT=solution-architect ./eng/run-agent-evals.sh
```

The verdict that comes out has **exactly the same shape** as a skill's: same sign test, same credibility bar, same dashboard — the agent simply appears in its own table, with its evidence and its trend.

One detail that matters: when a scenario's outcome cannot be read, it counts as *inconclusive*, never as a tie. A run nobody could interpret is not a run that came out even.

## What an evaluation does not cover

An evaluation measures **one subject at a time**: a skill in isolation, or an agent against a plain one. It says nothing about composition — what happens when several skills load together in the same pass is outside what this measurement can see.

## Going further

- Full reference for the machinery — data contracts, adapters, session retention: [`docs/skill-evaluation.md`](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/skill-evaluation.md)
- Propose a new pattern with discipline: [Genesis & contributing]({{ "/en/how-to/contributing" | relative_url }})
- Adapt the pipeline without breaking its guarantees: [Customisation]({{ "/en/how-to/customisation" | relative_url }})
