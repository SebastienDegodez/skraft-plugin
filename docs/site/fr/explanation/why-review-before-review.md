---
layout: doc
lang: fr
title: "Pourquoi une revue avant la revue ?"
description: "L'argument central de SKRAFT : la revue adverse assistée filtre les défauts avant que l'humain intervienne, réduisant le rework et le Time-to-Market."
---

# Pourquoi une revue avant la revue ?

> Imaginez un juge qui doit trancher un litige : vous préférez que vos avocats aient échangé leurs arguments par écrit *avant* l'audience, plutôt que de découvrir les failles devant le tribunal. SKRAFT applique ce principe à la revue de code.

## Le problème : la revue humaine absorbe trop de bruit

Dans un workflow classique, la Pull Request arrive chez le reviewer humain avec :
- des erreurs d'architecture détectables automatiquement,
- des cas limites non testés que la spec aurait dû préciser,
- des noms de variables qui obscurcissent l'intention.

Le reviewer humain passe du temps à signaler ces problèmes mécaniques au lieu de se concentrer sur les vraies questions de conception.

**Résultat** : des cycles de révision longs, du rework coûteux, un Time-to-Market (TTM) dégradé.

> **Jargon** — *TTM (Time-to-Market)* : délai entre la définition d'une fonctionnalité et sa disponibilité en production. *Rework* : travail à refaire parce qu'il ne passait pas la revue.

## La solution SKRAFT : filtrer avant l'humain

SKRAFT insère une **revue adverse assistée** *avant* que le code atteigne un humain. Cette revue est menée par des agents spécialisés appelés *reviewers*, qui jouent un rôle d'avocat du diable :

1. Chaque reviewer applique une **lentille** différente (architecture, lisibilité, gates de qualité, intégrité des tests).
2. Si le verdict est `REJECT`, l'agent exécuteur doit corriger et soumettre à nouveau — sans impliquer d'humain.
3. Seulement quand tous les verdicts sont `APPROVE` (ou `CONDITIONAL_APPROVE`), la Pull Request monte vers la revue humaine.

```
[Code produit] → [Reviewer IA × 4 lentilles] → [Corrections si REJECT] → [PR humaine]
```

> **Jargon** — *lentille* : un point de vue spécifique appliqué à la revue (ex : "est-ce que les frontières d'architecture sont respectées ?"). *Gate* : seuil de qualité à franchir pour passer à la phase suivante.

## Ce que ça change concrètement

| Avant (sans SKRAFT) | Avec SKRAFT |
|---------------------|-------------|
| La PR arrive avec des problèmes détectables automatiquement | Les problèmes mécaniques sont filtrés avant la PR humaine |
| Le reviewer humain signale des erreurs basiques | Le reviewer humain se concentre sur la conception et le métier |
| Plusieurs cycles de révision pour une story | Moins de cycles, moins de rework |

## Ce que ça ne change pas

SKRAFT ne remplace pas le jugement humain. Il filtre le bruit pour que le reviewer humain se concentre sur ce qui compte vraiment : la pertinence métier, les choix de conception non évidents, l'expérience utilisateur.

## Pourquoi ça fonctionne

Deux observations bien établies de l'ingénierie logicielle fondent cette approche.

D'abord, **plus un défaut est détecté tôt, moins il coûte cher à corriger** : un problème trouvé à la revue est bien moins coûteux que le même problème trouvé après la fusion. La revue adverse assistée déplace la détection vers la gauche, avant même l'humain.

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Ensuite, **la vitesse et la stabilité ne s'opposent pas** : les équipes les plus performantes livrent souvent *et* cassent rarement, parce qu'elles automatisent les contrôles de qualité au lieu de les reporter sur une revue manuelle tardive.

> « High performers understand that they don't have to trade speed for stability or vice versa. »
> — Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.

SKRAFT matérialise ces deux principes : des gates explicites, vérifiées par un reviewer indépendant, qui déplacent la détection des défauts en amont de la revue humaine.

## Périmètre de la revue adverse

Les lentilles adversariales détectent des **violations structurelles et de couverture** :
frontières d'architecture franchies, tests qui ne vérifient rien, mutation score sous
le seuil, code dont l'intention est opaque. Elles ne détectent pas les
**hallucinations factuelles** : une règle métier inventée par le modèle, une API externe
inexistante citée comme valide, ou des hypothèses de domaine incorrectes intégrées dans
la logique. Ces erreurs sont invisibles à l'analyse structurelle statique.

La correction factuelle nécessite des tests d'acceptation métier spécifiques et le
jugement du reviewer humain — les garde-fous maintiennent la structure honnête,
pas les faits.

## Sources

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

> « High performers understand that they don't have to trade speed for stability or vice versa. »
> — Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.

## Voir aussi

- [Pour les décideurs]({{ "/fr/explanation/for-executives" | relative_url }}) — projection du TTM pour les décideurs
- [Les lentilles]({{ "/fr/reference/lens" | relative_url }}) — les 4 lentilles de revue adverse
- [Le pipeline]({{ "/fr/explanation/pipeline/" | relative_url }}) — les 5 phases du cycle de vie
