---
layout: doc
lang: fr
title: "Référence — Agents"
description: "Tous les agents du pipeline SKRAFT : rôle, phase, reviewer."
---

# Référence — Agents

> Chaque phase a un agent producteur et un reviewer indépendant. Le reviewer ne
> modifie jamais le travail : il émet un verdict avant la transition de phase.

| Ordre d'usage | Phase | Agent producteur | Reviewer |
| --- | --- | --- | --- |
| 0 | (méta) | [skraft-orchestrator](skraft-orchestrator.html) | — |
| 1 | DISCOVER | [backlog-discoverer](backlog-discoverer.html) | [backlog-discoverer-reviewer](backlog-discoverer-reviewer.html) |
| 2 | DISCUSS  | [backlog-planner](backlog-planner.html) | [backlog-planner-reviewer](backlog-planner-reviewer.html) |
| 3 | RESEARCH | [solution-researcher](solution-researcher.html) | — |
| 4 | DESIGN   | [solution-architect](solution-architect.html) | [solution-architect-reviewer](solution-architect-reviewer.html) |
| 5 | DISTILL  | [acceptance-designer](acceptance-designer.html) | [acceptance-designer-reviewer](acceptance-designer-reviewer.html) |
| 6 | DELIVER  | [software-engineer](software-engineer.html) | [software-engineer-reviewer](software-engineer-reviewer.html) |

L'orchestrateur est l'**entrée unique** : il lit l'état, dispatche l'agent de la
phase courante, déclenche le reviewer, applique le verdict (et les reprises), puis
passe à la phase suivante.

## Workers internes de test (phase DELIVER)

En DELIVER, le `software-engineer` délègue le **câblage des tests** à des sous-agents
internes (`user-invocable: false` — non invocables directement). Chaque worker produit
uniquement le wiring de test ; le cycle TDD métier reste chez le `software-engineer`,
qui vérifie le worker en TIER-1 (RED → GREEN). Une lentille de fidélité conditionnelle
rejoint le panel de revue adverse quand la capacité est active.

| Capacité | Worker | Lentille de fidélité |
| --- | --- | --- |
| Mocking (consommateur) | mock-integration-worker | mock-fidelity-lens |
| Contrat (fournisseur) | contract-testing-worker | contract-fidelity-lens |

## Voir aussi

- [Les gates franchies par phase]({{ "/fr/reference/gates" | relative_url }})
- [Les lentilles de revue adverse]({{ "/fr/reference/lens" | relative_url }})
- [Le pipeline, vue d'ensemble]({{ "/fr/explanation/pipeline/" | relative_url }})
