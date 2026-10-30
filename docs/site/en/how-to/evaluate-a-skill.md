---
layout: doc
lang: en
title: "Evaluate a skill"
description: "Write a skill's evaluation spec, validate it without spending quota, run the baseline-versus-skill comparison, read the verdict and look it up on the dashboard."
persona: tech-lead
---

# Evaluate a skill

**Goal**: a measured verdict (`pass`, `regression`, `no-improvement` or `inconclusive`) that says
whether a skill improves the agent's answer.

## Prerequisites

- A clone of the `skraft-plugin` repository, Node 22 or later, `npm install` run at its root.
- The skill under `plugins/<plugin>/skills/<skill>/`.
- Access to Copilot: `COPILOT_GITHUB_TOKEN` (a fine-grained PAT with the
  **Account › Copilot Requests** permission), or `gh auth login`.

## 1. Write the spec

Create `tests/skills/<skill>/eval.yaml`, where `<skill>` is exactly the name of the skill's
folder:

```yaml
name: outside-in-tdd
description: Checks that the feature is driven from an observable business behaviour.
type: capability
defaults:
  timeout: 4m
  runs: 4
  model: standard
stimuli:
  - name: Drive a business rule from the outside
    prompt: |
      Our online ordering application must apply a loyalty discount to the
      total due. An unknown order must produce a "not found" error.
      Implement it.
    graders:
      - type: prompt
    rubric:
      - Starts from a test that crosses the service's visible boundary, phrased in business terms.
      - Ties each production change to a test that failed before and passes after.
  # … two more stimuli, one of them a non-activation case: 3 stimuli × 4 runs = 12 trials
```

`defaults.model` names a family of `eng/eval-models.json` (`standard`, `economy`), never a
versioned model.

## 2. Review the spec against this list

- [ ] No prompt names the skill or copies its wording.
- [ ] Each rubric line judges the outcome, not the technique used.
- [ ] One stimulus outside the skill's territory carries `tags: { intent: non-activation }`.
- [ ] `stimuli × runs` gives 12 to 15 trials: below six discordant pairs, no verdict can pass.

Why these rules: [Evaluation strategy]({{ "/en/explanation/evaluation-strategy" | relative_url }}).

## 3. Validate the spec without starting an agent

> **Not verified on V2.** Vally evaluation is paused on V2 work: the commands of steps 3, 4 and 6
> and of "Evaluate an agent" below (`vally`, `./eng/run-vally-evals.sh`,
> `npm run dashboard:preview`) have not been run against V2. On Windows, `./eng/run-vally-evals.sh`
> is a bash script: run it from Git Bash or WSL.

```bash
npm install -g @microsoft/vally-cli@0.12.0
vally lint --eval-spec tests/skills/<skill>/eval.yaml --strict
```

The lint starts no agent and spends no quota.

## 4. Run the comparison

```bash
./eng/run-vally-evals.sh <skill>
```

The script plays each stimulus twice, with no skill (baseline) and with the evaluated skill
alone, then has both trajectories judged. For a small-budget try on a few stimuli,
`STIMULI="<name fragment>" ./eng/run-vally-evals.sh <skill>` writes to `eval-results-pilot/`: a
pilot is never a verdict.

## 5. Read the verdict

| Verdict | What to do |
|---|---|
| `pass` | The skill helps: keep it. |
| `regression` | The baseline does better: rework the skill; this verdict blocks a PR's merge. |
| `no-improvement` | No gap distinguishable from chance: simplify the skill or rework the rubric. |
| `inconclusive` | An errored trial, an unmatched trial, fewer than 5 trials or fewer than 6 discordant pairs: read the verdict's reason before adding trials. |

The line `9W/4T/2L (p=0.065)` is read figure by figure in
[Read an evaluation verdict]({{ "/en/explanation/deep-dive/reading-a-verdict" | relative_url }}).

## 6. Look up the evidence

```bash
npm run dashboard:preview
```

Open `http://127.0.0.1:4173/dashboard/`: the skill shows its verdict, its trend and, when sessions
were published, the side-by-side replay of both passes. On a PR that touches an evaluated skill,
the `skill-evaluation` workflow posts the same verdict as a comment.

## Evaluate an agent

An agent suite lives under `tests/agents/<suite>/eval.yaml` and runs with:

```bash
./eng/run-vally-evals.sh agents <suite>
```

It has no baseline: its verdict (`pass`, `flaky`, `regression`, `inconclusive`) attests a
conformance, and stays indicative.

## Troubleshooting

| Sign | Action |
|---|---|
| `<skill> (skipped — no skill dir)` | Rename `tests/skills/<skill>/` after the skill's folder. |
| `Set COPILOT_GITHUB_TOKEN (fine-grained PAT with Copilot Requests) or run 'gh auth login'.` | Export the token, or `gh auth login`. |
| `inconclusive` with fewer than 6 discordant pairs | Raise the spec's `defaults.runs`, then run the whole spec again. |
| `inconclusive` on an errored trial | Read the result's `eval.log`; adding trials does not fix it. |

## See also

- [Evaluation strategy]({{ "/en/explanation/evaluation-strategy" | relative_url }})
- [Read an evaluation verdict]({{ "/en/explanation/deep-dive/reading-a-verdict" | relative_url }})
- [Dashboard]({{ "/dashboard/" | relative_url }})
- [`docs/skill-evaluation.md`](https://github.com/SebastienDegodez/skraft-plugin/blob/integration/v2-next/docs/skill-evaluation.md)
  — data contracts, adapters, session retention.
