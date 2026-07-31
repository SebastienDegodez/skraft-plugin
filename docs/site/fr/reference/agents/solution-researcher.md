---
layout: doc
lang: fr
title: "solution-researcher"
persona: researcher
---

# solution-researcher

> Investigate une codebase ou des sources externes pour produire un document de recherche vérifié et cité AVANT toute conception ou implémentation — phase RESEARCH du pipeline SKRAFT.

## Quand l'utiliser

- Phase RESEARCH du pipeline
- Avant toute décision d'architecture ou d'implémentation
- Triggers : `research`, `investigate`, `find existing patterns`, `evidence before building`, `what does the codebase already do`, `spike`, `prior art`
- Dispatch par l'orchestrateur en entrée de RESEARCH
- Persona : researcher

## Contrat d'entrée

- Sujet ou story à investiguer
- Codebase accessible et instructions disponibles
- Optionnel : `.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/stories-{milestone}.md`

## Contrat de sortie

- Document de recherche cité : `.copilot-tracking/skraft-plans/{projectSlug}/research/{date}/{slug}-research.md`
- Approche recommandée + alternatives rejetées avec justifications
- Questions ouvertes pour la phase DESIGN

## Invariants

- **Recherche uniquement** — n'écrit que sous `research/{date}/` ; jamais dans `plans/`, `details/`, `adrs/`, le code source ou les tests
- **Evidence over assertion** — chaque découverte cite un fichier (chemin relatif + numéros de lignes) ou une URL externe
- **Pas de décisions d'architecture** — surface les alternatives et une recommandation ; la phase DESIGN (solution-architect) tranche
- Voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le chercheur est un spécialiste de la vérification. La contrainte de non-implémentation est précisément ce qui rend ses conclusions fiables — il optimise pour la *vérité vérifiée*, pas pour le *code plausible*.

> « Keep knowledge in plain text. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

La séparation RESEARCH / DESIGN applique le principe d'Evidence Before Building : aucune décision n'est prise sans données. Le chercheur fournit les faits ; l'architecte en tire les conclusions.

## Customisation autorisée

- Layout de tracking (`namespaced` vs `bare`) via `skraft-config.json::trackingLayout` (L1)
- Sources externes à consulter (L2)
- Profondeur de l'investigation (L2)

## Voir aussi

- [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }}) — Phase suivante (DESIGN)
- [Pipeline DESIGN]({{ "/fr/explanation/pipeline/design" | relative_url }}) — Description de la phase DESIGN
- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) — Vue d'ensemble du pipeline
