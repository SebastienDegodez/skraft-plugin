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

Install the CLI once, [the way Vally prescribes](https://microsoft.github.io/vally/get-started/install/):

```bash
npm install -g @microsoft/vally-cli@0.12.0
vally --version
```

The spec is the one thing a typo can silently break. This call starts no agent:

```bash
vally lint --eval-spec tests/skills/<skill>/eval.yaml --strict
```

You do not have to check that the two sides of the comparison stayed comparable: the runner passes the **same** spec to both, and the only difference is `--skill-dir` — empty for the baseline, the skill under test for the other. There is no configuration left to drift.

What *can* still be wrong is the directory name. If `tests/skills/<skill>/` does not match a directory under `plugins/skills/`, the runner reports the eval as skipped rather than evaluating nothing silently.

## Step 4 — Run the evaluation

A run drives a real agent. It needs `COPILOT_GITHUB_TOKEN`: a fine-grained PAT carrying the **Account › Copilot Requests** permission. The auto-generated Actions token cannot reach Copilot. The runner also re-exports that value as `GITHUB_TOKEN`, the variable Vally 0.12.0 reads for its comparison judge.

```bash
./eng/run-vally-evals.sh <skill>   # a single skill
./eng/run-vally-evals.sh           # every evaluated skill
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

You do not have to publish a run to see it. One command folds the local verdicts into a local history, rescans the catalogue and serves the same page:

```bash
npm run dashboard:preview   # → http://127.0.0.1:4173/dashboard/
```

Every trial also records the agent's full trajectory. When sessions have been published, the dashboard opens a replay view where the baseline and skilled passes of the same scenario play side by side. That is where a verdict stops being a number and becomes an explanation — you can see *where* the agent diverged.

## Agent coverage

Vally evaluates skills, not custom agents. Agent orchestration is covered by the deterministic framework and integration tests; no second model-backed harness is maintained.

## What an evaluation does not cover

An evaluation measures **one skill at a time**. It says nothing about composition — what happens when several skills load together in the same pass is outside what this measurement can see.

## Going further

- Full reference for the machinery — data contracts, adapters, session retention: [`docs/skill-evaluation.md`](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/skill-evaluation.md)
- Propose a new pattern with discipline: [Genesis & contributing]({{ "/en/how-to/contributing" | relative_url }})
- Adapt the pipeline without breaking its guarantees: [Customisation]({{ "/en/how-to/customisation" | relative_url }})
