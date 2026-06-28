---
layout: doc
lang: fr
title: "adr-eligibility-gate"
description: "Use BEFORE drafting any ADR when a story enters DESIGN phase, or when reviewing an ADR set that feels inflated."
persona: tech-lead
---

# adr-eligibility-gate

> Porte pré-rédaction qui exécute un contrôle baseline-vs-décision sur chaque choix architectural candidat et émet un verdict `ELIGIBLE` ou `NOT ELIGIBLE` avant la rédaction de tout corps d'ADR.

## Quand l'utiliser

- La phase DESIGN débute pour une story et l'équipe envisage de documenter des choix architecturaux
- L'architecte évalue si un choix candidat mérite un ADR avant d'en rédiger le corps
- Un relecteur signale `ADR-INFLATION` (plusieurs ADRs pour une story où 0–1 est attendu)
- La question est posée : « devrais-je écrire un ADR pour X ? », « combien d'ADRs cette story nécessite-t-elle ? », ou « distinguer baseline de décision »

## Contrat d'entrée

- Un ou plusieurs choix architecturaux candidats à évaluer
- Le contexte architectural actuel (artefacts DESIGN, stories, critères d'acceptance)
- Accès au skill `architecture-patterns` (requis pour l'évaluation Q3)
- Référence aux skills actifs du projet et aux ADRs existants (pour le contrôle de baseline Q1)

## Contrat de sortie

Pour chaque candidat, la porte émet un verdict structuré :

```
Candidate: <short description>
Verdict: ELIGIBLE | NOT ELIGIBLE
Reason: <1-line citation to Q1-Q5 + skill/ADR section>
```

Les candidats `ELIGIBLE` passent dans `architecture-decisions` pour le template et le cycle de vie. Les candidats `NOT ELIGIBLE` sont écartés — aucun corps d'ADR n'est rédigé.

## Invariants

**Question centrale :** Ce choix ratifie-t-il une question ouverte réelle avec de vrais compromis, ou re-déclare-t-il la baseline du projet / une convention déjà appliquée par un skill ?

### Checklist 5 questions

Répondre dans l'ordre. S'arrêter à la première question qui donne un verdict.

| # | Question | Verdict si OUI | Verdict si NON |
|---|---|---|---|
| Q1 | Déjà appliqué par un skill du projet ou un test d'architecture automatisé ? | NOT ELIGIBLE — citer le skill ou l'ADR | → Q2 |
| Q2 | Formulé comme « bonne pratique » ou « éviter l'antipattern X » ? *(Exception : relation de context-mapping → Q3)* | NOT ELIGIBLE — bonne pratique baseline / évitement d'antipattern | → Q3 |
| Q3 | Ajoute de la complexité au-delà de la baseline du projet ? *(charger `architecture-patterns` — frontière de couche, frontière d'agrégat, CQRS+Bus, Event Sourcing, Saga, Specification, ACL, Published Language, Conformist, frontière de bounded context, ou préoccupation transversale)* | → Q4 | NOT ELIGIBLE — aucune complexité ajoutée au-delà de la baseline |
| Q4 | Soulevé par une story, un AC ou une force mesurable dans le batch courant ? *(Silence = défaut baseline)* | → Q5 | NOT ELIGIBLE — question non soulevée ; artefact de non-décision (G14) |
| Q5 | Crée-t-il une tension entre au moins deux des 5 Forces Universelles ? *(Simplicité, Cohérence, Performance, Évolutivité, Capacité de l'équipe)* | ELIGIBLE — compromis réel | NOT ELIGIBLE — aucun compromis réel ; devrait être baseline |

### Anti-patterns détectés

| Anti-pattern | Description | La porte le détecte via |
|---|---|---|
| **ADR-INFLATION** | Plusieurs ADRs pour des re-déclarations de baseline | Q1 |
| **NON-DECISION** | ADR pour un choix sans alternatives | Q5 |
| **BASELINE DRIFT** | Baseline du projet non reflétée dans les filtres ADR | Q1 + Q3 |
| **UNRAISED QUESTION** | ADR pour une question que personne n'a posée (G14) | Q4 |
| **GOOD-PRACTICE ADR** | ADR pour un cadrage « éviter X » ou « toujours Y » | Q2 |

### Ordre de chargement

`adr-eligibility-gate` → verdict par candidat → si `ELIGIBLE` → charger `architecture-decisions` pour le template et le cycle de vie.

## Pourquoi cette forme

Chaque choix structurel a un coût d'option : documenter une non-décision est un gaspillage ; omettre une vraie décision est une dérive. La porte pose la question « y a-t-il un compromis réel ? » avant toute rédaction, maintenant le jeu d'ADRs minimal et chaque enregistrement signifiant.

> « Leave as many options open as possible for as long as possible. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Customisation autorisée

- Références de baseline supplémentaires à vérifier en Q1 (ex. : ADRs spécifiques au projet ajoutés à la liste des éléments déjà appliqués) (L1)
- Forces supplémentaires à évaluer en Q5 au-delà des 5 Forces Universelles (L2)
- Recalibration des seuils Q1/Q3 en exécutant la porte sur les ADRs existants (L1)

## Voir aussi

- [architecture-decisions]({{ "/fr/reference/skills/architecture-decisions" | relative_url }}) — Template et cycle de vie des ADRs qui passent cette porte
- [architecture-patterns]({{ "/fr/reference/skills/architecture-patterns" | relative_url }}) — Catalogue de patterns consulté en Q3
- [architecture-review-criteria]({{ "/fr/reference/skills/architecture-review-criteria" | relative_url }}) — La gate G14 protège contre les ADRs pour questions non soulevées
- [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }}) — Agent qui exécute cette porte en phase DESIGN
