# Skill evaluation & quality dashboard

How SKRAFT proves a skill earns its place, and where that proof is published.

- **Dashboard** — <https://sebastiendegodez.github.io/skraft-plugin/dashboard/>
- **How-to (handbook)** — [Évaluer un skill](https://sebastiendegodez.github.io/skraft-plugin/fr/how-to/evaluation) · [Evaluate a skill](https://sebastiendegodez.github.io/skraft-plugin/en/how-to/evaluation)
- **Evidence branch** — `dashboard-data` (verdict history + recorded agent sessions)

## Why

A skill is a claim: *"an agent that loads this produces a better result than one
that does not."* The only honest way to settle that claim is to run the same
prompts twice — once without the skill, once with it — and let a judge compare
the two trajectories. Anything else is intuition.

That is exactly what [Vally](https://microsoft.github.io/vally/) does, and it is
the harness the reference agent-skill marketplaces
([dotnet/skills](https://github.com/dotnet/skills),
[microcks/microcks-agent-skills](https://github.com/microcks/microcks-agent-skills))
converged on. SKRAFT uses it rather than a bespoke evaluator.

## The two halves of the dashboard

| Half | Source | Refreshed by | Can it be stale? |
| --- | --- | --- | --- |
| Catalogue — what the plugin ships, how heavy each skill is, what is evaluated | the plugin sources | the Pages deploy, at build time | no, it is re-derived every deploy |
| Evidence — verdicts, trend, recorded sessions | the `dashboard-data` branch | the evaluation workflow | it is fetched by the browser, so a new run shows up without rebuilding the site |

They are decoupled on purpose: publishing an evaluation run must never require a
site rebuild, and a site rebuild must never invent evidence.

## Layout

```text
tests/skills/<skill>/eval.yaml     # what to ask, and how to judge the answer
tests/agents/<suite>/eval.yaml     # which agent to dispatch, and what must hold
eng/
  run-vally-evals.sh               # local runner: two isolated runs + comparison
  detect-changed-skills.mjs        # PR diff        → changed skill / suite name(s)
  build-pr-comment.mjs             # results.json*  → PR comment markdown
  check-pr-regressions.mjs         # results.json*  → non-zero exit on a regression
  catalog/scan.mjs                 # source tree  → artifacts/catalog/report.json
  vally-adapter/adapt.mjs          # Vally run    → eval-results/<skill>/results.json
  vally-adapter/adapt-agent.mjs    # agent run    → eval-results/<suite>/results.json
  dashboard/
    update-history.mjs             # verdict      → dashboard-data/history.json
    build.mjs                      # report+history → docs/site/dashboard/data/dashboard.json
    build-replay-sessions.mjs      # trajectories → AGENTVIZ manifest
    purge-replay-sessions.mjs      # retention on the evidence branch
  lib/                             # the pure rules the scripts above apply
docs/site/dashboard/               # the published page
tests/dashboard/                   # tests for all of the above
```

Everything is Node with no dependency: the scripts run from a bare `node`, in any
CI job, with no install step.

## One workflow, split by cost

`.github/workflows/skill-evaluation.yml` carries both halves, because the split
that matters is not "lint versus run" but **what costs model quota**:

| Job | Runs on | Blocking | Calls a model |
| --- | --- | --- | --- |
| `lint` | every pull request touching skills, specs or `eng/` | yes | no |
| `evaluate-pr` | every pull request that changed a skill or an agent suite (same repo, not a fork) | only on a skill regression | yes |
| `evaluate` | schedule (Monday 03:00 UTC) and manual dispatch | no | yes |

The `lint` job runs the dashboard tooling tests, scans the catalogue, lints every
eval spec with `--strict`, and plans the experiment with `--dry-run`. That last
step is the one that catches a silent misconfiguration: it proves the baseline
and skilled plans share their prompts and differ only in the skill set, without
starting a single agent.

Skill linting itself is advisory. Vally's `valid-refs` check rejects any link
that leaves a skill's own directory, which SKRAFT's roster → adapter skills do
deliberately — a roster's whole job is to point at its adapters.

## Pre-merge evaluation on a PR

`evaluate-pr` gives a contributor evaluation evidence *before* merge, without a
dashboard round-trip:

1. `eng/detect-changed-skills.mjs` diffs the PR against its base branch and
   prints the skill(s) touched under `plugins/skraft-framework/skills/<skill>/`
   or `tests/skills/<skill>/`, and — with `--kind agents` — the agent suite(s)
   touched under `tests/agents/<suite>/`. A change to any agent descriptor
   re-runs every suite, because no path links a descriptor to the suites that
   exercise it. Only what the PR touched is evaluated — never the whole
   catalogue, so the job's model cost scales with the PR, not the repo.
2. `eng/run-vally-evals.sh` runs baseline-vs-skilled for each changed skill, and
   each changed agent suite once. **No job sets `RUNS`**: each spec budgets its
   own trials through `defaults.runs`, so the pre-merge run is exactly as deep as
   the spec asks. `eng/lib/verdict.mjs` needs at least `MIN_CREDIBLE_TRIALS = 5`
   trials before it calls a skill verdict `pass` or `regression`, so a spec with
   `3 stimuli × 1 run` comes back `inconclusive` — that is the spec being
   underpowered, not the runner. Raise `defaults.runs` in the spec to fix it.
3. `eng/build-pr-comment.mjs` renders every produced verdict as a markdown table
   — skills with score, sign test and quality/efficiency deltas; agents with
   their conformance tally — and the workflow posts it as a **new comment on the
   PR** — always a fresh comment, not an edited one, so the comment history
   doubles as a run history.
4. `eng/check-pr-regressions.mjs` fails the job only when a **skill** verdict is a
   credible `regression`. `inconclusive`, `no-improvement`, and `pass` never
   block merge — the gate exists to catch a proven regression, not to demand
   proof of improvement on every single PR. Agent verdicts are advisory: a suite
   runs a single real agent session, so one flaky run must not block an
   unrelated merge.

Fork PRs skip this job entirely: `COPILOT_GITHUB_TOKEN` is a repo secret and is
never available to a fork's workflow run.

## Agent coverage

A skill eval is a two-arm comparison; an agent suite is not. `tests/agents/<suite>/eval.yaml`
dispatches a real SKRAFT custom agent through `eng/vally-agent-executor/` and asserts
conformance with deterministic graders — the right agent was selected, its required
skills were loaded, the handoff has the declared shape. There is no baseline to
compare against, so there is no sign test: `eng/lib/agent-verdict.mjs` classifies
the run as a conformance tally instead.

| State | Meaning |
| --- | --- |
| `pass` | every trial ran and scored at or above the suite's `scoring.threshold` |
| `regression` | every trial ran, and at least one scored below the threshold |
| `inconclusive` | a trial errored, so it proves nothing about the agent |

`eng/vally-adapter/adapt-agent.mjs` writes those verdicts to the same
`eval-results/<suite>/results.json` a skill comparison produces, keyed on the agent's
file stem — the identity the dashboard's agent table already reads. The publisher,
the history and the PR comment therefore need no agent-specific path.

A suite needs `@github/copilot-sdk`, a devDependency, so any job that runs one must
`npm install` first.

## Adding an evaluation for a skill

1. Create `tests/skills/<skill>/eval.yaml`, where `<skill>` is the directory name
   under `plugins/skraft-framework/skills/`. The experiment resolves the skill from that path, so
   the two must match.
2. Write stimuli as a developer would phrase the request. **Never name the skill
   in a prompt** and never copy its wording — an eval that tells the agent which
   skill to use measures nothing.
3. Judge outcomes, not techniques. `Identified the missing dependency as the cause
   of the failure` is an outcome; `ran the diagnostic command with --verbose` is
   an implementation detail that a different valid approach would fail.
4. Include a non-activation stimulus (`expect_activation: false`) for a request
   that looks like the skill's territory but falls outside it. Restraint is part
   of the behaviour.
5. Budget for **power, not for a floor**. The sign test runs on discordant pairs,
   and below 6 of them no tally can reach `p <= 0.05` — a flawless 5W/0L sweep
   scores 0.0625. Ties eat pairs, so plan **12–15 trials** for a defendable
   verdict. Buy that power up front: topping up runs on a noisy comparison is the
   worst-value spend in the protocol.
6. Spend on **depth over breadth**. `3 stimuli × 5 runs` and `5 stimuli × 3 runs`
   cost the same; only the first gives per-scenario cells worth reading, because
   the verdict pools every trial while the per-scenario tallies do not. Keep each
   stimulus to **one** decision, asked through the narrowest task that forces it —
   a paired run executes every trial twice plus judge work, and cost per trial
   tracks how much work the prompt demands, not how big the fixture is.

## Running an evaluation

Install the CLI once, [the way Vally prescribes](https://microsoft.github.io/vally/get-started/install/):

```bash
npm install -g @microsoft/vally-cli@0.12.0
```

The runner uses that binary when it is on the path, and otherwise falls back to a
one-off `npx` download of the same pinned version.

```bash
./eng/run-vally-evals.sh outside-in-tdd   # one skill
./eng/run-vally-evals.sh <plugin>         # one plugin
./eng/run-vally-evals.sh                  # every eval spec
```

Each spec is run twice on its own: once with an empty `--skill-dir` (baseline),
once with only the skill under test. Isolation is structural — the same spec goes
to both sides, so there is no comparison contract left to drift.

An evaluation drives a real agent, so it needs `COPILOT_GITHUB_TOKEN`: a
fine-grained PAT with the **Account › Copilot Requests** permission. The
auto-generated Actions token cannot reach Copilot. The runner re-exports that
value as `GITHUB_TOKEN` as well, the variable Vally 0.12.0 reads for its
comparison judge.

Before funding a full paired arm, run a **pilot**: the same frozen spec against
the one stimulus most likely to discriminate, at the depth the real run will use.

```bash
STIMULI="Preserve an approved" PILOT_RUNS=5 ./eng/run-vally-evals.sh outside-in-tdd
```

The runner filters the committed spec itself — the instrument is never edited to
make a cheaper run possible — and writes to `eval-results-pilot/`, away from the
directory the dashboard publishes. A pilot answers *does this move anything at
all*, not *does this skill pass*: it has neither the stimuli nor the pairs for a
verdict, and its tally must never be reported as one.

`PARALLEL`, `RUNS`, `WORKERS`, `MODEL`, `JUDGE_MODEL` and `RESULTS_DIR` tune the
run; `eng/vally-adapter/skip-evals.txt`, when present, lists eval directories to
leave out. Each eval keeps its own `eval-results/<skill>/eval.log`.

`RUNS` is unset by default, and CI never sets it: `--runs` overrides whatever the
spec declares, so passing it would silently reduce every spec to one trial per
stimulus. Set it locally to cut a run short while iterating — never in CI.

## Reading the result on a local dashboard

One command turns the verdicts under `eval-results/` into the page the project
publishes: it folds them into a local `dashboard-data/history.json`, rescans the
catalogue from the plugin sources, then serves the site.

```bash
npm run dashboard:preview                 # → http://127.0.0.1:4173/dashboard/
npm run dashboard:preview -- --port 8080  # another port
npm run dashboard:preview -- --no-serve   # build the data only
```

With no verdict yet, the dashboard still renders the full catalogue — every skill
with its context cost and evaluation coverage — and reports the rest as
unevaluated. Nothing this writes is committed: `eval-results/`, `dashboard-data/`
and `docs/site/dashboard/data/` are all ignored.

## How a verdict is decided

Vally reports wins, ties and losses for the skilled variant. That tally becomes a
verdict through an **exact two-sided binomial sign test** on the discordant pairs:

$$p = \min\left(1,\; 2 \cdot 2^{-d} \sum_{k=m}^{d} \binom{d}{k}\right)
\quad\text{with } d = w + l,\; m = \max(w, l)$$

| State | Meaning |
| --- | --- |
| `pass` | complete, powered, and $w > l$ with $p \le 0.05$ |
| `regression` | complete, powered, and $l > w$ with $p \le 0.05$ |
| `no-improvement` | complete and powered, but the margin is indistinguishable from chance |
| `inconclusive` | a trial errored, a trial was unmatched, there were fewer than 5 trials, or the tally held fewer than 6 discordant pairs |

Power is the second gate, and it is about **discordant pairs**, not trial count.
The two-sided test bottoms out at $p = 2 \cdot 2^{-d}$, so $d < 6$ can never reach
$0.05$ however the trials fall: 5W/0L scores $0.0625$ and 7W/1L scores $0.070$.
Those comparisons are reported as `inconclusive`, because calling them
`no-improvement` would blame the skill for a budget that could not have concluded
in either direction. An all-tie comparison is exempt — zero discordant pairs is a
genuine measurement of no difference, not a power failure.

A missing or fragile result is never rendered as a pass. **No data is not a
passing result.**

## Session replay (AGENTVIZ)

Every trial records the agent's full trajectory. The evaluation workflow flattens
those recordings into an [AGENTVIZ](https://github.com/jayparikh/agentviz)
manifest on the `dashboard-data` branch, and the Pages deploy builds the AGENTVIZ
SPA at `/dashboard/replay/`. Sessions are tagged by skill, scenario and variant,
so the baseline and skilled runs of the same scenario can be replayed side by
side — that is where a verdict stops being a number and becomes an explanation.

Scheduled recordings are kept for 14 days; pull-request recordings are dropped
when the pull request closes.

## Indicators at a glance

When a skill is evaluated, Vally compares the baseline (no skill) against the
treatment (skill enabled) by running the same stimuli against both and scoring
the outcomes. The comparison produces several indicators that tell you whether
the skill helps, hurts, or makes no measurable difference.

### Verdict state

The summary badge that appears in the PR comment and on the dashboard:

| State | Meaning | What it means for merge |
| --- | --- | --- |
| ✅ **pass** | The skill demonstrably improves outcomes. Win count exceeds loss count with p ≤ 0.05, and there are at least 5 trials. | Safe to merge. The skill earned its place. |
| 🔴 **regression** | The skill demonstrably worsens outcomes. Loss count exceeds win count with p ≤ 0.05, and there are at least 5 trials. | **Merge is blocked.** Fix the skill or withdraw it. |
| ➖ **no-improvement** | Outcomes are statistically indistinguishable. Trial count is at least 5, but wins and losses are too close to call. | Safe to merge, but don't claim the skill helps. |
| ⚪ **inconclusive** | Evidence is incomplete. Either fewer than 5 trials, or a trial errored or produced an unmatched result. | Safe to merge. Run more trials before making a claim. |

### Sign test: W/T/L

The heart of every verdict. Vally runs each stimulus multiple times and labels each trial
outcome as **W** (skilled wins), **T** (tie), or **L** (skilled loses):

```
5W / 0T / 3L
```

Interpretation:
- **Wins (W)** — trials where the skilled agent performed *better* than baseline
- **Ties (T)** — trials where the outcome was judged *equivalent*
- **Losses (L)** — trials where the skilled agent performed *worse* than baseline
- **p-value** — the probability that a result this extreme (or more extreme) would occur
  by chance if the skill had no actual effect. Vally uses an **exact two-sided binomial test**
  on the discordant pairs (W + L only), doubling the tail for conservatism.

When **p ≤ 0.05**, the result is unlikely to be chance, so it earns a credible
`pass` or `regression` verdict. Above 0.05, it stays `no-improvement` or
`inconclusive`.

**Why two-sided?** Because the direction is chosen *after* seeing the data: if you
only looked at wins and ignored losses, you would need p ≤ 0.025 per tail. Instead,
Vally asks: "Could this extreme imbalance have happened by coin flip?" That is
the two-sided question, and it avoids inflation.

### Score and confidence interval

The mean outcome score for the skilled agent, with a 95% confidence interval
showing the range where the true effect likely falls:

```
0.75 (0.62–0.88)
```

- **Mean score**: average judgment across all trials (typically 0–1, or a task-specific scale)
- **Confidence interval**: if you ran this experiment 100 times, the true mean would land in
  this band in 95 of them

A narrow interval means the estimate is precise; a wide one means you need more trials.

### Quality Δ (delta)

The *signed* difference in mean score between skilled and baseline:

```
+0.125
```

Read as: "The skilled agent scored on average 0.125 points higher than baseline."
A **negative value** means the skilled agent scored lower. This metric answers:
*By how much does the skill move the needle?*

### Efficiency Δ

Token count and elapsed time, shown as signed percentages:

```
+15.2% tokens, −8.5% time
```

- **+15.2% tokens**: the skilled agent used 15% more input+output tokens
  (the skill has a cost)
- **−8.5% time**: the skilled agent ran 8.5% faster (fewer tool calls or faster reasoning)

A skill that improves quality but costs tokens is still valuable — you are
trading compute for better outcomes. The tradeoff is yours to make.

### Trial count and errors

```
trialCount: 24
erroredCount: 0
unmatchedTrialCount: 0
```

- **Trial count**: total runs across all stimuli and runs, i.e. `stimuli × defaults.runs`.
  A spec with 8 stimuli and `runs: 1` yields 8 trials; the same spec with `runs: 3`
  yields 24.
- **Errored**: trials where the agent crashed or timed out. Increases the `inconclusive` flag.
- **Unmatched**: trials where the baseline and treatment produced incomparable results
  (e.g., one failed to parse JSON). Also drives `inconclusive`.

### Win rate

Percentage of trials where the skilled agent won:

```
winRate: 62.5%
```

**Caution**: this is *not* the verdict. A 60% win rate over 5 trials can be noise
(p=0.46). The sign test's p-value tells you whether it is significant; win rate
alone does not.

## Reading a PR comment

When a skill is evaluated on a PR, the workflow posts a markdown table with one
row per changed skill:

```
| Skill | Verdict | Score (95% CI) | Sign test | Quality Δ | Efficiency Δ | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| my-skill | ⚪ inconclusive | 0.68 (0.55–0.81) | 3W/2T/3L (p=0.727) | −0.05 | +8.3% tokens, +2.1% time | 8 trials, underpowered (min 5 required) |
```

When the PR also touched an agent suite, a second table follows it — no sign
test, because a suite has no baseline:

```
| Agent | Verdict | Score | Conforming trials | Reason |
| --- | --- | --- | --- | --- |
| software-engineer | ✅ pass | 1.00 | 2/2 | conforms on every trial (2/2 at or above 1) |
```

### What to act on

- **🔴 regression** on a skill: your skill hurt performance. Fix it or revert it.
- **🔴 regression** on an agent: the agent stopped doing what its suite asserts.
  Advisory — it does not block the merge, but it is the one row worth opening the
  recorded session for.
- **✅ pass**: Merge confidently; the skill helps.
- **➖ no-improvement, ⚪ inconclusive**: Safe to merge; just don't claim success yet.

### Getting a credible pre-merge verdict

CI never overrides the trial budget: the number of trials is the spec's own
`stimuli × defaults.runs`. A verdict below 5 trials is reported as `inconclusive`
by design. To make a skill's pre-merge verdict credible, add trials to the spec:

```yaml
defaults:
  # 5 stimuli × 3 runs = 15 trials, comfortably above the 5-trial floor
  runs: 3
```

Every stimulus is paid for twice — once baseline, once skilled — so raising
`runs` doubles into real wall clock and quota. Raise it where the verdict
matters, not everywhere.

## Evaluation boundary

All model-backed evaluations use Vally and compare a baseline with one isolated
skill. Framework and integration tests cover orchestration and agent behavior.
