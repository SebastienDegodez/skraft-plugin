---
layout: doc
lang: fr
title: "brownfield-analyst"
description: "Rétro-ingénierie d'un codebase existant en PRD au format HVE. Workflow autonome invoqué par l'humain, découplé de l'orchestrateur."
persona: tech-lead
---

# brownfield-analyst

> Transforme un codebase existant et non documenté en PRD au format HVE que d'autres agents transforment en issues et user stories — workflow autonome, pas une phase du pipeline.

## Quand l'utiliser

- L'humain veut analyser un codebase brownfield/legacy sans docs ni backlog
- Amorcer ou rétro-ingénierer un PRD à partir du code existant
- Documenter un système legacy avant de le confier aux agents HVE
- Workflow autonome — invoqué directement, découplé de l'orchestrateur DISCOVER→DELIVER

## Contrat d'entrée

- Chemin du repository (requis)
- Préférence de profondeur (`quick` / `deep` / `exhaustive` ; défaut `deep`)
- Répertoires cibles (optionnel), nom du produit (optionnel — demandé sinon)

## Contrat de sortie

- Artefacts de caractérisation confidence-scored sous `characterization/{YYYY-MM-DD}/`
- PRD au format HVE : `docs/prds/<kebab-case-name>.md`
- Fichier d'état PRD : `prd-sessions/<name>.state.json`

## Invariants

- **Jamais d'issues ni de user stories** — c'est le rôle des agents HVE qui consomment le PRD
- **Jamais de modification de code** — analyse et traçabilité entièrement en lecture seule
- **Jamais de confiance fabriquée** — chaque claim est un FACT vérifié par outil ou une INFERENCE taggée (High/Medium/Low)
- **Jamais sauter le confidence gate** — verdict CONCERNS/FAIL → checkpoint humain (B10) avant de composer le PRD

## Pourquoi cette forme

L'analyste sépare la caractérisation (comprendre le code tel qu'il est) de la composition du PRD, et refuse la certitude fabriquée : un « unknown » honnête vaut mieux qu'un fait inventé.

> « Legacy code is simply code without tests. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Customisation autorisée

- Profondeur du scan (`quick` / `deep` / `exhaustive`)
- Répertoires cibles pour restreindre les scans deep/exhaustive
- Nom du produit (nom de fichier du PRD)

## Voir aussi

- [characterize-brownfield]({{ "/fr/reference/skills/characterize-brownfield" | relative_url }}) — Skill de caractérisation exécuté en phase 1
- [compose-brownfield-prd]({{ "/fr/reference/skills/compose-brownfield-prd" | relative_url }}) — Skill qui compose le PRD depuis la caractérisation
- [brownfield-harness-builder]({{ "/fr/reference/agents/brownfield-harness-builder" | relative_url }}) — Workflow frère : filet de sécurité avant refactor
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
