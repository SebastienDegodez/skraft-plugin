# Évaluation des skills et tableau de bord

Cette page a migré dans le handbook, en français et en anglais :

- **Référence** — fichiers, lanceur `eng/run-vally-evals.sh` et ses variables, états de verdict,
  commentaire de pull request, jobs de CI, tableau de bord et rejeu :
  [Outillage d'évaluation](website/i18n/fr/docusaurus-plugin-content-docs/current/reference/evaluation-tooling.md) ·
  [Evaluation tooling](website/docs/reference/evaluation-tooling.md).
- **Guide pratique** — écrire une spec, la valider, lancer la comparaison, lire le verdict :
  [Évaluer un skill](website/i18n/fr/docusaurus-plugin-content-docs/current/how-to/evaluate-a-skill.md) ·
  [Evaluate a skill](website/docs/how-to/evaluate-a-skill.md).
- **Explication** — les trois couches de preuve :
  [Stratégie d'évaluation](website/i18n/fr/docusaurus-plugin-content-docs/current/explanation/evaluation-strategy.md) ·
  [Evaluation strategy](website/docs/explanation/evaluation-strategy.md) ; le test des signes et le
  plancher de six paires :
  [Lire un verdict d'évaluation](website/i18n/fr/docusaurus-plugin-content-docs/current/explanation/deep-dive/reading-a-verdict.md) ·
  [Read an evaluation verdict](website/docs/explanation/deep-dive/reading-a-verdict.md).

Les règles opposables (spec par skill, budget d'essais, modèles épinglés dans
`eng/eval-models.json`) sont dans [AGENTS.md](../AGENTS.md#vally-evaluation-rules).

## Comparing two versions of an agent

An agent suite is single-arm: it says whether one version of an agent conforms. To know
whether a change to a descriptor or a skill makes the agent cheaper or faster without
costing quality, run the same suite at two refs:

```bash
./eng/bench-agent-ab.sh software-engineer-throughput origin/main perf/tdd-loop-v1
RUNS=5 ARMS_SEQUENTIAL=1 ./eng/bench-agent-ab.sh <suite> <control-ref> <candidate-ref>
```

- The suite (`tests/agents/<suite>/`) is taken from the current checkout and copied into
  a worktree of each ref, so both arms get the same stimulus, fixture, model and graders.
- Each arm runs through that ref's own `eng/run-vally-evals.sh`.
- `eng/compare-agent-ab.mjs` reads both `results.jsonl` files and writes
  `bench-results/<suite>/<stamp>/comparison.{json,md}`: median duration split into model,
  tool and test time, test runs and the size of their output, tokens (input, output,
  cache read), Copilot cost when reported, turns, tool calls, score and pass rate.
- Verdict `improved`, `no-gain` or `quality-regression` (exit 3). Quality holds only when
  no stimulus loses median score or pass rate. Under 5 trials per arm, the report is
  marked indicative: the two arms are independent draws, not pairs.

`software-engineer-throughput` is the suite built for this: a five-scenario .NET story
(about 25 inner cycles) with a hidden oracle that checks every example of the feature,
whatever tests the agent wrote. A trial costs tens of minutes: budget it.

## Running an evaluation

Ancre conservée pour les liens existants : voir
[Le lanceur](website/i18n/fr/docusaurus-plugin-content-docs/current/reference/evaluation-tooling.md#le-lanceur) ·
[The runner](website/docs/reference/evaluation-tooling.md#the-runner).
