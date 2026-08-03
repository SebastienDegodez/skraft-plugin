---
layout: doc
lang: fr
title: "Évaluer un skill"
description: "Prouver qu'un skill améliore réellement la réponse de l'agent : écrire une spec d'évaluation, la valider sans dépenser de quota, lancer la comparaison, lire le verdict et publier la preuve."
persona: tech-lead
---

# Évaluer un skill

Un skill est une **affirmation** : *« un agent qui charge ce fichier produit un meilleur résultat qu'un agent qui ne le charge pas. »* Tant que personne ne l'a mesurée, cette affirmation reste une intuition.

Ce guide décrit la tâche : transformer cette intuition en preuve publiée sur le [tableau de bord]({{ "/dashboard/" | relative_url }}).

## Le principe en une phrase

Les mêmes prompts sont soumis deux fois — **une fois sans aucun skill** (baseline), **une fois avec le seul skill testé** (skilled) — puis un juge compare les deux trajectoires. Rien d'autre ne change entre les deux passes : la différence observée est donc attribuable au skill, et à rien d'autre.

## Étape 1 — Créer la spec d'évaluation

Créez `tests/skills/<skill>/eval.yaml`, où `<skill>` est **exactement** le nom du dossier sous `plugins/skills/`. C'est ce chemin qui permet à l'expérience de retrouver le skill à charger : si les deux noms divergent, la baseline et la passe skilled deviennent identiques et l'évaluation ne mesure plus rien.

```yaml
name: outside-in-tdd
description: Vérifie que la fonctionnalité est pilotée depuis un comportement métier observable.
type: capability
defaults:
  timeout: 3m
  runs: 3
stimuli:
  - name: Piloter une règle métier depuis l'extérieur
    prompt: |
      Notre application de commande en ligne doit appliquer une réduction
      fidélité sur le total à payer. Une commande inconnue doit produire une
      erreur « introuvable ». Implémente-la.
    graders:
      - type: prompt
    rubric:
      - Part d'un test qui traverse la frontière visible du service, formulé en termes métier.
      - Laisse le découpage interne émerger des tests au lieu de le figer d'avance.
      - Relie chaque changement de production à un test qui échouait avant et passe après.
```

## Étape 2 — Respecter les quatre règles qui rendent la mesure honnête

Une spec mal écrite produit un chiffre rassurant qui ne mesure rien. Ces quatre règles sont ce qui sépare une preuve d'un placebo.

1. **Ne jamais nommer le skill dans un prompt**, et ne jamais recopier sa formulation. Un prompt qui dit à l'agent quelle technique employer supprime précisément ce que l'évaluation cherche à observer.
2. **Juger le résultat, pas la technique.** « Identifie la dépendance manquante comme cause de l'échec » est un résultat. « Lance la commande de diagnostic avec l'option détaillée » est un détail d'implémentation qu'une autre approche, tout aussi valable, échouerait à satisfaire.
3. **Inclure un cas de non-activation.** Ajoutez un stimulus qui *ressemble* au territoire du skill mais tombe en dehors, et marquez-le `tags: { intent: non-activation }`. La retenue fait partie du comportement attendu : un skill qui se déclenche partout coûte du contexte sans rien apporter.
4. **Prévoir au moins 5 essais** (`stimuli × runs`). En dessous, aucun verdict n'est crédible — et le tableau de bord le signalera comme non concluant plutôt que comme un succès.

## Étape 3 — Valider sans dépenser de quota

Ces deux commandes n'appellent aucun modèle. Lancez-les avant toute exécution réelle.

```bash
npx --yes @microsoft/vally-cli@0.12.0 lint --eval-spec tests/skills/<skill>/eval.yaml --strict
npx --yes @microsoft/vally-cli@0.12.0 experiment run skraft-plugin.experiment.yaml --dry-run
```

Le `--dry-run` affiche, pour chaque évaluation, un plan `baseline` et un plan `skilled`. Vérifiez-y deux choses :

- les **`Eval hash`** des deux variantes sont **identiques** — les prompts n'ont pas bougé ;
- les **`Config hash`** sont **différents** — le jeu de skills, lui, a bien changé.

Si les `Config hash` sont égaux, le nom du dossier ne correspond pas à un skill existant : corrigez-le avant d'aller plus loin.

## Étape 4 — Lancer l'évaluation

L'exécution pilote un vrai agent. Elle exige `COPILOT_GITHUB_TOKEN` : un PAT *fine-grained* portant la permission **Account › Copilot Requests**. Le jeton généré automatiquement par les Actions n'atteint pas Copilot.

```bash
./eng/run-skill-evals.sh <skill>   # un seul skill
./eng/run-skill-evals.sh           # tous les skills évalués
```

En intégration continue, le workflow `skill-evaluation` fait la même chose de façon planifiée, puis publie les verdicts.

## Étape 5 — Lire le verdict

Le juge remonte un décompte de victoires, égalités et défaites. Ce décompte devient un verdict via un **test des signes binomial exact bilatéral** : une majorité de victoires ne suffit pas, encore faut-il qu'elle soit improbable sous l'hypothèse du hasard.

| Verdict | Ce qu'il signifie |
|---|---|
| `pass` | comparaison complète, suffisamment d'essais, avantage significatif |
| `regression` | même exigence, mais l'avantage est du côté de la baseline — le skill dégrade la réponse |
| `no-improvement` | comparaison saine, mais l'écart ne se distingue pas du hasard |
| `inconclusive` | un essai en erreur, un essai non apparié, ou moins de 5 essais |

Un résultat absent ou fragile n'est **jamais** affiché comme un succès. Une absence de donnée n'est pas un succès.

## Étape 6 — Consulter la preuve

Le [tableau de bord]({{ "/dashboard/" | relative_url }}) affiche le catalogue complet — chaque skill, son coût en contexte, sa couverture d'évaluation — et, pour ceux qui ont été évalués, le verdict et sa tendance sur les derniers passages.

Chaque essai enregistre aussi la trajectoire complète de l'agent. Quand des sessions ont été publiées, le tableau de bord ouvre une vue de rejeu : la passe baseline et la passe skilled du même scénario s'y rejouent côte à côte. C'est là que le verdict cesse d'être un chiffre et devient une explication — on voit *où* l'agent a bifurqué.

## Ce qu'une évaluation ne couvre pas

Une évaluation mesure **un skill isolé**. Elle ne dit rien sur l'orchestration : savoir si l'agent produit les bons artefacts, phase après phase, relève des suites de conformité du pipeline, qui utilisent un harnais distinct.

## Aller plus loin

- Référence complète du dispositif — contrats de données, adaptateurs, rétention des sessions : [`docs/skill-evaluation.md`](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/skill-evaluation.md)
- Proposer un nouveau pattern de manière disciplinée : [Genesis & contribution]({{ "/fr/how-to/contributing" | relative_url }})
- Adapter le pipeline sans casser ses garanties : [Customisation]({{ "/fr/how-to/customisation" | relative_url }})
