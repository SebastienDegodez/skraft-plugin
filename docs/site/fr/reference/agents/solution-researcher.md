---
layout: doc
lang: fr
title: "solution-researcher"
persona: tech-lead
---

# solution-researcher

> Investigate la base de code et des sources externes pour produire un document de recherche vérifié et cité AVANT toute conception ou écriture de code.

## Quand l'utiliser

- Phase RESEARCH du pipeline (première phase dispatchée par l'orchestrateur)
- Avant toute décision architecturale ou rédaction d'ADR
- Trigger : dispatch par l'orchestrateur, ou directement sur 'research', 'investigate', 'spike', 'prior art', 'evidence before building'

## Contrat d'entrée

- Story affinée et approuvée (DISCUSS validé), ou un sujet à investiguer
- Base de code et fichiers d'instructions existants (`.github/copilot-instructions.md`, instructions pertinentes)
- Optionnel : recherches antérieures déjà présentes sous `.copilot-tracking/skraft-plans/{projectSlug}/research/`

## Contrat de sortie

- Un document de recherche : `.copilot-tracking/skraft-plans/{projectSlug}/research/{date}/{slug}-research.md`
- Le document inclut : périmètre, hypothèses, approches évaluées, UNE approche recommandée avec preuves, surface de handoff pour DESIGN

## Invariants

- **Recherche uniquement** — écrit exclusivement dans `research/{date}/` ; jamais dans `plans/`, `adrs/`, le code source, ni les tests
- **Preuves avant affirmations** — chaque découverte cite un chemin de fichier relatif au workspace avec plage de lignes, ou une URL externe
- **Pas de conception, pas de décisions de record** — expose des alternatives et une approche recommandée ; la phase DESIGN détient les ADRs
- Voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le researcher produit de la vérité, pas du code plausible. Sa contrainte — ne jamais implémenter — est ce qui rend ses découvertes fiables. Une équipe qui saute la phase d'investigation le paie pendant DESIGN : l'architecte décide dans l'incertitude, l'ingénieur découvre la surprise en plein sprint.

> « Prototype to learn. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

Réunir des preuves avant de s'engager sur une approche repousse la décision au dernier moment responsable, là où l'information est la plus riche.

> « We should minimize the cost of decisions by making them at the last responsible moment, when we have the most information. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

## Customisation autorisée

- Mise en forme du document de recherche (L1)
- Layout de tracking (`namespaced` vs `bare`) via `skraft-config.json::trackingLayout` (L1)
- Profondeur d'investigation (nombre d'approches évaluées) (L2)

## Voir aussi

- [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }}) — Phase DESIGN (consomme cette recherche)
- [Pipeline DESIGN]({{ "/fr/explanation/pipeline/design" | relative_url }}) — Description de la phase
- [skraft-orchestrator]({{ "/fr/reference/agents/skraft-orchestrator" | relative_url }}) — Dispatche cet agent
- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) — Vue d'ensemble du pipeline
