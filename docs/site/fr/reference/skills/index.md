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
- **[Contract Testing](contract-testing.html)** — développement API contract-first :
  authoring OpenAPI/AsyncAPI, génération des exemples Microcks, vérification provider
  via `TestEndpointAsync`. Couvre les phases DESIGN → DISTILL → DELIVER.
- **[Contract Testing .NET](contract-testing-dotnet.html)** — adaptateur .NET pour les
  tests de contrat provider : test baseline `WebApplicationFactory` + `HttpClient`
  toujours émis ; couche Microcks `TestEndpointAsync` ajoutée en opt-in.
- **[Contract Testing Roster](contract-testing-roster.html)** — routeur stack + opt-in
  Microcks pour les tests de contrat provider ; pointe vers l'adaptateur
  `contract-testing-<stack>` résolu.
- **[Craft Discipline](craft-discipline.html)** — les points de contrôle que
  l'ingénieur applique à son propre travail avant de committer.
- **[Create Custom Agent](create-custom-agent.html)** — comment construire un
  fichier d'agent (`.agent.md`) : outils, instructions, handoffs.
- **[Mocking — In-process .NET](mocking-inprocess-dotnet.html)** — adaptateur .NET pour
  le mocking en in-process (FakeItEasy / NSubstitute / Moq) : double enregistré
  dans le DI du `WebApplicationFactory`, stratégie override `inprocess`.
- **[Mocking — Microcks .NET](mocking-microcks-dotnet.html)** — adaptateur .NET pour le
  mocking Microcks (stratégie par défaut) : `MicrocksContainerEnsemble` + câblage
  du client HTTP du SUT vers le mock URL.
- **[Mocking Strategy Roster](mocking-strategy-roster.html)** — résout la paire
  `(stratégie × stack)` pour mocker une dépendance downstream ; cascade override
  `prompt > skraft.instructions.md > microcks (défaut)`.
- **[Outside-In TDD](outside-in-tdd.html)** — écrire les tests depuis le comportement
  observable, double boucle RED/GREEN, walking skeleton.
- **[Red-Synthesize-Green](red-synthesize-green.html)** — le cycle TDD discipliné :
  un test qui échoue d'abord, puis l'implémentation minimale qui le fait passer.

## Voir aussi

- [Les patterns d'architecture]({{ "/fr/reference/patterns" | relative_url }})
- [Le deep-dive Outside-In TDD]({{ "/fr/explanation/deep-dive/outside-in-tdd" | relative_url }})
