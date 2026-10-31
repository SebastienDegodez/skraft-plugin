---
title: "Évaluer un skill"
description: "Écrire la spec d'évaluation d'un skill, la valider sans dépenser de quota, lancer la comparaison baseline contre skill, lire le verdict, le consulter sur le tableau de bord et rejouer une paire baseline contre skill."
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

Pourquoi ces règles : [Stratégie d'évaluation](../explanation/evaluation-strategy.md).

## 3. Valider la spec sans lancer d'agent

:::caution[Non vérifié sur V2]
L'évaluation Vally est en pause sur le travail V2 : les commandes des
étapes 3, 4 et 6 et de « Évaluer un agent » ci-dessous (`vally`, `./eng/run-vally-evals.sh`,
`npm run dashboard:preview`) n'ont pas été relancées sur V2. Sous Windows,
`./eng/run-vally-evals.sh` est un script bash : lancez-le depuis Git Bash ou WSL.
:::

```console
$ npm install -g @microsoft/vally-cli@0.12.0
$ vally lint --eval-spec tests/skills/<skill>/eval.yaml --strict
```

Le lint ne démarre aucun agent et ne consomme aucun quota.

## 4. Lancer la comparaison

```console
$ ./eng/run-vally-evals.sh <skill>
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
[Lire un verdict d'évaluation](../explanation/deep-dive/reading-a-verdict.md).

## 6. Consulter la preuve

```console
$ npm run dashboard:preview
```

Ouvrez `http://127.0.0.1:4173/dashboard/` : l'onglet **Qualité** montre le verdict du skill, ses
scores baseline et avec skill, et son taux d'activation. Sur une PR qui touche un skill évalué, le
workflow `skill-evaluation` poste le même verdict en commentaire.

## 7. Rejouer une paire

Le rejeu montre ce que le skill a changé dans le comportement de l'agent. Il vit sur le tableau de
bord publié, une fois les sessions de l'évaluation publiées : l'aperçu local n'embarque pas
l'application de rejeu et n'affiche pas son entrée.

1. Sur le tableau de bord publié, cliquez sur **Ouvrir le replay**.

   ![Tableau de bord : les chiffres du catalogue, puis l'encadré « Replay de session » et son bouton « Ouvrir le replay », au-dessus des onglets Catalogue, Qualité, Efficacité et Modèles](/img/screenshots/fr/dashboard-catalogue.png)

   *Figure 1 — L'entrée du rejeu, sous les chiffres du catalogue.*

2. Dans AGENTVIZ, passez en vue **List** et tapez le nom du skill dans **Search sessions**. Chaque
   session se nomme `<skill> / <scénario> (<bras>, run <n>)` et porte en étiquettes le skill, le
   scénario et le bras, `baseline` ou `skilled`.

   ![AGENTVIZ, vue List : les étiquettes 2026-09-28, baseline, outside-in-tdd, le scénario, scheduled et skilled, puis les deux sessions du scénario, bras skilled et baseline, run 1](/img/screenshots/shared/replay-sessions.png)

   *Figure 2 — Les deux bras de l'essai 1 d'un scénario d'`outside-in-tdd`.*

3. Ouvrez la session `baseline` puis la session `skilled` **du même numéro de run** : ce sont les deux
   moitiés d'une paire. Pour chacune, ouvrez **Investigate** : le flux de preuves liste chaque appel
   d'outil et finit sur le rapport de l'agent.
4. Comparez les outils utilisés et les rapports. Dans le bras `skilled`, un appel `skill` montre que
   le skill s'est chargé ; sans lui, la paire compare deux baselines.

Ce qu'une paire révèle, sur un exemple réel :
[Lire un verdict d'évaluation](../explanation/deep-dive/reading-a-verdict.md#replay).

## Évaluer un agent

Une suite agent se place sous `tests/agents/<suite>/eval.yaml` et se lance avec :

```console
$ ./eng/run-vally-evals.sh agents <suite>
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

- [Stratégie d'évaluation](../explanation/evaluation-strategy.md)
- [Lire un verdict d'évaluation](../explanation/deep-dive/reading-a-verdict.md)
- [Tableau de bord](pathname:///dashboard/)
- [Outillage d'évaluation](../reference/evaluation-tooling.md)
  — contrats de données, adaptateurs, rétention des sessions.
