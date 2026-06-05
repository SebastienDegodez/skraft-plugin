---
layout: doc
lang: fr
title: "Traces & auditabilité"
description: "L'arborescence datée des artefacts SKRAFT : ce que chaque phase dépose, où, et pourquoi le pipeline est auditable."
---

# Traces & auditabilité

> Chaque phase laisse une trace écrite, datée et immuable. À la fin, le pipeline n'est
> pas une boîte noire : on peut rejouer chaque décision à partir des fichiers déposés.

## Pourquoi tracer

Un pipeline qui ne laisse que du code final est impossible à auditer : on ne sait pas
*pourquoi* une décision a été prise, ni *qui* l'a validée. En déposant chaque artefact
au fil des phases, SKRAFT rend le raisonnement vérifiable — pour la revue humaine, pour
la conformité, et pour la reprise après interruption.

## L'arborescence datée

Tout vit sous `.copilot-tracking/skraft-plans/{project-slug}/`. Chaque phase écrit dans
un sous-dossier dédié, horodaté au format `YYYY-MM-DD`.

| Phase | Artefact | Chemin |
| --- | --- | --- |
| DISCOVER | Notes de triage, proposition de sprint | `research/{date}/{slug}-research.md` |
| DISCUSS | User stories, critères d'acceptation | `plans/{date}/{slug}-plan.instructions.md` |
| DESIGN | Architecture Decision Records | `adrs/ADR-{NNN}-{slug}.md` |
| DESIGN | Registre de supersession (append-only) | `adrs/supersessions.md` |
| DESIGN | Contrats de composants | `details/{date}/{slug}-contracts.md` |
| DISTILL | Détails d'implémentation, plan de tests | `details/{date}/{slug}-details.md` |
| DISTILL | Scénarios Gherkin exécutables | `features/{slug}.feature` |
| DELIVER | Journal des changements | `changes/{date}/{slug}-changes.md` |
| Revues (toutes phases) | Verdict et findings du reviewer | `reviews/{date}/{phase}-{slug}-review.md` |

Les reviewers écrivent **exclusivement** sous `reviews/{date}/` — ils ne modifient
jamais un artefact amont.

## Append-only : pourquoi on n'écrase jamais

Les dossiers `research/`, `plans/`, `adrs/`, `details/`, `changes/`, `reviews/`,
`blockers/` sont **append-only**. Pour réviser une décision, on écrit un *nouveau*
fichier daté — jamais une modification du précédent. Deux conséquences :

- **Supersession d'ADR** : l'ADR remplacé n'est pas édité ; le nouvel ADR porte une
  ligne `**Supersedes:** ADR-MMM` et une ligne est *ajoutée* au registre
  `adrs/supersessions.md`.
- **Résolution de blocker** : on n'inverse pas le frontmatter du blocker ; on dépose un
  fichier frère `…-resolution.md`. La présence du frère = résolu.

La récupération d'état et l'audit dépendent de cet invariant : l'historique ne ment
jamais.

## Auditabilité

> « Specification by Example creates a single source of truth that documents what the system does. »
> — Adzic, G., *Specification by Example*, 2011.

Les `features/*.feature` jouent ce rôle de source de vérité vivante ; combinés aux ADRs
et aux verdicts, ils rendent chaque comportement traçable jusqu'à sa justification.

## Voir aussi

- [Le substrat HVE-Core](hve-core.html)
- [Le pipeline, vue d'ensemble](pipeline/)
- [Les gates de revue](catalogue/gates.html)
