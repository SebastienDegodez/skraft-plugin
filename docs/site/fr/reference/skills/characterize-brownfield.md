---
layout: doc
lang: fr
title: "characterize-brownfield"
description: "Rétro-ingénierie d'un codebase en artefacts confidence-scored : stack, features, intégrations, contrats, traçabilité de couverture, dette technique."
persona: tech-lead
---

# characterize-brownfield

> Rétro-ingénierie d'un codebase en artefacts structurés confidence-scored — chaque claim est un FACT (appel outil) ou une INFERENCE taggée High/Medium/Low. L'honnêteté sur la confiance est le but.

## Quand l'utiliser

- Avant de composer un PRD, ou en autonome pour comprendre un système legacy sans docs
- « caractérise ce codebase », « que fait ce système », « cartographie l'architecture », « trouve les contrats existants », « évalue la dette »
- Chargé par [brownfield-analyst]({{ "/fr/reference/agents/brownfield-analyst" | relative_url }}) en phase 1

## Contrat d'entrée

- Chemin du repository (requis)
- Profondeur : `quick` (2-5 min) / `deep` (10-30 min, défaut) / `exhaustive` (30-120 min, opt-in)
- Répertoires cibles (optionnel)

## Contrat de sortie

- Artefacts sous `characterization/{YYYY-MM-DD}/` : `index.md`, `structure.md`, `features.md`, `integration.md`, `contracts.md`, `coverage.md`, `tech-debt.md`
- Verdict du confidence gate (PASS/CONCERNS/FAIL) dans `index.md`

## Invariants

- **Lecture seule** — ne modifie jamais le code, n'écrit pas de PRD, ne crée pas d'issues
- **FACT vs INFERENCE** — tout claim FACT vient d'un appel outil (S7), jamais du recall ; chaque inférence porte sa confiance inline
- **Traçabilité de couverture** — FULL (assertion directe) / PARTIAL (indirecte) / NONE ; jamais FULL sans lire une assertion réelle
- **Confidence gate (S4)** — CONCERNS/FAIL → checklist de validation explicite à l'humain

## Pourquoi cette forme

La caractérisation classe chaque feature Core/Secondary/Legacy-unused et chaque couverture FULL/PARTIAL/NONE, avec un oracle synthétique (confiance Low) quand aucun test n'existe — un blanc n'est jamais acceptable, mais une certitude inventée non plus.

> « Code without tests is bad code. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Customisation autorisée

- Profondeur du scan (`quick` / `deep` / `exhaustive`)
- Facettes opt-in : découverte de contrats, traçabilité de couverture
- Répertoires cibles pour restreindre les scans deep/exhaustive

## Voir aussi

- [compose-brownfield-prd]({{ "/fr/reference/skills/compose-brownfield-prd" | relative_url }}) — Consomme ces artefacts pour composer le PRD
- [brownfield-analyst]({{ "/fr/reference/agents/brownfield-analyst" | relative_url }}) — Agent qui charge ce skill
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
