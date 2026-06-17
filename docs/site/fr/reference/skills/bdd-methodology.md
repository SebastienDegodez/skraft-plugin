---
layout: doc
lang: fr
title: "bdd-methodology"
description: "Use when writing, reviewing, or structuring BDD scenarios in Gherkin format. Covers Given/When/Then conventions, scen..."
persona: tech-lead
---

# bdd-methodology

> Traduire les critères d'acceptation en spécifications exécutables Gherkin — conventions Given/When/Then, patterns de scénarios, stratégie de tags et règle des 3 couches d'abstraction.

## Quand l'utiliser

- Avant tout authoring de scénarios Gherkin (phase DISTILL)
- Pour réviser ou restructurer des scénarios existants afin de les aligner sur le vocabulaire du domaine
- Pour choisir entre `Scenario`, `Scenario Outline`, `Background`, `And` et `But`

## Contrat d'entrée

- `ac-draft-{story}.md` — critères d'acceptation de la story
- Lexique du domaine (ubiquitous language du bounded context)
- Story INVEST avec persona, action et résultat observable identifiés

## Contrat de sortie

- Fichiers `*.feature` organisés par bounded context (`{bounded-context}-{feature}.feature`)
- Scénarios couvrant : happy path, conditions de frontière, violations de règles métier, cas d'erreur
- Matrice de traçabilité AC → scénario(s)

## Invariants

- **Règle fondamentale** : chaque mot d'un scénario Gherkin doit être compris par un expert du domaine qui n'a jamais vu de code
- **Une seule action par scénario** (`When` unique) — deux comportements = deux scénarios
- **Règle des 3 couches** : Layer 1 (Gherkin) = vocabulaire métier pur, zéro terme technique

| Layer | Propriétaire | Langage |
|-------|-------------|---------|
| Layer 1 — Gherkin | Métier | Vocabulaire du domaine pur. Zéro terme technique. |
| Layer 2 — Step methods | Ingénieur (test code) | Traduit les noms/verbes Gherkin en appels de cas d'utilisation |
| Layer 3 — Application | Ingénieur (code production) | Cas d'utilisation, repositories, objets du domaine |

**Anti-patterns à éviter :**

| Anti-pattern | Problème | Correction |
|---|---|---|
| `When I call POST /api/eligibility` | Détail HTTP | `When the driver requests an eligibility check` |
| `Given the database contains a record` | Infrastructure | `Given a driver with a complete profile` |
| `Then the repository returns null` | Implémentation | `Then no eligibility result is found` |
| Multiple `When` dans un scénario | Un seul déclencheur | Deux comportements = deux scénarios |

**Stratégie de tags :**

| Tag | Usage |
|---|---|
| `@{feature-name}` | Un par feature de bounded context (ex : `@eligibility`) |
| `@happy-path` | Scénario principal de succès |
| `@edge-case` | Valeurs limites, conditions de frontière |
| `@error-case` | Erreurs système, données manquantes, état invalide |
| `@smoke` | Ensemble minimal pour la validation walking skeleton (≤3 par feature) |

## Pourquoi cette forme

BDD est un outil de communication avant d'être un outil de test. Un scénario Gherkin lisible par un expert métier garantit que l'ingénieur implémente ce que le métier attend — pas ce que l'ingénieur a compris du ticket.

> « The goal of BDD is a shared understanding of the desired behaviour of software by both the business and engineering teams. »
> — North, D., *Introducing BDD*, 2006.

> « Scenarios are executable specifications that help teams define what software should do before building it. »
> — Adzic, G., *Specification by Example*, 2011.

## Customisation autorisée

- Nommage des fichiers feature (L1)
- Tags supplémentaires (L1)
- Ordre des scénarios dans une feature (L1)

## Voir aussi

- [acceptance-review-criteria]({{ "/fr/reference/skills/acceptance-review-criteria" | relative_url }}) — Gates G3 et G4 vérifient la pureté du vocabulaire Gherkin
- [acceptance-designer]({{ "/fr/reference/agents/acceptance-designer" | relative_url }}) — Agent qui produit les fichiers feature
- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Cycle TDD qui consomme les scénarios Gherkin
