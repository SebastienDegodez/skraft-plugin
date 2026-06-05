---
layout: doc
lang: fr
title: "backlog-discoverer"
persona: tech-lead
---

# backlog-discoverer

> Découvre et trie les issues GitHub pour alimenter le pipeline avec des éléments de travail priorisés.

## Quand l'utiliser

- Phase DISCOVER du pipeline
- Lorsqu'un utilisateur assigne une issue ou un milestone
- Trigger automatique via l'orchestrateur

## Contrat d'entrée

- Issue GitHub assignée ou identifiant de milestone
- Accès au repository GitHub (labels, issues, historique)

## Contrat de sortie

- Rapport de triage avec labels, priorité et estimation d'effort
- Artefact écrit dans le répertoire de tracking du pipeline

## Invariants

- **Scope unitaire** — Traite une seule issue à la fois, jamais de batch
- **Triage basé sur les preuves** — Chaque décision (label, priorité, effort) s'appuie sur des données observables
- Voir [Customisation]({{ "/fr/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le discoverer applique des critères de revue explicites pour chaque décision de triage. Pas de classification subjective : chaque label, chaque niveau de priorité est défendu par des preuves tirées de l'issue et du contexte du projet.

> « Define explicit review criteria before the review begins. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Le scope unitaire (une issue = un cycle) empêche le batching qui dilue l'attention et produit des triages superficiels.

> « The best XP teams treat scope, time, cost, and quality as variables to be consciously managed. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

## Customisation autorisée

- Critères de priorité et taxonomie de labels (L1)
- Profondeur d'analyse (rapide vs approfondi) (L2)
- Template du rapport de triage (L1)

## Voir aussi

- [backlog-discoverer-reviewer]({{ "/fr/reference/agents/backlog-discoverer-reviewer" | relative_url }}) — Revue des artefacts DISCOVER
- [Pipeline DISCOVER]({{ "/fr/pipeline/discover" | relative_url }}) — Description de la phase
- [backlog-planner]({{ "/fr/reference/agents/backlog-planner" | relative_url }}) — Phase suivante (DISCUSS)
