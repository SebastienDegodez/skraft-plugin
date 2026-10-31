---
title: "Stratégie d'évaluation"
description: "Pourquoi skraft prouve sa qualité en trois couches (tests déterministes du moteur, comparaison appariée des skills, conformité des agents réels), et ce que chaque couche ne peut pas dire."
persona: tech-lead
---

# Stratégie d'évaluation

Un skill est une affirmation : un agent qui charge ce fichier fait mieux qu'un agent qui ne le
charge pas. Tant que personne ne l'a mesurée, ce n'est qu'une intuition.

skraft répond à trois questions différentes, chacune par une couche de preuve à elle. Aucune ne
remplace les deux autres.

## Couche 1 : le moteur fait-il ce qu'il dit ?

Le moteur décide de l'ordre des phases, des sorties attendues, des gates et des verdicts. Ces
décisions sont du code, et ce code se teste comme n'importe quel code : des scénarios d'acceptation
qui entrent par un cas d'usage (`tests/skraft-framework/unit/`), des tests d'intégration sur de
vrais adaptateurs, Git et processus (`tests/skraft-framework/integration/`). Aucun de ces tests
n'appelle un modèle : ils sont déterministes, et un échec y désigne un bug, jamais du bruit.

Le mutation testing vérifie ensuite que ces tests détectent vraiment les erreurs : un mutant qui
survit montre un comportement qu'aucun test ne distingue. C'est la même exigence que celle que
skraft impose au code qu'il livre (Jia & Harman, 2011).

Ce que cette couche ne dit pas : si les agents, guidés par le moteur, produisent un bon travail.

## Couche 2 : ce skill améliore-t-il la réponse ?

Un skill qui *semble* bon peut produire un pire résultat, ou coûter du contexte sans rien
apporter. Seule une mesure le montre.

La mesure est une **comparaison appariée** : les mêmes prompts sont joués deux fois, une fois sans
aucun skill (baseline), une fois avec le seul skill évalué, et rien d'autre ne change entre les
deux passes. La spec est la même pour les deux bras ; seul le dossier de skills diffère, vide pour
la baseline. Un juge compare les deux trajectoires de chaque paire, selon une rubrique écrite
d'avance.

Le décompte de victoires, égalités et défaites devient un verdict par un **test des signes
binomial exact bilatéral**. Une majorité de victoires ne suffit pas : il faut qu'elle soit
improbable sous l'hypothèse du hasard. Les égalités ne départagent rien et sont écartées ; en
dessous de six paires décisives, aucun décompte, même parfait, n'atteint `p ≤ 0,05`. D'où un
budget de 12 à 15 essais par spec, acheté d'emblée : ajouter des essais à une comparaison déjà
bruitée est la pire dépense. Le détail chiffré est dans
[Lire un verdict d'évaluation](./deep-dive/reading-a-verdict.md).

Trois règles d'écriture empêchent la mesure de devenir un placebo :

- **Ne jamais nommer le skill dans un prompt.** Un prompt qui dit quelle technique employer
  supprime ce que l'évaluation cherche à observer.
- **Juger le résultat, pas la technique.** Une autre approche, tout aussi valable, échouerait à
  une rubrique qui exige une commande précise.
- **Inclure un cas de non-activation.** Un skill qui se déclenche partout coûte du contexte
  partout ; la retenue fait partie du comportement attendu.

Le test est bilatéral et décidé d'avance : on ne choisit pas après coup le sens qui arrange.
Une `regression` crédible bloque la fusion d'une PR ; `no-improvement` et `inconclusive`
informent sans bloquer.

Ce que cette couche ne dit pas : ce qui se passe quand plusieurs skills se chargent ensemble.
Elle mesure un skill à la fois.

## Couche 3 : les agents réels se conforment-ils à ce qu'ils déclarent ?

Une suite agent (`tests/agents/<suite>/`) dispatche un vrai agent skraft sur une tâche réelle et
vérifie, par des graders déterministes, qu'il est le bon agent, qu'il a chargé ses skills
requis et que son handoff a la forme déclarée. Il n'y a pas d'agent baseline à lui opposer : la
suite atteste une **conformité**, pas un gain, et n'a donc pas de test des signes.

Une suite joue une seule session d'agent réel ; un run instable ne doit pas bloquer une fusion
sans rapport. Son verdict (`pass`, `flaky`, `regression`, `inconclusive`) est publié à côté de
ceux des skills, mais reste indicatif.

## Ce que l'ensemble apporte

| Angle mort habituel | Couche qui le couvre |
| --- | --- |
| Des tests qui passent sans rien vérifier | Couche 1 : le mutation testing montre ce qu'ils ne distinguent pas |
| « Le skill a l'air correct » | Couche 2 : s'il ne fait pas mieux que la baseline, le verdict le dit |
| « Ça a marché la dernière fois » | Couches 2 et 3 : chaque essai est rejouable, chaque trajectoire enregistrée |
| Choisir après coup le résultat qui arrange | Couche 2 : test bilatéral, budget fixé dans la spec, pilotes jamais publiés |
| Un agent qui ignore ses skills | Couche 3 : la conformité se vérifie sur une session réelle |

Une absence de donnée n'est jamais affichée comme un succès : un verdict `inconclusive` dit
pourquoi il ne conclut pas.

## Pour aller plus loin

- [Évaluer un skill](../how-to/evaluate-a-skill.md) — les étapes.
- [Lire un verdict d'évaluation](./deep-dive/reading-a-verdict.md)
- [Software craftsmanship](./software-craftsmanship.md) — la
  même exigence appliquée au code livré.

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
