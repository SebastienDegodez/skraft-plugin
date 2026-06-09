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
- **contract-testing-roster** — résout le stack et l'opt-in Microcks pour un test de
  contrat côté fournisseur ; une baseline d'intégration in-process est toujours produite.
- **contract-testing-dotnet** — baseline `WebApplicationFactory` + `HttpClient`
  toujours produite ; couche de vérification Microcks ajoutée en option (.NET).

## Voir aussi

- [Les patterns d'architecture]({{ "/fr/reference/patterns" | relative_url }})
- [Le deep-dive Outside-In TDD]({{ "/fr/explanation/deep-dive/outside-in-tdd" | relative_url }})
