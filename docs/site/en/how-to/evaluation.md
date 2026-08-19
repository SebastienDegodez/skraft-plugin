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

## Why evaluate: the three-layer strategy

SKRAFT proves quality through three layers, each answering a different question.

### Layer 1: Framework correctness (deterministic tests)

**What?** Does the framework load, route, and dispatch skills correctly?

- Unit tests in `tests/skraft-framework/*.test.mjs` that cover parsing, orchestration, config loading and decision gates
- Mutation testing (Stryker) to verify that tests actually catch bugs — a mutant that passes all tests = a missing case
- All tests are **deterministic** (no flakiness, no model calls, no randomness)

**Why it matters:** if the framework has a logic bug, every skill built on it amplifies that bug. These tests catch structural problems before they reach evaluation.

### Layer 2: Skill behaviour (model-backed comparison)

**What?** Does this skill produce better outcomes than the baseline?

- Vally compares baseline (no skill) vs treatment (skill enabled) on the same stimuli
- Outcomes are judged by a rubric, not by hand: a scorer reads what the agent produced and assigns a score
- Results compared by an **exact two-sided binomial sign test** (p ≤ 0.05 = credible)

> 📐 **Not sure where the `p` comes from?** The deep dive [Reading an evaluation verdict]({{ "/en/explanation/deep-dive/reading-a-verdict" | relative_url }}) unfolds the line `9W/4T/2L (p=0.065)` number by number on a real case: why ties are discarded, why the floor sits at six pairs, and why a skill that wins by a wide margin can still fail the sign test.
- Each spec budgets its own trials through `defaults.runs`; CI never overrides it, on a PR or on schedule

**Why it matters:** a skill that *looks good* often performs worse in practice, or costs tokens with no return. Empirical measurement catches it; intuition does not.

### Layer 3: Agent orchestration (integration tests)

**What?** Do the skills, framework, and agent work together end-to-end?

- Playwright tests in `tests/site/` verify the handbook renders and links are live
- Real-agent eval specs in `tests/agents/` measure whether agents using the full suite make better decisions than a baseline agent
- Covers multi-skill workflows, skill sequencing, and cross-skill side effects

**Status:** Working. An agent suite is single-arm — it asserts conformance (right agent, required skills loaded, declared handoff shape) rather than lift — and its verdict is published to the dashboard and to the PR comment alongside the skills. It stays advisory: one real agent session must not block an unrelated merge.

### Why this is better

Traditional approaches (code review + manual testing) have blind spots:

| Traditional blind spot | SKRAFT approach |
| --- | --- |
| "The code looks good" but produces wrong output | Layer 2 forces empirical measurement: if it doesn't score better, it doesn't ship |
| Mutations in the code hide subtle bugs | Layer 1 uses Stryker: a mutant that passes all tests = missing case |
| Skills work in isolation but break together | Layer 3 tests real agent orchestration |
| "It worked the last time I tried it" | Every evaluation is reproducible; agent trajectories are recorded and can be replayed |
| P-hacking (cherry-picking positive results) | Layer 2 uses a pre-registered two-sided test; regressions block merge automatically |

### Current state (and what is coming)

✅ **Working now:**
- Framework deterministic tests + mutation coverage
- Skill evaluation with Vally (pre-PR and scheduled runs)
- Real-agent conformance suites, published to the dashboard and to the PR comment
- Session replay: baseline vs treatment side-by-side in AGENTVIZ
- Regression gate: regressions block merge automatically

🔄 **In progress:**
- Trend dashboard (multi-run performance tracking)
- Cost projections per skill (token budgeting)

The work is incomplete, but it demonstrates a **testable, measurable, empirical
foundation** instead of opinion-based releases. Every gap you see today is one we
can measure and fill tomorrow.

## The principle in one sentence

The same prompts are sent twice — **once with no skill at all** (baseline), **once with only the skill under test** (skilled) — and a judge compares the two trajectories. Nothing else differs between the two passes, so any difference in outcome is attributable to the skill and to nothing else.

## Step 1 — Create the evaluation spec

Create `tests/skills/<skill>/eval.yaml`, where `<skill>` is **exactly** the directory name under `plugins/skraft-framework/skills/`. That path is how the experiment resolves which skill to load: if the two names diverge, the baseline and the skilled pass become identical and the evaluation measures nothing.

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

What *can* still be wrong is the directory name. If `tests/skills/<skill>/` does not match a directory under `plugins/skraft-framework/skills/`, the runner reports the eval as skipped rather than evaluating nothing silently.

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
