---
layout: doc
lang: fr
title: "Référence — Skills"
description: "Les skills SKRAFT : pratiques outillées, ce qu'elles font, quand les utiliser."
---

# Référence — Skills

> Une *skill* est une pratique outillée : une procédure testée qu'un agent charge
> au moment où il en a besoin. Chaque skill répond à un problème précis du craft.

## Ordre d'usage — séparation par agent

### 0) Entrée unique — [skraft-orchestrator]({{ "/fr/reference/agents/skraft-orchestrator" | relative_url }})

- **[skraft-difficulty-routing](skraft-difficulty-routing.html)** — routing 2-axes (entry point, difficulty tier).
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — synthèse multi-lentilles pour verdict adverse.
- **[contract-testing](contract-testing.html)** — capacité contrat API cross-phase (DESIGN → DISTILL → DELIVER).
- **[playwright-evidence](playwright-evidence.html)** — capture des preuves E2E en fin de pipeline.

### 1) RESEARCH — [solution-researcher]({{ "/fr/reference/agents/solution-researcher" | relative_url }})

Aucune skill additionnelle — s'appuie sur les outils natifs (`read`, `search/codebase`, `graphify/*`) pour investiguer la base de code et les sources externes et produire le document de recherche cité.

### 2) DISCOVER — [backlog-discoverer]({{ "/fr/reference/agents/backlog-discoverer" | relative_url }})

- **[github-search-protocol](github-search-protocol.html)** — requêtes GitHub Search, pagination, filtres.
- **[issue-triage](issue-triage.html)** — labels, priorité, effort, doublons, proposition de sprint.

### 3) DISCOVER review — [backlog-discoverer-reviewer]({{ "/fr/reference/agents/backlog-discoverer-reviewer" | relative_url }})

- **[discovery-review-criteria](discovery-review-criteria.html)** — gates G1-G6 pour artefacts DISCOVER.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — verdict adverse via panel de lentilles.

### 4) DISCUSS — [backlog-planner]({{ "/fr/reference/agents/backlog-planner" | relative_url }})

- **[issue-refinement](issue-refinement.html)** — transformation issue → story INVEST + AC.
- **[sprint-planning](sprint-planning.html)** — priorisation sprint, capacité, dépendances.

### 5) DISCUSS review — [backlog-planner-reviewer]({{ "/fr/reference/agents/backlog-planner-reviewer" | relative_url }})

- **[planning-review-criteria](planning-review-criteria.html)** — gates G1-G8 pour artefacts DISCUSS.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — verdict adverse via panel de lentilles.

### 6) DESIGN — [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }})

- **[architecture-patterns](architecture-patterns.html)** — Event Modeling, DDD stratégique/tactique, CQRS, Event Sourcing.
- **[architecture-decisions](architecture-decisions.html)** — ADR, alternatives, cycle de vie des décisions.

### 7) DESIGN review — [solution-architect-reviewer]({{ "/fr/reference/agents/solution-architect-reviewer" | relative_url }})

- **[architecture-review-criteria](architecture-review-criteria.html)** — gates DESIGN sur ADR, diagrammes, contrats.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — verdict adverse via panel de lentilles.

### 8) DISTILL — [acceptance-designer]({{ "/fr/reference/agents/acceptance-designer" | relative_url }})

- **[bdd-methodology](bdd-methodology.html)** — structuration Gherkin (Given/When/Then, outline, tags).
- **[test-design-mandates](test-design-mandates.html)** — matrices de couverture + ordre outside-in.
- **[outside-in-tdd](outside-in-tdd.html)** — double boucle TDD depuis comportement observable.
- **[resolving-stack-commands](resolving-stack-commands.html)** — résolution commande concrète selon stack.

### 9) DISTILL review — [acceptance-designer-reviewer]({{ "/fr/reference/agents/acceptance-designer-reviewer" | relative_url }})

- **[acceptance-review-criteria](acceptance-review-criteria.html)** — gates G1-G6 pour artefacts DISTILL.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — verdict adverse via panel de lentilles.

### 10) DELIVER — [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }})

- **[outside-in-tdd](outside-in-tdd.html)** — stratégie TDD outside-in de bout en bout.
- **[clean-architecture-testing](clean-architecture-testing.html)** — stratégie de tests par couche et frontière.
- **[craft-discipline](craft-discipline.html)** — checkpoints d'auto-discipline avant commit.
- **[test-refactoring-catalog](test-refactoring-catalog.html)** — refactoring test après GREEN.
- **[mutation-testing](mutation-testing.html)** — vérification via mutation score.
- **[quality-gates-evidence-contract](quality-gates-evidence-contract.html)** — contrat du journal d'évidence.
- **[quality-gates-dotnet](quality-gates-dotnet.html)** — commandes quality gates pour stack .NET.

### 10b) DELIVER — workers internes (sous-agents du software-engineer)

- **[mocking-strategy-roster](mocking-strategy-roster.html)** — résolution de stratégie mock + stack.
- **[mocking-microcks-dotnet](mocking-microcks-dotnet.html)** — wiring mock Microcks côté .NET.
- **[mocking-inprocess-dotnet](mocking-inprocess-dotnet.html)** — wiring double in-process côté .NET.
- **[contract-testing-roster](contract-testing-roster.html)** — résolution stack + opt-in Microcks pour contrat provider.
- **[contract-testing-dotnet](contract-testing-dotnet.html)** — baseline contrat provider + couche Microcks optionnelle.
- **[contract-testing](contract-testing.html)** — compétence contrat rejouée par worker contrat.
- **[resolving-stack-commands](resolving-stack-commands.html)** — résolution commande test/build/mutation pour worker.

### 11) DELIVER review — [software-engineer-reviewer]({{ "/fr/reference/agents/software-engineer-reviewer" | relative_url }})

- **[adversarial-review-lenses](adversarial-review-lenses.html)** — orchestration des lentilles de revue.

### Hors pipeline — usage direct

- **[create-custom-agent](create-custom-agent.html)** — construction d'un agent custom (`.agent.md`) : outils, instructions, handoffs.

## Voir aussi

- [Les patterns d'architecture]({{ "/fr/reference/patterns" | relative_url }})
- [Le deep-dive Outside-In TDD]({{ "/fr/explanation/deep-dive/outside-in-tdd" | relative_url }})
