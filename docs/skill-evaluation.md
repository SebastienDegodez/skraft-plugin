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
eng/
  run-vally-evals.sh               # local runner: two isolated runs + comparison
  detect-changed-skills.mjs        # PR diff        → changed skill name(s)
  build-pr-comment.mjs             # results.json*  → PR comment markdown
  check-pr-regressions.mjs         # results.json*  → non-zero exit on a regression
  catalog/scan.mjs                 # source tree  → artifacts/catalog/report.json
  vally-adapter/adapt.mjs          # Vally run    → eval-results/<skill>/results.json
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
| `evaluate-pr` | every pull request that changed a skill (same repo, not a fork) | only on a regression | yes |
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
   or `tests/skills/<skill>/`. Only those skills are evaluated — never the
   whole catalogue, so the job's model cost scales with the PR, not the repo.
2. `eng/run-vally-evals.sh` runs baseline-vs-skilled for each changed skill with
   the default `RUNS=1` (one trial per stimulus). `eng/lib/verdict.mjs` needs at
   least `MIN_CREDIBLE_TRIALS = 5` trials before it calls a verdict `pass` or
   `regression`, so with one trial most verdicts come back `inconclusive` — that
   is expected, not a bug. Widen `RUNS` in a spec's own dispatch if a skill needs
   a credible per-PR verdict; the default keeps every PR run cheap.
3. `eng/build-pr-comment.mjs` renders every produced verdict as a markdown table
   (score, sign test, quality/efficiency deltas, reason) and the workflow posts
   it as a **new comment on the PR** — always a fresh comment, not an edited one,
   so the comment history doubles as a run history.
4. `eng/check-pr-regressions.mjs` fails the job only when a verdict is a
   credible `regression`. `inconclusive`, `no-improvement`, and `pass` never
   block merge — the gate exists to catch a proven regression, not to demand
   proof of improvement on every single PR.

Fork PRs skip this job entirely: `COPILOT_GITHUB_TOKEN` is a repo secret and is
never available to a fork's workflow run.

## Agent coverage

Vally evaluates skills, not custom agents. Agent orchestration is covered by the
deterministic framework and integration tests; no second model-backed harness is
maintained.

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
5. Budget at least **5 trials** (`stimuli × runs`) — below that no verdict is
   credible, and the dashboard reports it as inconclusive rather than as a pass.

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

`PARALLEL`, `RUNS`, `WORKERS`, `MODEL`, `JUDGE_MODEL` and `RESULTS_DIR` tune the
run; `eng/vally-adapter/skip-evals.txt`, when present, lists eval directories to
leave out. Each eval keeps its own `eval-results/<skill>/eval.log`.

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
| `inconclusive` | a trial errored, a trial was unmatched, or there were fewer than 5 trials |

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

## Evaluation boundary

All model-backed evaluations use Vally and compare a baseline with one isolated
skill. Framework and integration tests cover orchestration and agent behavior.
