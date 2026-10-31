---
title: "Evaluation tooling"
description: "The files, the runner, its variables, the verdict states, the pull request comment, the CI jobs and the dashboard of skill and agent evaluation."
persona: tech-lead
---

# Evaluation tooling

What the tooling that evaluates skraft's skills and agents with Vally 0.12.0 contains: files,
runner, verdict states, pull request comment, CI and dashboard.

Why three layers of evidence and a paired comparison:
[Evaluation strategy](../explanation/evaluation-strategy.md). The steps:
[Evaluate a skill](../how-to/evaluate-a-skill.md). Reading a verdict line,
figure by figure:
[Read an evaluation verdict](../explanation/deep-dive/reading-a-verdict.md).

## Files

| Path | Content |
|---|---|
| `tests/skills/<skill>/eval.yaml` | A skill's spec: stimuli, graders, rubric. `<skill>` is the name of the `plugins/<plugin>/skills/<skill>/` folder. |
| `tests/skills/<skill>/eval.skill-dir.yaml` | Optional: companion skills mounted with the evaluated skill in the skill arm (`skills: [...]`). |
| `tests/skills/<skill>/README.md` | The evaluation's portfolio (see [An evaluation's README](#evaluation-readme)). |
| `tests/agents/<suite>/eval.yaml` | An agent suite: the `.agent.md` agent started and what must hold. |
| `tests/agents/<suite>/fixtures/<state>/` | Files the suite stages before starting the agent. |
| `eng/eval-models.json` | The only place a versioned model is written: families (`economy`, `standard`), default family, judge, comparison judge. |
| `eng/run-vally-evals.sh` | The only entry point of an evaluation. |
| `eng/vally-adapter/skip-evals.txt` | Optional: evaluation folders left out. |
| `eng/lib/verdict.mjs`, `eng/lib/agent-verdict.mjs` | The verdict rules of a skill and of an agent suite. |
| `eng/build-pr-comment.mjs`, `eng/check-pr-regressions.mjs` | Pull request comment; failure on a skill regression. |
| `eng/dashboard/` | Verdict history, dashboard data, replayable sessions, retention. |
| `.github/workflows/skill-evaluation.yml` | Lint, planning, evaluation, scheduled publication, model comparison. |
| `.github/workflows/evaluation-evidence.yml` | Publication of a pull request's evidence, cleanup when it closes. |

What the tooling writes is never committed: `eval-results/`, `eval-results-pilot/`,
`eval-baseline-cache/`, `dashboard-data/`, `docs/website/static/dashboard/data/`.

## The runner

| Command | Runs |
|---|---|
| `./eng/run-vally-evals.sh` | every skill and every agent suite |
| `./eng/run-vally-evals.sh <skill>` | one skill |
| `./eng/run-vally-evals.sh agents` | every agent suite |
| `./eng/run-vally-evals.sh agents <suite>` | one agent suite |

A skill is played twice: the baseline arm with an empty `--skill-dir`, the skill arm with the
skill alone (plus the companions of `eval.skill-dir.yaml`, copied, not linked). An agent suite is
played once. Prerequisites: the `@microsoft/vally-cli@0.12.0` CLI (else an `npx` of the same
version), and `COPILOT_GITHUB_TOKEN` (a fine-grained PAT with **Account › Copilot Requests**) or
`gh auth login`.

| Variable | Default | Effect |
|---|---|---|
| `PARALLEL` | `4` | Evaluations run at the same time. |
| `WORKERS` | `3` | Stimuli at the same time in each arm of a skill. |
| `ARMS_PARALLEL` | `1` | `1`: both arms of a skill at the same time; `0`: one after the other. |
| `AGENT_WORKERS` | `1` | Stimuli at the same time in an agent suite. |
| `RUNS` | empty | Empty: each spec decides through `defaults.runs`. A value replaces every spec's; CI never sets it. |
| `MODEL` | empty | Empty: the family of `defaults.model`, else the default family. A family or a model forces every evaluation. |
| `JUDGE_MODEL` | pinned judge | Judge of the trajectories. `COMPARISON=1` takes the comparison judge. |
| `STIMULI` | empty | Skills only: stimulus name fragments; writes to `eval-results-pilot/`. A pilot is never a verdict. |
| `PILOT_RUNS` | empty | With `STIMULI`: replaces the pilot's `defaults.runs`. |
| `SKILL_MAX_RETRIES` | empty | Integer ≥ 0 passed as `--max-retries` to both arms; empty keeps Vally's default (2). |
| `AGENT_MAX_RETRIES` | `0` | Retries of an agent suite. |
| `BASELINE_CACHE` | `0` | `1`: reuses cached baselines, locally only (refused under CI); the result carries `baselineProvenance.publishable: false`. |
| `SKIP_EVALS`, `SKIP_AGENTS` | — | List to skip (replaces `skip-evals.txt`); `1` leaves agent suites out of an unnamed run. |
| `LIVE_LOGS` | `1` | Streams Vally's output while keeping `eval.log`. |
| `RESULTS_DIR` | `eval-results` | Output folder: `<skill>/results.json`, `<suite>/results.json`. |

## A skill's spec: rules the tooling applies

- `defaults.model` names a family of `eng/eval-models.json`; the runner refuses any other name.
- `rubric` sits at the same level as `graders`. A rubric placed under `graders[].config` is
  replaced by Vally's generic rubric.
- Every stimulus declares a `skill-invocation` grader: `required` on a positive case,
  `disallowed` on the non-activation case (`tags: { intent: non-activation }`). That grader is
  removed from the paired score (`eng/lib/paired-trials.mjs`); a skill spec therefore never
  declares `scoring.weights`.
- A `prompt` grader carries `scoring: scale_1_10`.

## An evaluation's README <!-- #evaluation-readme -->

`tests/skills/<skill>/README.md` keeps the reasoning an `eval.yaml` cannot carry:

| Section | Content |
|---|---|
| Scope | The behaviours this skill owns alone, and the neighbours excluded. |
| Stimuli | One line per stimulus: the decision it forces and its class (decider, regression guard, non-activation). |
| Proof surface | What proves each stimulus's outcome: deterministic graders or a judge against a rubric. |
| Cut | The candidates ruled out, with the reason. |
| Power | Why the trial budget clears the six-discordant-pair floor. |
| Fixtures | What each fixture makes easy to get wrong. |

The README states the expected result of every regression guard and every non-activation case,
and holds no execution state (run, score, blocker). Examples:
`tests/skills/architecture-patterns/README.md`, `tests/skills/clean-architecture-testing/README.md`.

## Verdict states

**Skill** (`eng/lib/verdict.mjs`): an exact two-sided binomial sign test on the discordant pairs,
and a Wilcoxon signed-rank test on the score differences; both at 0.05. A judge-only comparison
has no differences to rank: the sign test decides alone.

| State | Condition |
|---|---|
| `pass` | Complete, enough trials, more wins than losses, both p ≤ 0.05. |
| `regression` | Complete, enough trials, more losses than wins, both p ≤ 0.05. |
| `no-improvement` | Complete and enough trials, a gap indistinguishable from chance. |
| `inconclusive` | An errored or unmatched trial, fewer than 5 trials (`MIN_CREDIBLE_TRIALS`), or 1 to 5 discordant pairs (`MIN_DISCORDANT_PAIRS` = 6). Zero discordant pairs is not a lack of power. |

A pair where the skill did not load on the treatment side is removed from the tally, without
making the verdict `inconclusive`.

**Agent suite** (`eng/lib/agent-verdict.mjs`): no baseline, hence no sign test.

| State | Condition |
|---|---|
| `pass` | Every trial ran and reached the suite's `scoring.threshold`. |
| `flaky` | Every trial ran, at least one below the threshold, every scenario keeps at least two thirds conforming trials. |
| `regression` | Every trial ran, and one scenario falls below two thirds conforming trials. |
| `inconclusive` | A trial errored. |

## Pull request comment

The workflow keeps **one** comment per pull request, found again by the hidden marker
`<!-- skraft:skill-evaluation -->` and rewritten on each evaluation with the commit evaluated. The
same table goes to the run summary.

| Table | Columns |
|---|---|
| Skills | Skill, Verdict, Score (95% CI), Sign test (`W/T/L (p=…)`), Quality Δ, Efficiency Δ (tokens, time), Reason |
| Agents | Agent, Verdict, Score, Conforming trials, Reason |

Mentions in the Reason column:

| Mention | What happened |
|---|---|
| `n at the ceiling` | Both arms got full marks: the stimulus does not discriminate. |
| `n in the same grader bucket` | The arms differ by less than one step of the judge's scale. |
| `n at the floor` | Neither arm scored. |
| `never loaded on <stimulus> (0/n)` | The skill never loaded on that stimulus: those pairs are removed. |
| `no measured effect on either instrument …` | Graders and judge tied on at least 80% of pairs. |
| `underpowered (…)` | Fewer than six discordant pairs. |

## CI

| Job | Trigger | Blocking | Calls a model |
|---|---|---|---|
| `lint` | Pull request touching skills, agents, specs, `eng/` | yes | no |
| `plan` | Same-repository pull request, schedule (Monday 03:00 UTC), manual dispatch | no | no |
| `evaluate-subject` | One cell per planned subject, at most 8 at once | an errored skill cell fails; an agent cell never | yes |
| `evaluate-pr` | After a pull request's cells | only on a credible skill `regression` | no |
| `publish` | After a scheduled or manual run: `dashboard-data` branch | no | no |
| `compare-matrix`, `compare-models`, `publish-comparison` | Manual dispatch with `models`: one skill per model, a single judge | no | yes (`compare-models`) |
| `publish-pr` (`evaluation-evidence.yml`) | After a pull request evaluation: verdicts and trajectories published together | yes | no |
| `cleanup-pr-replay` (`evaluation-evidence.yml`) | The pull request closes | no | no |

- On a pull request, `plan` keeps only the subjects whose **AI content** changed
  (`eng/lib/changed-skills.mjs`): the folder of the skill and of its companions, the descriptors
  of the agents a suite names (`tags.agent`, `tags.subagents`), the spec's folder, the files it
  stages. A tooling or code pull request evaluates nothing and passes the gate.
- A subject whose AI-content fingerprint (`eng/eval-reuse.mjs`) equals the one of the pull
  request's latest evaluation is carried over, marked reused, never published as a fresh
  measurement; a cell older than 14 days, a "Re-run all jobs", a scheduled or manual run replay
  everything.
- A new push cancels the pull request's evaluation in progress. A pull request from a fork is not
  evaluated: `COPILOT_GITHUB_TOKEN` is not given to it.

## Dashboard and replay

| Half | Source | Refreshed by |
|---|---|---|
| Catalogue: what the plugin ships, each skill's weight, evaluation coverage | the plugin sources | the Pages deploy |
| Evidence: verdicts, trend, sessions | the `dashboard-data` branch | the evaluation workflows, read by the browser |

Every trial records its trajectory; the AGENTVIZ replay is served under `/dashboard/replay/`,
baseline and skill side by side. Scheduled sessions are kept 14 days; a pull request's sessions
go when it closes, its verdicts stay.

| Command | Effect |
|---|---|
| `npm run dashboard:preview` | `http://127.0.0.1:4173/dashboard/` |
| `npm run dashboard:preview -- --port 8080` | another port |
| `npm run dashboard:preview -- --no-serve` | data only |

With no verdict, the dashboard shows the full catalogue and marks the rest unevaluated.

## See also

- [Evaluate a skill](../how-to/evaluate-a-skill.md)
- [Evaluation strategy](../explanation/evaluation-strategy.md)
- [Read an evaluation verdict](../explanation/deep-dive/reading-a-verdict.md)
- [Dashboard](pathname:///dashboard/)
