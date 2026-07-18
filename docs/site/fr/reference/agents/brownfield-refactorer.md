---
layout: doc
lang: fr
title: "brownfield-refactorer"
description: "Pilote un refactor discipliné (Mikado ou Strangler Fig) d'un composant brownfield doté d'un filet de sécurité, filet vert à chaque commit. Workflow autonome."
persona: tech-lead
---

# brownfield-refactorer

> Choisit une stratégie avec l'humain — Mikado (restructuration sur place) ou Strangler Fig (remplacement incrémental derrière une façade) — puis pilote le travail feuille par feuille ou tranche par tranche, filet de sécurité vert à chaque commit.

## Quand l'utiliser

- Refactorer ou remplacer une partie d'un codebase brownfield disposant déjà d'un filet de sécurité (tests de caractérisation/contrat)
- « restructure/extract/decouple/change the ORM » → recommande Mikado
- « replace/rewrite/migrate » → recommande Strangler Fig
- Workflow autonome — invoqué directement, pas une phase de l'orchestrateur

## Contrat d'entrée

- Un objectif énoncé (quoi modifier, ou quoi remplacer)
- Confirmation qu'un filet de sécurité existe déjà pour la cible

## Contrat de sortie

- Artefact de plan persistant : `mikado-<slug>.md` ou `strangler-<slug>.md`
- Une séquence de commits verts (un par feuille/tranche terminée)

## Invariants

- **Jamais choisir la stratégie à la place de l'humain** — recommander, puis laisser confirmer (B10)
- **Jamais sauter la vérification du filet** — sinon rediriger vers `brownfield-harness-builder`
- **Jamais laisser un worker sauter sa discipline de revert/rollback** — critères d'acceptation verbatim dans chaque packet
- **Jamais accumuler feuilles/tranches dans une session** — un spawn `refactoring-worker` frais par item (isolation de contexte)

## Pourquoi cette forme

Le refactorer ne fait jamais le refactor d'un seul coup : il maintient l'unique artefact qui survit au travail (le graphe ou le plan de tranches), le recharge (B4) avant chaque dispatch, et vérifie que le filet reste vert.

> « Refactoring (verb): to restructure software by applying a series of refactorings without changing its observable behavior. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

La boucle lit le signal terminal du worker : `ADVANCE` (item fait, continuer), `EXPAND` (nouveaux items enregistrés, continuer), `DONE` (objectif atteint), `BLOCKED` (checkpoint humain).

## Customisation autorisée

- Seuils de recommandation de stratégie (couplage fort → Strangler pour contenir le rayon d'explosion)
- Granularité des tranches (défaut : une par endpoint)

## Voir aussi

- [mikado-method]({{ "/fr/reference/skills/mikado-method" | relative_url }}) — Stratégie de restructuration sur place
- [strangler-fig-method]({{ "/fr/reference/skills/strangler-fig-method" | relative_url }}) — Stratégie de remplacement incrémental
- [refactoring-worker]({{ "/fr/reference/workers/refactoring-worker" | relative_url }}) — Worker interne dispatché par cet agent, un item par spawn
- [brownfield-harness-builder]({{ "/fr/reference/agents/brownfield-harness-builder" | relative_url }}) — Précondition : construit le filet de sécurité
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
