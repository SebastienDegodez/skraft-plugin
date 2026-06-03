---
layout: doc
lang: fr
title: "Pourquoi la revue avant la revue ?"
description: "Le cœur de l'argument SKRAFT : la revue adverse assistée filtre avant l'humain. Moins de rework, TTM réduit."
---

> 🚧 GENERATED DRAFT — to be reviewed and completed by a human.

# Pourquoi la revue avant la revue ?

> La revue de code humaine est précieuse — et rare. SKRAFT la protège en éliminant les problèmes évidents avant qu'elle commence.

## Le problème

Dans un cycle de développement classique, la revue humaine arrive **en dernier**. Le développeur livre, l'humain relit. Si un problème est détecté — architecture incohérente, test manquant, scénario flou — tout le monde repasse par le début. C'est le **rework** : du travail refait, du temps perdu, du TTM (Time To Market) allongé.

*TTM* (Time To Market) : le temps entre l'idée et la mise en production. Plus il est court, plus l'organisation répond vite à ses utilisateurs.

## La solution SKRAFT

SKRAFT insère une **revue adverse assistée** à chaque phase du pipeline, **avant** que le travail ne passe à l'humain :

1. Un agent exécuteur produit un artefact (scénarios BDD, plan d'architecture, code).
2. Un reviewer IA indépendant, armé de lentilles spécialisées, inspecte cet artefact.
3. Si le verdict est REJECTED, le cycle recommence automatiquement — sans intervention humaine.
4. Seulement quand le verdict est APPROVED, l'artefact remonte vers le reviewer humain.

```
Exécuteur → Reviewer IA → [REJECTED → retry] → APPROVED → Humain
```

## Ce que ça change concrètement

| Sans SKRAFT | Avec SKRAFT |
|-------------|-------------|
| L'humain trouve les problèmes évidents | L'humain se concentre sur la valeur métier |
| Rework fréquent en fin de cycle | Rework détecté tôt, coût moindre |
| TTM allongé par les allers-retours | TTM réduit par le filtrage automatique |
| Feedback tardif | Feedback continu à chaque phase |

## Pourquoi "adverse" ?

Le reviewer ne cherche pas à valider — il cherche à **réfuter**. C'est la même logique que le test : un test qui ne peut pas échouer ne prouve rien. Un reviewer qui ne cherche pas à rejeter ne protège rien.

Les quatre lentilles (architecture-boundaries, cold-reader, quality-gates, test-integrity) incarnent quatre façons différentes de réfuter un artefact.

## Ce que ça ne remplace pas

La revue humaine reste indispensable. SKRAFT ne la supprime pas : il la **prépare**. L'humain reçoit un artefact qui a déjà été challengé, documenté et corrigé automatiquement. Sa revue est plus courte, plus focalisée, plus à valeur ajoutée.

## Sources

> 🚧 À compléter par un humain avec les références appropriées (ex : Freeman & Pryce sur le feedback rapide, Beck sur le coût du changement tardif).

---

*Page générée automatiquement — brouillon à compléter par un humain.*
