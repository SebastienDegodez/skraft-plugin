---
layout: doc
lang: fr
title: "Évaluer un skill"
description: "Écrire la spec d'évaluation d'un skill, la valider sans dépenser de quota, lancer la comparaison baseline contre skill, lire le verdict et le consulter sur le tableau de bord."
persona: tech-lead
---

# Évaluer un skill

**But** : obtenir un verdict mesuré (`pass`, `regression`, `no-improvement` ou `inconclusive`)
qui dit si un skill améliore la réponse de l'agent.

## Prérequis

- Un clone du dépôt `skraft-plugin`, Node 22 ou plus, `npm install` fait à sa racine.
- Le skill sous `plugins/<plugin>/skills/<skill>/`.
- Un accès à Copilot : `COPILOT_GITHUB_TOKEN` (un PAT fine-grained avec la permission
  **Account › Copilot Requests**), ou `gh auth login`.

## 1. Écrire la spec

Créez `tests/skills/<skill>/eval.yaml`, où `<skill>` est exactement le nom du dossier du skill :

```yaml
name: outside-in-tdd
description: Vérifie que la fonctionnalité est pilotée depuis un comportement métier observable.
type: capability
defaults:
  timeout: 4m
  runs: 4
  model: standard
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
      - Relie chaque changement de production à un test qui échouait avant et passe après.
  # … deux autres stimuli, dont un cas de non-activation : 3 stimuli × 4 runs = 12 essais
```

`defaults.model` nomme une famille d'`eng/eval-models.json` (`standard`, `economy`), jamais un
modèle versionné.

## 2. Relire la spec avec cette liste

- [ ] Aucun prompt ne nomme le skill ni ne recopie sa formulation.
- [ ] Chaque rubrique juge le résultat, pas la technique employée.
- [ ] Un stimulus hors du territoire du skill porte `tags: { intent: non-activation }`.
- [ ] `stimuli × runs` donne 12 à 15 essais : en dessous de six paires décisives, aucun verdict
  ne peut passer.

Pourquoi ces règles : [Stratégie d'évaluation]({{ "/fr/explanation/evaluation-strategy" | relative_url }}).

## 3. Valider la spec sans lancer d'agent

```bash
npm install -g @microsoft/vally-cli@0.12.0
vally lint --eval-spec tests/skills/<skill>/eval.yaml --strict
```

Le lint ne démarre aucun agent et ne consomme aucun quota.

## 4. Lancer la comparaison

```bash
./eng/run-vally-evals.sh <skill>
```

Le script joue chaque stimulus deux fois, sans skill (baseline) et avec le seul skill évalué,
puis fait juger les deux trajectoires. Pour un essai à petit budget sur quelques stimuli,
`STIMULI="<fragment de nom>" ./eng/run-vally-evals.sh <skill>` écrit dans `eval-results-pilot/` :
un pilote n'est jamais un verdict.

## 5. Lire le verdict

| Verdict | Quoi faire |
|---|---|
| `pass` | Le skill aide : le garder. |
| `regression` | La baseline fait mieux : revoir le skill ; ce verdict bloque la fusion d'une PR. |
| `no-improvement` | Aucun écart distinguable du hasard : simplifier le skill ou revoir la rubrique. |
| `inconclusive` | Essai en erreur, essai non apparié, moins de 5 essais ou moins de 6 paires décisives : lire la raison du verdict avant d'ajouter des essais. |

La ligne `9V/4E/2D (p=0,065)` se lit chiffre par chiffre dans
[Lire un verdict d'évaluation]({{ "/fr/explanation/deep-dive/reading-a-verdict" | relative_url }}).

## 6. Consulter la preuve

```bash
npm run dashboard:preview
```

Ouvrez `http://127.0.0.1:4173/dashboard/` : le skill montre son verdict, sa tendance et, quand
des sessions ont été publiées, le rejeu côte à côte des deux passes. Sur une PR qui touche un
skill évalué, le workflow `skill-evaluation` poste le même verdict en commentaire.

## Évaluer un agent

Une suite agent se place sous `tests/agents/<suite>/eval.yaml` et se lance avec :

```bash
./eng/run-vally-evals.sh agents <suite>
```

Elle n'a pas de baseline : son verdict (`pass`, `flaky`, `regression`, `inconclusive`) atteste
une conformité, et reste indicatif.

## Dépannage

| Signe | Action |
|---|---|
| `<skill> (skipped — no skill dir)` | Renommer `tests/skills/<skill>/` comme le dossier du skill. |
| `Set COPILOT_GITHUB_TOKEN (fine-grained PAT with Copilot Requests) or run 'gh auth login'.` | Exporter le jeton, ou `gh auth login`. |
| `inconclusive` avec moins de 6 paires décisives | Augmenter `defaults.runs` de la spec, puis relancer la spec entière. |
| `inconclusive` sur un essai en erreur | Lire `eval.log` du résultat ; ajouter des essais ne le corrige pas. |

## Voir aussi

- [Stratégie d'évaluation]({{ "/fr/explanation/evaluation-strategy" | relative_url }})
- [Lire un verdict d'évaluation]({{ "/fr/explanation/deep-dive/reading-a-verdict" | relative_url }})
- [Tableau de bord]({{ "/dashboard/" | relative_url }})
- [`docs/skill-evaluation.md`](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/skill-evaluation.md)
  — contrats de données, adaptateurs, rétention des sessions.
