---
layout: doc
lang: fr
title: "Référence — Agents"
description: "Tous les agents du pipeline SKRAFT : rôle, phase, reviewer."
---

# Référence — Agents

> Chaque phase a un agent producteur et un reviewer indépendant. Le reviewer ne
> modifie jamais le travail : il émet un verdict avant la transition de phase.

| Phase | Agent producteur | Reviewer |
| --- | --- | --- |
| DISCOVER | [backlog-discoverer](backlog-discoverer.html) | [backlog-discoverer-reviewer](backlog-discoverer-reviewer.html) |
| DISCUSS  | [backlog-planner](backlog-planner.html) | [backlog-planner-reviewer](backlog-planner-reviewer.html) |
| DESIGN   | [solution-architect](solution-architect.html) | [solution-architect-reviewer](solution-architect-reviewer.html) |
| DISTILL  | [acceptance-designer](acceptance-designer.html) | [acceptance-designer-reviewer](acceptance-designer-reviewer.html) |
| DELIVER  | [software-engineer](software-engineer.html) | [software-engineer-reviewer](software-engineer-reviewer.html) |
| (méta)   | [skraft-orchestrator](skraft-orchestrator.html) | — |

L'orchestrateur est l'**entrée unique** : il lit l'état, dispatche l'agent de la
phase courante, déclenche le reviewer, applique le verdict (et les reprises), puis
passe à la phase suivante.

## Voir aussi

- [Les gates franchies par phase](../../catalogue/gates.html)
- [Les lentilles de revue adverse](../../catalogue/lens.html)
- [Le pipeline, vue d'ensemble](../../pipeline/)
