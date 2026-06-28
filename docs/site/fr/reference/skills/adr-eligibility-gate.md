---
layout: doc
lang: fr
title: "adr-eligibility-gate"
description: "Use BEFORE drafting any ADR when a story enters DESIGN phase. Runs a baseline-vs-decision gate: determines whether a..."
persona: tech-lead
---

# adr-eligibility-gate

> Une porte de pré-rédaction qui exécute un contrôle **baseline-vs-decision** sur chaque choix architectural candidat — empêchant la surproduction d'ADRs en filtrant les non-décisions avant l'écriture de tout brouillon.

## Quand l'utiliser

- La phase DESIGN commence pour une story et l'architecte envisage de documenter un choix
- Un relecteur signale `ADR-INFLATION` (plusieurs ADRs pour une story où 0–1 est attendu)
- L'utilisateur demande « faut-il écrire un ADR pour X ? », « combien d'ADRs cette story nécessite-t-elle ? » ou « ce choix mérite-t-il un ADR ? »
- « disambiguate baseline from decision » est demandé

## Contrat d'entrée

- Un choix architectural candidat (formulé comme question ou décision proposée)
- Accès à la baseline de skills du projet (`architecture-decisions`, `architecture-patterns`, `clean-architecture-*`)
- Le contexte de la story ou du batch en cours (ACs, modèle d'événements, contraintes techniques)

## Contrat de sortie

Pour chaque candidat, un verdict dans le format de sortie standard :

```
Candidate: <description courte>
Verdict: ELIGIBLE | NOT ELIGIBLE
Reason: <citation en 1 ligne vers Q1–Q5 + section skill/ADR>
```

## Invariants

La porte exécute la **Checklist des 5 questions** dans l'ordre ; la **première réponse `YES` détermine le verdict** :

| Question | Si YES → verdict |
|---|---|
| **Q1** — Ce choix est-il déjà imposé par un skill projet ou un test d'architecture ? | `NOT ELIGIBLE — <cite skill/ADR>` |
| **Q2** — Ce choix est-il formulé comme « bonne pratique » ou « éviter un antipattern » ? | `NOT ELIGIBLE — baseline good practice / antipattern avoidance` |
| **Q3** — Le choix ajoute-t-il une complexité au-delà de la baseline projet ? | passer à Q4 (si YES) |
| **Q4** — La question a-t-elle été soulevée par une story, un AC ou une contrainte mesurable ? | `NOT ELIGIBLE — unraised question; non-decision artefact (G14)` (si NO) |
| **Q5** — Le choix présente-t-il de véritables compromis (et non uniquement des avantages) ? | `NOT ELIGIBLE — no genuine trade-offs; should be baseline` (si NO) |

Seul un choix qui franchit **les cinq questions** est `ELIGIBLE`.

**Anti-patterns détectés :**

| Anti-pattern | Description | Capturé via |
|---|---|---|
| **ADR-INFLATION** | Plusieurs ADRs pour des re-déclarations de baseline | Q1 |
| **NON-DECISION** | ADR pour un choix sans alternatives | Q5 |
| **BASELINE DRIFT** | Baseline projet non reflétée dans les filtres ADR | Q1 + Q3 |
| **UNRAISED QUESTION** | ADR pour une question que personne n'a posée (G14) | Q4 |
| **GOOD-PRACTICE ADR** | ADR pour un « éviter X » ou « toujours Y » | Q2 |

## Pourquoi cette forme

Sans porte de pré-rédaction, les équipes rédigent des ADRs pour des choses qu'elles n'allaient jamais débattre — conventions de la baseline, bonnes pratiques, questions non soulevées. Le coût ne se limite pas à l'effort gaspillé : l'ADR-INFLATION dilue le signal des décisions qui comptent, rendant la mémoire institutionnelle plus difficile à parcourir.

> « Every pattern has a context, a problem, and a solution. Without the context, a pattern is a hammer looking for nails. »
> — Evans, E., *Domain-Driven Design*, 2003.

## Customisation autorisée

- Liste de la baseline Q1 (étendre au fur et à mesure des nouveaux skills projet) (L1)
- Liste des patterns à complexité ajoutée pour Q3 (L1)
- Verbosité du format de sortie (L2)

## Voir aussi

- [architecture-decisions]({{ "/fr/reference/skills/architecture-decisions" | relative_url }}) — Fournit le COMMENT rédiger le corps de l'ADR une fois la porte franchie
- [architecture-patterns]({{ "/fr/reference/skills/architecture-patterns" | relative_url }}) — Consulté par Q3 pour évaluer les ajouts de complexité
- [architecture-review-criteria]({{ "/fr/reference/skills/architecture-review-criteria" | relative_url }}) — La gate G14 (artefact non-décision) est capturée par Q4
