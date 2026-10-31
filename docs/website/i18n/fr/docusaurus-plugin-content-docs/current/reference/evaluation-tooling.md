---
title: "Outillage d'évaluation"
description: "Les fichiers, le lanceur, ses variables, les états de verdict, le commentaire de pull request, les jobs de CI et le tableau de bord de l'évaluation des skills et des agents."
persona: tech-lead
---

# Outillage d'évaluation

Ce que contient l'outillage qui évalue les skills et les agents de skraft avec Vally 0.12.0 :
fichiers, lanceur, états de verdict, commentaire de pull request, CI et tableau de bord.

Pourquoi trois couches de preuve et une comparaison appariée :
[Stratégie d'évaluation](../explanation/evaluation-strategy.md). Les étapes :
[Évaluer un skill](../how-to/evaluate-a-skill.md). La lecture d'une ligne de
verdict, chiffre par chiffre :
[Lire un verdict d'évaluation](../explanation/deep-dive/reading-a-verdict.md).

## Fichiers

| Chemin | Contenu |
|---|---|
| `tests/skills/<skill>/eval.yaml` | Spec d'un skill : stimuli, graders, rubrique. `<skill>` est le nom du dossier `plugins/<plugin>/skills/<skill>/`. |
| `tests/skills/<skill>/eval.skill-dir.yaml` | Facultatif : skills compagnons montés avec le skill évalué dans le bras « skill » (`skills: [...]`). |
| `tests/skills/<skill>/README.md` | Le portefeuille de l'évaluation (voir [README d'une évaluation](#evaluation-readme)). |
| `tests/agents/<suite>/eval.yaml` | Suite d'agent : l'agent `.agent.md` lancé et ce qui doit tenir. |
| `tests/agents/<suite>/fixtures/<état>/` | Fichiers que la suite dépose avant de lancer l'agent. |
| `eng/eval-models.json` | Seul endroit où un modèle versionné est écrit : familles (`economy`, `standard`), famille par défaut, juge, juge de comparaison. |
| `eng/run-vally-evals.sh` | Seul point d'entrée d'une évaluation. |
| `eng/vally-adapter/skip-evals.txt` | Facultatif : dossiers d'évaluation laissés de côté. |
| `eng/lib/verdict.mjs`, `eng/lib/agent-verdict.mjs` | Règles du verdict d'un skill et d'une suite d'agent. |
| `eng/build-pr-comment.mjs`, `eng/check-pr-regressions.mjs` | Commentaire de pull request ; échec sur une régression de skill. |
| `eng/dashboard/` | Historique des verdicts, données du tableau de bord, sessions rejouables, rétention. |
| `.github/workflows/skill-evaluation.yml` | Lint, planification, évaluation, publication planifiée, comparaison de modèles. |
| `.github/workflows/evaluation-evidence.yml` | Publication des preuves d'une pull request, nettoyage à sa fermeture. |

Ce que l'outillage écrit n'est jamais commité : `eval-results/`, `eval-results-pilot/`,
`eval-baseline-cache/`, `dashboard-data/`, `docs/site/dashboard/data/`.

## Le lanceur

| Commande | Lance |
|---|---|
| `./eng/run-vally-evals.sh` | tous les skills et toutes les suites d'agent |
| `./eng/run-vally-evals.sh <skill>` | un skill |
| `./eng/run-vally-evals.sh agents` | toutes les suites d'agent |
| `./eng/run-vally-evals.sh agents <suite>` | une suite d'agent |

Un skill est joué deux fois : bras témoin avec un `--skill-dir` vide, bras « skill » avec le
skill seul (plus les compagnons de `eval.skill-dir.yaml`, copiés et non liés). Une suite d'agent
est jouée une fois. Prérequis : le CLI `@microsoft/vally-cli@0.12.0` (sinon un `npx` de la même
version), et `COPILOT_GITHUB_TOKEN` (PAT à grain fin avec **Account › Copilot Requests**) ou
`gh auth login`.

| Variable | Défaut | Effet |
|---|---|---|
| `PARALLEL` | `4` | Évaluations menées en même temps. |
| `WORKERS` | `3` | Stimuli en même temps dans chaque bras d'un skill. |
| `ARMS_PARALLEL` | `1` | `1` : les deux bras d'un skill en même temps ; `0` : l'un après l'autre. |
| `AGENT_WORKERS` | `1` | Stimuli en même temps dans une suite d'agent. |
| `RUNS` | vide | Vide : chaque spec décide par `defaults.runs`. Une valeur remplace celle de toutes les specs ; la CI ne la pose jamais. |
| `MODEL` | vide | Vide : la famille de `defaults.model`, sinon la famille par défaut. Une famille ou un modèle force toutes les évaluations. |
| `JUDGE_MODEL` | juge épinglé | Juge des trajectoires. `COMPARISON=1` prend le juge de comparaison. |
| `STIMULI` | vide | Skills seulement : fragments de noms de stimuli ; écrit dans `eval-results-pilot/`. Un pilote n'est jamais un verdict. |
| `PILOT_RUNS` | vide | Avec `STIMULI` : remplace `defaults.runs` du pilote. |
| `SKILL_MAX_RETRIES` | vide | Entier ≥ 0 passé en `--max-retries` aux deux bras ; vide garde le défaut de Vally (2). |
| `AGENT_MAX_RETRIES` | `0` | Relances d'une suite d'agent. |
| `BASELINE_CACHE` | `0` | `1` : réutilise les témoins en cache, en local seulement (refusé en CI) ; le résultat porte `baselineProvenance.publishable: false`. |
| `SKIP_EVALS`, `SKIP_AGENTS` | — | Liste à sauter (remplace `skip-evals.txt`) ; `1` laisse les suites d'agent hors d'un run sans nom. |
| `LIVE_LOGS` | `1` | Affiche la sortie de Vally en gardant `eval.log`. |
| `RESULTS_DIR` | `eval-results` | Dossier de sortie : `<skill>/results.json`, `<suite>/results.json`. |

## Spec d'un skill : règles que l'outillage applique

- `defaults.model` nomme une famille de `eng/eval-models.json` ; le lanceur refuse un autre nom.
- `rubric` est au même niveau que `graders`. Une rubrique placée sous `graders[].config` est
  remplacée par la rubrique générique de Vally.
- Chaque stimulus déclare un grader `skill-invocation` : `required` sur un cas positif,
  `disallowed` sur le cas de non-activation (`tags: { intent: non-activation }`). Ce grader est
  retiré du score apparié (`eng/lib/paired-trials.mjs`) ; une spec de skill ne déclare donc
  jamais `scoring.weights`.
- Un grader `prompt` porte `scoring: scale_1_10`.

## README d'une évaluation <!-- #evaluation-readme -->

`tests/skills/<skill>/README.md` garde le raisonnement qu'un `eval.yaml` ne peut pas porter :

| Section | Contenu |
|---|---|
| Scope | Les comportements que ce skill possède seul, et les voisins exclus. |
| Stimuli | Une ligne par stimulus : la décision qu'il force et sa classe (décisif, garde de régression, non-activation). |
| Proof surface | Ce qui prouve le résultat de chaque stimulus : graders déterministes ou juge sur rubrique. |
| Cut | Les candidats écartés, avec la raison. |
| Power | Pourquoi le budget d'essais franchit le plancher de six paires discordantes. |
| Fixtures | Ce que chaque fixture rend facile de rater. |

Le README donne le résultat attendu de chaque garde de régression et de chaque non-activation,
et ne contient aucun état d'exécution (run, score, blocage). Exemples :
`tests/skills/architecture-patterns/README.md`, `tests/skills/clean-architecture-testing/README.md`.

## États d'un verdict

**Skill** (`eng/lib/verdict.mjs`) : test des signes binomial exact bilatéral sur les paires
discordantes, et test des rangs signés de Wilcoxon sur les écarts de score ; les deux au seuil
0,05. Une comparaison jugée seulement par le juge n'a pas d'écart à classer : le test des signes
décide seul.

| État | Condition |
|---|---|
| `pass` | Complet, assez d'essais, plus de victoires que de défaites, les deux p ≤ 0,05. |
| `regression` | Complet, assez d'essais, plus de défaites que de victoires, les deux p ≤ 0,05. |
| `no-improvement` | Complet et assez d'essais, écart indiscernable du hasard. |
| `inconclusive` | Un essai en erreur ou non apparié, moins de 5 essais (`MIN_CREDIBLE_TRIALS`), ou de 1 à 5 paires discordantes (`MIN_DISCORDANT_PAIRS` = 6). Zéro paire discordante n'est pas un manque de puissance. |

Une paire où le skill ne s'est pas chargé côté traitement est retirée du décompte, sans rendre le
verdict `inconclusive`.

**Suite d'agent** (`eng/lib/agent-verdict.mjs`) : pas de témoin, donc pas de test des signes.

| État | Condition |
|---|---|
| `pass` | Chaque essai a tourné et atteint le `scoring.threshold` de la suite. |
| `flaky` | Chaque essai a tourné, au moins un sous le seuil, chaque scénario garde au moins deux tiers d'essais conformes. |
| `regression` | Chaque essai a tourné, et un scénario tombe sous deux tiers d'essais conformes. |
| `inconclusive` | Un essai en erreur. |

## Commentaire de pull request

Le workflow tient **un** commentaire par pull request, retrouvé par le marqueur caché
`<!-- skraft:skill-evaluation -->` et réécrit à chaque évaluation avec le commit évalué. La même
table va dans le résumé du run.

| Table | Colonnes |
|---|---|
| Skills | Skill, Verdict, Score (IC 95 %), Sign test (`W/T/L (p=…)`), Quality Δ, Efficiency Δ (tokens, temps), Reason |
| Agents | Agent, Verdict, Score, Conforming trials, Reason |

Mentions de la colonne Reason :

| Mention | Ce qui s'est passé |
|---|---|
| `n at the ceiling` | Les deux bras ont eu la note maximale : le stimulus ne départage pas. |
| `n in the same grader bucket` | Les bras diffèrent de moins d'un cran de l'échelle du juge. |
| `n at the floor` | Aucun bras n'a marqué. |
| `never loaded on <stimulus> (0/n)` | Le skill ne s'est jamais chargé sur ce stimulus : ces paires sont retirées. |
| `no measured effect on either instrument …` | Graders et juge à égalité sur au moins 80 % des paires. |
| `underpowered (…)` | Moins de six paires discordantes. |

## CI

| Job | Déclenchement | Bloquant | Appelle un modèle |
|---|---|---|---|
| `lint` | Pull request touchant skills, agents, specs, `eng/` | oui | non |
| `plan` | Pull request du dépôt, planification (lundi 03:00 UTC), lancement manuel | non | non |
| `evaluate-subject` | Une cellule par sujet planifié, au plus 8 à la fois | une cellule de skill en erreur échoue ; une cellule d'agent jamais | oui |
| `evaluate-pr` | Après les cellules d'une pull request | seulement sur une `regression` de skill crédible | non |
| `publish` | Après un run planifié ou manuel : branche `dashboard-data` | non | non |
| `compare-matrix`, `compare-models`, `publish-comparison` | Lancement manuel avec `models` : un même skill par modèle, un seul juge | non | oui (`compare-models`) |
| `publish-pr` (`evaluation-evidence.yml`) | Après une évaluation de pull request : verdicts et trajectoires publiés ensemble | oui | non |
| `cleanup-pr-replay` (`evaluation-evidence.yml`) | Fermeture de la pull request | non | non |

- Sur une pull request, `plan` ne retient que les sujets dont le **contenu IA** a changé
  (`eng/lib/changed-skills.mjs`) : dossier du skill et de ses compagnons, descripteurs des agents
  qu'une suite nomme (`tags.agent`, `tags.subagents`), dossier de la spec, fichiers qu'elle dépose.
  Une pull request d'outillage ou de code n'évalue rien et passe la porte.
- Un sujet dont l'empreinte de contenu IA (`eng/eval-reuse.mjs`) est celle de la dernière
  évaluation de la pull request est repris, marqué réutilisé, jamais publié comme mesure neuve ;
  une cellule de plus de 14 jours, un « Re-run all jobs », un run planifié ou manuel rejouent tout.
- Un nouveau push annule l'évaluation en cours de la pull request. Une pull request venue d'un
  fork n'est pas évaluée : `COPILOT_GITHUB_TOKEN` ne lui est pas donné.

## Tableau de bord et rejeu

| Moitié | Source | Rafraîchie par |
|---|---|---|
| Catalogue : ce que le plugin livre, poids de chaque skill, couverture d'évaluation | les sources du plugin | le déploiement Pages |
| Preuves : verdicts, tendance, sessions | la branche `dashboard-data` | les workflows d'évaluation, lus par le navigateur |

Chaque essai enregistre sa trajectoire ; le rejeu AGENTVIZ est servi sous `/dashboard/replay/`,
témoin et skill côte à côte. Les sessions planifiées sont gardées 14 jours ; celles d'une pull
request disparaissent à sa fermeture, ses verdicts restent.

| Commande | Effet |
|---|---|
| `npm run dashboard:preview` | `http://127.0.0.1:4173/dashboard/` |
| `npm run dashboard:preview -- --port 8080` | autre port |
| `npm run dashboard:preview -- --no-serve` | données seulement |

Sans verdict, le tableau de bord montre le catalogue complet et marque le reste non évalué.

## Voir aussi

- [Évaluer un skill](../how-to/evaluate-a-skill.md)
- [Stratégie d'évaluation](../explanation/evaluation-strategy.md)
- [Lire un verdict d'évaluation](../explanation/deep-dive/reading-a-verdict.md)
- [Tableau de bord](pathname:///dashboard/)
