---
layout: doc
lang: fr
title: "compose-brownfield-prd"
description: "Compose un PRD au format HVE (17 sections) à partir des artefacts de caractérisation, avec IDs FR/NFR et traçabilité complète."
persona: tech-lead
---

# compose-brownfield-prd

> Mappe la sortie de `characterize-brownfield` vers un PRD au format HVE exact (17 sections) que les agents HVE consomment directement — jamais de re-scan du repo, jamais d'issue.

## Quand l'utiliser

- Après la caractérisation, pour produire le PRD au format HVE
- Chargé en interne par [brownfield-analyst]({{ "/fr/reference/agents/brownfield-analyst" | relative_url }}) (`disable-model-invocation`), ou directement si les artefacts existent déjà
- « écris le PRD », « compose le PRD depuis la caractérisation »

## Contrat d'entrée

- Chemin des artefacts de caractérisation (`index.md` + siblings)
- Nom du produit (nom de fichier kebab-case)
- Objectifs de modernisation (optionnel)

## Contrat de sortie

- `docs/prds/<kebab-case-name>.md` — 17 sections, IDs `FR-001`/`NFR-001`, marqueurs, sans frontmatter YAML
- Fichier d'état : `prd-sessions/<name>.state.json` (`currentPhase: brownfield-extraction`)

## Invariants

- **Recharge les artefacts (B4)** — ne re-scanne jamais le repo, ne s'appuie pas sur le recall de l'agent
- **Traçabilité** — chaque `FR` pointe vers un Goal ID de la Section 1
- **Jamais fabriquer un PASS** — NFR sans preuve mesurée → défaut CONCERNS (shape Status/Threshold/Actual/Evidence)
- **Schema gate (S4)** — 17 en-têtes dans l'ordre, IDs uniques, pas de frontmatter YAML, marqueurs présents
- Chaque claim Low-confidence et chaque feature Core à couverture NONE → une ligne S14 Open Questions

## Pourquoi cette forme

Le PRD applique une porte de schéma explicite avant écriture — 17 sections ordonnées, IDs uniques, chaque `FR` tracé vers un objectif — pour que les agents HVE le consomment sans ambiguïté.

> « Define explicit review criteria before the review begins. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Customisation autorisée

- Objectifs de modernisation pliés dans la Section 1 (sinon dérivés des signaux `tech-debt.md`)
- Sections conditionnelles (Data & Analytics, Rollout) selon les signaux de caractérisation

## Voir aussi

- [characterize-brownfield]({{ "/fr/reference/skills/characterize-brownfield" | relative_url }}) — Produit les artefacts consommés ici
- [brownfield-analyst]({{ "/fr/reference/agents/brownfield-analyst" | relative_url }}) — Agent qui enchaîne caractérisation → composition
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
