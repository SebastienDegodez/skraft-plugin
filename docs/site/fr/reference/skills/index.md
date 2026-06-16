---
layout: doc
lang: fr
title: "Référence — Skills"
description: "Les skills SKRAFT : pratiques outillées, ce qu'elles font, quand les utiliser."
---

# Référence — Skills

> Une *skill* est une pratique outillée : une procédure testée qu'un agent charge
> au moment où il en a besoin. Chaque skill répond à un problème précis du craft.

- **[Clean Architecture Testing](clean-architecture-testing.html)** — quoi tester à
  chaque couche (Domain, Application, Infrastructure, API), quel test double choisir
  à chaque frontière.
- **[Craft Discipline](craft-discipline.html)** — les points de contrôle que
  l'ingénieur applique à son propre travail avant de committer.
- **[Create Custom Agent](create-custom-agent.html)** — comment construire un
  fichier d'agent (`.agent.md`) : outils, instructions, handoffs.
- **[Outside-In TDD](outside-in-tdd.html)** — écrire les tests depuis le comportement
  observable, double boucle RED/GREEN, walking skeleton.
- **[Red-Synthesize-Green](red-synthesize-green.html)** — le cycle TDD discipliné :
  un test qui échoue d'abord, puis l'implémentation minimale qui le fait passer.

### Mocking & tests de contrat

Ces skills outillent le câblage des tests en phase DELIVER. Aucun agent ne code en
dur une librairie : il résout la stratégie via un *roster*, qui pointe vers
l'adaptateur par stack. Ajouter un stack = +1 adaptateur, zéro modification des agents.

- **mocking-strategy-roster** — résout la stratégie de mock (Microcks par défaut,
  surchargeable vers une librairie in-process via `skraft.instructions.md`) et le stack.
- **mocking-microcks-dotnet** — câblage Microcks Testcontainers + `WebApplicationFactory`
  pointant le client HTTP typé du système sous test vers l'URL du mock (.NET).
- **mocking-inprocess-dotnet** — double in-process (priorité FakeItEasy >
  NSubstitute > Moq) injecté dans la DI à la place du conteneur Microcks (.NET).
- **contract-testing** — compétence canonique pour le développement API contract-first :
  contrats OpenAPI/AsyncAPI en DESIGN, exemples Microcks en DISTILL, vérification du
  contrat fournisseur via Testcontainers en DELIVER. Le câblage par stack est résolu
  via le roster.
- **contract-testing-roster** — résout le stack et l'opt-in Microcks pour un test de
  contrat côté fournisseur ; une baseline d'intégration in-process est toujours produite.
- **contract-testing-dotnet** — baseline `WebApplicationFactory` + `HttpClient`
  toujours produite ; couche de vérification Microcks ajoutée en option (.NET).

### Backlog — DISCOVER & DISCUSS

- **[github-search-protocol](github-search-protocol.html)** — construire des requêtes GitHub Search, paginer les résultats, filtrer par labels/milestones/assignees.
- **[issue-triage](issue-triage.html)** — assigner labels, priorité, estimation d'effort, détecter les doublons, construire une proposition de sprint.
- **[issue-refinement](issue-refinement.html)** — transformer une issue brute en user story INVEST avec critères d'acceptation, pattern de découpage, DoR 8-items.
- **[sprint-planning](sprint-planning.html)** — planifier le contenu d'un sprint, prioriser les stories, estimer la capacité, analyser les dépendances.

### Architecture — DESIGN

- **[architecture-decisions](architecture-decisions.html)** — documenter les décisions d'architecture en ADR, évaluer les alternatives, gérer le cycle de vie.
- **[architecture-patterns](architecture-patterns.html)** — Event Modeling, DDD stratégique & tactique, Clean Architecture, CQRS, Event Sourcing.

### Critères de revue (Reviewers)

- **[acceptance-review-criteria](acceptance-review-criteria.html)** — gates G1-G6 pour les artefacts DISTILL (scénarios Gherkin, plans de test, plans d'implémentation).
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — produire un verdict adverse via 4 lentilles indépendantes et synthèse pondérée (pattern Genesis A7).
- **[architecture-review-criteria](architecture-review-criteria.html)** — gates pour les artefacts DESIGN (modèles d'événements, ADR, diagrammes, contrats d'interface).
- **[discovery-review-criteria](discovery-review-criteria.html)** — gates G1-G6 pour les artefacts DISCOVER (rapports de triage, propositions de sprint).
- **[planning-review-criteria](planning-review-criteria.html)** — gates G1-G8 pour les artefacts DISCUSS (stories, critères d'acceptation, plans de sprint).

### Tests & qualité — DELIVER

- **[bdd-methodology](bdd-methodology.html)** — rédiger et structurer des scénarios BDD en Gherkin : Given/When/Then, Scenario Outline, Background, tag strategy.
- **[mutation-testing](mutation-testing.html)** — tuer les mutants survivants, vérifier la qualité des tests via le mutation score, analyser les rapports Stryker.
- **[playwright-evidence](playwright-evidence.html)** — capturer les preuves E2E (screenshots, vidéos, traces) et les stocker dans le tracking SKRAFT.
- **[quality-gates-dotnet](quality-gates-dotnet.html)** — commandes `dotnet` / `stryker` et leur mapping vers le schéma de contrat d'évidence (.NET).
- **[quality-gates-evidence-contract](quality-gates-evidence-contract.html)** — schéma du journal d'évidence structuré (tech-agnostique) attestant les quality gates.
- **[test-design-mandates](test-design-mandates.html)** — matrices de couverture, assignation par couche Clean Architecture, ordre d'implémentation outside-in, Walking Skeleton.
- **[test-refactoring-catalog](test-refactoring-catalog.html)** — refactoring des tests après GREEN : extraire des helpers, renommer pour la clarté métier, consolider les cas paramétrés.

### Résolution de stack & routing

- **[resolving-stack-commands](resolving-stack-commands.html)** — résoudre la commande concrète (build, test, mutation) depuis le stack détecté ; aucun agent ne hardcode `dotnet test`.
- **[skraft-difficulty-routing](skraft-difficulty-routing.html)** — évaluer le routing 3-axes (entry point, depth tier, difficulty tier) à la sortie de DISCOVER.

## Voir aussi

- [Les patterns d'architecture]({{ "/fr/reference/patterns" | relative_url }})
- [Le deep-dive Outside-In TDD]({{ "/fr/explanation/deep-dive/outside-in-tdd" | relative_url }})
