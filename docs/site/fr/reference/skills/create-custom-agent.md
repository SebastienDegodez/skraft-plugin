---
layout: doc
lang: fr
title: "create-custom-agent"
persona: tech-lead
---

# create-custom-agent

> Scaffolde des fichiers d'agents VS Code (`.agent.md`) avec la structure, les outils et les handoffs appropriés.

## Quand l'utiliser

- Lors de la création d'un nouvel agent personnalisé
- Pour configurer les workflows inter-agents (handoffs)
- Pour définir les restrictions d'outils d'un agent

## Contrat d'entrée

- Description du rôle et de la responsabilité de l'agent
- Liste des outils nécessaires
- Relations avec d'autres agents (handoffs)

## Contrat de sortie

- Fichier `.agent.md` avec frontmatter YAML valide
- Configuration des outils, instructions et handoffs
- Documentation inline du comportement attendu

## Invariants

- **Un fichier = un agent** — Chaque agent est autonome dans un seul fichier
- **Frontmatter valide** — Le YAML frontmatter suit le schéma VS Code
- Voir [Customisation](/fr/customisation) pour la liste complète

## Pourquoi cette forme

Chaque agent est un fichier texte autonome, composable et remplaçable. Ce principe vient directement de la philosophie pragmatique : séparer les préoccupations en pièces de texte indépendantes.

> « Keep knowledge in plain text. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

Un agent bien défini a une responsabilité claire, des entrées/sorties explicites et des contraintes documentées — exactement comme un Use Case.

> « A use case captures a contract between the stakeholders of a system about its behavior. »
> — Cockburn, A., *Writing Effective Use Cases*, 2001.

## Customisation autorisée

- Template de fichier agent (L1)
- Liste d'outils par défaut (L2)
- Conventions de nommage (L1)

## Voir aussi

- [skraft-orchestrator](/fr/reference/agents/skraft-orchestrator) — Exemple d'agent orchestrateur
- [Customisation](/fr/customisation) — Niveaux de customisation
- [Architecture](/fr/architecture) — Vue d'ensemble du système d'agents
