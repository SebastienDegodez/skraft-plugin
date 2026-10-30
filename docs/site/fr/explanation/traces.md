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

Tout vit sous `.copilot-tracking/skraft-plans/{slug}/`, dans la copie de travail qui lance le
run. Les documents d'une phase vont dans un sous-dossier daté au format `YYYY-MM-DD` ; le moteur
donne à l'agent le chemin de chaque sortie attendue, et la pré-crée quand elle a un gabarit.

| Phase | Artefact | Chemin |
| --- | --- | --- |
| DISCOVER (skraft-backlog) | Rapport de triage, proposition de sprint | `research/{date}/triage-{date}.md`, `research/{date}/sprint-proposal.md` |
| DISCUSS (skraft-backlog) | Stories, brouillons de critères d'acceptation | `plans/{date}/stories-{milestone}.md`, `plans/{date}/ac-draft-{story}.md` |
| RESEARCH | Document de recherche | `research/{date}/{slug}-research.md` |
| DESIGN | Context map, puis event model, diagrammes, contrats et matrice de cohérence à côté | `details/{date}/context-map.md`, `details/{date}/consistency-matrix-{story}.md`… |
| DESIGN | Architecture Decision Records (dans le dépôt, hors du dossier de suivi) | `docs/adr/adr-{nnn}-{sujet}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| DISTILL | Plan de tests | `details/{date}/test-plan-{slug}.md` |
| DISTILL | Scénarios Gherkin exécutables | `features/{contexte}-{feature}.feature` |
| DELIVER | Journal des changements | `changes/{date}/change-log.md` |
| DELIVER | Preuve de chaque gate | `gates/{composant}/{gate}-{n}.log` |
| PUBLISH | Prose et description de la pull request | `details/{date}/pull-request-prose-{slug}.md`, `pull-request.md` |
| Revues DESIGN, DISTILL, DELIVER | Entrées des lentilles et verdict écrit par le moteur | `reviews/{nœud}-{visite}/verdict.yaml` |
| Tout le run | Journal chaîné, rapports recalculés après chaque étape | `events.jsonl`, `run-report.md`, `qa-report.md`, `WORKFLOW.md` |

Les lentilles n'écrivent aucun fichier : elles rendent des findings, et c'est le moteur qui
écrit `reviews/{nœud}-{visite}/verdict.yaml`. Le détail de chaque fichier est dans la
[référence du dossier de suivi]({{ "/fr/reference/run-journal" | relative_url }}).

## Ce qui ne s'écrase jamais

Le journal `events.jsonl` ne fait que grandir : chaque ligne porte l'empreinte de la
précédente, et une ligne modifiée casse la chaîne, ce que le moteur voit à la lecture suivante.
L'état du run se recalcule depuis ce journal ; aucun fichier d'état n'est réécrit.

Pour les ADR, la règle dépend de leur publication :

- **ADR pas encore sur la branche de base** : il se corrige sur place, reste `Proposed`, et
  le moteur refuse un historique de brouillons (git le garde déjà).
- **ADR publié** : il n'est pas édité ; le nouvel ADR porte une ligne
  `**Supersedes:** ADR-MMM` et une ligne est *ajoutée* au registre
  `docs/adr/supersessions.md`. Le moteur vérifie ce registre à la fin de DESIGN.

La reprise et l'audit dépendent de ces invariants : l'historique ne ment jamais.

## Auditabilité

> « Specification by Example creates a single source of truth that documents what the system does. »
> — Adzic, G., *Specification by Example*, 2011.

Les `features/*.feature` jouent ce rôle de source de vérité vivante ; combinés aux ADRs
et aux verdicts, ils rendent chaque comportement traçable jusqu'à sa justification.

## Voir aussi

- [État et reprise]({{ "/fr/explanation/hve-core" | relative_url }})
- [Le pipeline, vue d'ensemble]({{ "/fr/explanation/pipeline/" | relative_url }})
- [Les gates de revue]({{ "/fr/reference/gates" | relative_url }})
