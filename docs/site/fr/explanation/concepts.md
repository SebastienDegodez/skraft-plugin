---
layout: doc
lang: fr
title: "Concepts fondamentaux"
persona: tech-lead
---

# Concepts fondamentaux

SKRAFT n'invente rien : il **assemble** des concepts éprouvés d'ingénierie logicielle et les transforme en contraintes opérationnelles appliquées à chaque phase du pipeline. Cette page est le glossaire de référence du handbook. Chaque concept y est intégré et expliqué, puis relié à la phase et au skill qui l'opérationnalisent.

> Repère de lecture : 🧭 = concept transverse · 🔎 DISCOVER · 💬 DISCUSS · 🏗️ DESIGN · 🧪 DISTILL · 🚀 DELIVER · 🛡️ Review.

---

## 🧭 Concepts transverses

### Use Case

Un Use Case capture un contrat entre les parties prenantes sur le comportement attendu du système. Dans SKRAFT, **une story = un Use Case = un cycle complet du pipeline** (DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER). Pas de batching, pas de raccourcis.

> « A use case captures a contract between the stakeholders of a system about its behavior. »
> — Cockburn, A., *Writing Effective Use Cases*, 2001.

### CQS — Command-Query Separation

CQS sépare les opérations qui modifient l'état (commandes) de celles qui le consultent (queries). Dans SKRAFT, les agents exécuteurs **commandent** (ils écrivent des artefacts), tandis que les reviewers **querient** (ils lisent sans modifier).

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

Voir [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) pour l'application concrète.

### CQRS — Command-Query Responsibility Segregation

CQRS étend CQS en séparant les modèles de lecture et d'écriture. L'orchestrateur dispatche des commandes vers les exécuteurs (modèle d'écriture), puis consulte `state.json` comme modèle de lecture dérivé pour décider de la prochaine action.

> « Use different models for updating information and reading information. »
> — Fowler, M., *Bliki: CQRS*, 2011.

### Walking Skeleton

La tranche la plus fine qui traverse **toutes** les couches du système de bout en bout. La première itération de SKRAFT livre une tranche fonctionnelle complète — pas un prototype, un vrai livrable vertical.

> « A walking skeleton is a tiny implementation of the system that performs a small end-to-end function. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

### Barre qualité — seuils permanents

Tous les seuils du framework sont écrits à un seul endroit — le skill [skraft-quality-bar]({{ "/fr/reference/skills/" | relative_url }}) — et s'appliquent à **tous** les dépôts, toutes les stories et toutes les phases. Il n'existe plus de molette de rigueur : le `depthTier` qui pouvait abaisser la barre a été supprimé, avec les niveaux `advisory` et `warning` et la rationale qui achetait une exemption.

| Porte | Valeur | Périmètre |
| --- | --- | --- |
| Score de mutation | 100 % | Domain, Application |
| Score de mutation | 90 % | API, Infrastructure |
| Couverture de lignes | 100 % | Domain, Application |

Toutes les portes sont **bloquantes** — frontières Clean Architecture, cycle TDD, intégrité des tests, mutation *core* et *boundary*, gate Gherkin, ADR pour toute décision non triviale, Object Calisthenics sur le Domain. Une porte qui ne peut pas s'exécuter n'est pas une porte franchie : c'est un échec, et le pipeline s'arrête. La variante TDD est Outside-In double boucle, toujours.

**Conséquence sur le coût, assumée :** la molette supprimée était aussi le gouverneur de coût du framework (fan-out des reviewers à 1, 2 ou 4 lentilles, nombre de runs de mutation, gate Gherkin activable ou non). Chaque run paie désormais la forme complète. Le choix est délibéré : la qualité n'est pas négociable.

### HVE — Hypervelocity Engineering

Le substrat d'exécution ([microsoft/hve-core](https://github.com/microsoft/hve-core)) : agents, instructions et skills pour GitHub Copilot autour de la méthodologie **RPI (Research → Plan → Implement)**. SKRAFT remplace le planner RPI tout en réutilisant les conventions HVE (`state.json`, arborescence `.copilot-tracking/`). Voir l'[accueil]({{ "/fr/" | relative_url }}) pour la synergie SKRAFT × HVE.

---

## 🔎 DISCOVER — Concepts de triage

### Triage d'issues

Assigner labels, priorité, estimation d'effort et détecter les doublons. Le `backlog-discoverer` produit un rapport de triage actionnable à partir du flux brut d'idées (issues, BRD, PRD). Skill : [issue-triage]({{ "/fr/reference/skills/" | relative_url }}).

### Détection de doublons & artifact-driven discovery

Avant de créer une story, on cherche dans l'historique Git et les issues existantes pour éviter la redondance. Skill : [github-search-protocol]({{ "/fr/reference/skills/" | relative_url }}) (syntaxe de recherche GitHub, pagination, ranking).

### Routing 2 axes (entry point & difficulté)

SKRAFT évalue **deux axes orthogonaux** autour de DISCOVER, puis persiste la décision dans `state.json`. Skill : [skraft-difficulty-routing]({{ "/fr/reference/skills/" | relative_url }}).

- **Entry point** — évalué au démarrage du pipeline, *avant* DISCOVER. SKRAFT détecte un handoff HVE en amont (issues GitHub déjà triées **et** rattachées à un sprint, `sprint-plan.md` ADO, artefact de sprint Jira). Le handoff n'est retenu que s'il porte à la fois une hiérarchie de backlog et un périmètre de sprint ; la détection ne saute jamais rien d'elle-même, l'utilisateur confirme explicitement. En cas de skip, le handoff est ingéré tel quel dans `research/{date}/` — ni re-triage, ni seconde proposition de sprint — et `state.json::entryPoint.skipPhases` enregistre `DISCOVER`.
- **Difficulty tier** — évalué à la sortie de DISCOVER (ou juste après l'ingestion quand DISCOVER est sauté), une seule fois, jamais réévalué en cours de pipeline. Persisté dans `state.json::difficulty` (`simple | medium | medium-hard | challenging`), il gouverne le **modèle d'exécution de DELIVER** : cycle TDD inline avec un commit par scénario (`simple`), inline multi-commits sur walking skeleton (`medium`), dispatch d'un sous-agent par scénario Gherkin avec plan intermédiaire (`medium-hard`), dispatch par scénario plus spike notes sous `details/{date}/` et passes de revue multiples (`challenging`).

La difficulté module **le volume de travail, jamais le niveau d'exigence**. Les seuils et le caractère bloquant des portes sont fixés une fois pour toutes par [skraft-quality-bar]({{ "/fr/reference/skills/" | relative_url }}) : un `simple` et un `challenging` franchissent exactement la même barre.

---

## 💬 DISCUSS — Concepts d'affinage

### User Story & critères d'acceptation

Transformer une issue brute en story structurée avec des critères d'acceptation vérifiables. Skill : [issue-refinement]({{ "/fr/reference/skills/" | relative_url }}).

### INVEST

Une bonne story est **I**ndependent, **N**egotiable, **V**aluable, **E**stimable, **S**mall, **T**estable. Le `backlog-planner` affine chaque story jusqu'à satisfaire ces six critères.

### DoR — Definition of Ready

Une grille de 8 points qui détermine si une story est prête à entrer en DESIGN. Tant que la DoR n'est pas verte, la story reste en DISCUSS. Vérifiée par [planning-review-criteria]({{ "/fr/reference/skills/" | relative_url }}).

### MoSCoW & Sprint Planning

Priorisation **Mu**st / **Sh**ould / **C**ould / **W**on't, gestion des milestones, suivi de vélocité et résolution des graphes de dépendances entre stories. Skill : [sprint-planning]({{ "/fr/reference/skills/" | relative_url }}).

---

## 🏗️ DESIGN — Concepts d'architecture

### Event Modeling

Méthode de modélisation qui décrit le système comme un flux **Command → Event → Read Model** dans le temps. Sert de colonne vertébrale partagée par toute l'équipe.

> « The model is the backbone of a language used by all team members to describe the system. »
> — Evans, E., *Domain-Driven Design*, 2003.

### DDD — Domain-Driven Design (stratégique & tactique)

- **Stratégique** : découpage en **Bounded Contexts**, context mapping, langage ubiquitaire.
- **Tactique** : **Aggregate**, **Entity**, **Value Object**, **Domain Event**, **Repository**.

Le `solution-architect` modélise ces éléments ; le skill [architecture-patterns]({{ "/fr/reference/skills/" | relative_url }}) couvre leur composition.

### Clean Architecture

Isolation stricte du métier vis-à-vis de l'infrastructure via la **règle de dépendance** : les couches internes ignorent les couches externes. Frameworks et bases de données deviennent de simples détails.
👉 Page dédiée : **[Clean Architecture en détail]({{ "/fr/explanation/clean-architecture" | relative_url }})**.

### Event Sourcing

Persister la suite des événements plutôt que l'état final, reconstruit par rejeu. Souvent combiné à CQRS pour les domaines à fort besoin d'auditabilité. Couvert par [architecture-patterns]({{ "/fr/reference/skills/" | relative_url }}).

### ADR — Architecture Decision Record

Chaque décision structurante est figée dans un ADR immuable capturant **contexte → options → décision → conséquences**, avec un cycle de statuts (proposed → accepted → superseded). Garantit que le *pourquoi* des choix reste traçable. Skill : [architecture-decisions]({{ "/fr/reference/skills/" | relative_url }}).

### Fitness des patterns

Choisir un pattern, c'est évaluer son adéquation au problème (pas un réflexe). Le reviewer vérifie cette fitness via [architecture-review-criteria]({{ "/fr/reference/skills/" | relative_url }}).

---

## 🧪 DISTILL — Concepts de spécification exécutable

### BDD & Gherkin

Décrire le comportement attendu en langage **Given / When / Then**, aligné sur le langage du domaine. L'`acceptance-designer` produit des scénarios exécutables. Skill : [bdd-methodology]({{ "/fr/reference/skills/" | relative_url }}).

### Test Design Mandates

Matrice de couverture qui assigne **chaque comportement au bon niveau** de la Clean Architecture, sans redondance, et planifie l'ordre d'implémentation outside-in. Skill : [test-design-mandates]({{ "/fr/reference/skills/" | relative_url }}).

### Contract Testing

Vérifier que deux services respectent un contrat partagé (consumer/provider) sans test d'intégration complet. Skill : [contract-testing]({{ "/fr/reference/skills/" | relative_url }}).

---

## 🚀 DELIVER — Concepts d'implémentation disciplinée

### Outside-In TDD (double boucle)

On commence par le test d'acceptation (boucle externe, comportement observable) et on laisse le design interne émerger via la boucle TDD interne. Skill : [outside-in-tdd]({{ "/fr/reference/skills/" | relative_url }}).

> « Start with an acceptance test that exercises the functionality you want to build. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

### RED → GREEN → REFACTOR

Le rythme fondamental du TDD : écrire un test qui échoue, puis le faire passer par une synthèse propre en un seul geste — pas de code sale suivi d'un refactoring. Skill : [outside-in-tdd]({{ "/fr/reference/skills/" | relative_url }}).

> « Write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

### Mutation Testing

Le Mutation Score mesure l'**efficacité** des tests (pas seulement la couverture) en injectant des défauts et en vérifiant que les tests les détectent. Les seuils sont permanents : **100 % sur Domain et Application**, **90 % sur API et Infrastructure**.

La mesure ne se lit pas dans un rapport. Chaque adaptateur `quality-gates-<tech>` embarque **deux scripts séquencés** — *core* d'abord (Domain, Application), *boundary* ensuite (API, Infrastructure) — qui portent leur propre valeur attendue et la passent au `--break-at` du runner : c'est le **code de sortie** du runner qui fait verdict. *Core* passe en premier et court-circuite la suite, car muter les adaptateurs tant que le domaine n'est pas prouvé n'apprend rien. Pour .NET : `mutation-core.sh` et `mutation-boundary.sh`. Skills : [mutation-testing]({{ "/fr/reference/skills/" | relative_url }}), [quality-gates-dotnet]({{ "/fr/reference/skills/" | relative_url }}), [skraft-quality-bar]({{ "/fr/reference/skills/" | relative_url }}).

> « Mutation testing provides high-fidelity assessment of test suite effectiveness. »
> — Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.

### Object Calisthenics

Neuf règles de discipline qui améliorent le design objet au quotidien (un seul niveau d'indentation, pas de `else`, envelopper les primitives, pas de getters/setters aveugles…). Contraintes d'atelier vérifiées par le reviewer.

> « Nine steps to better software design today. »
> — Bay, J., *Object Calisthenics*, 2008.

### Craft Discipline & Test Refactoring

- [craft-discipline]({{ "/fr/reference/skills/" | relative_url }}) : checkpoints d'auto-discipline que le software-engineer applique à son propre travail avant commit.
- [test-refactoring-catalog]({{ "/fr/reference/skills/" | relative_url }}) : refactorer les tests (extraction de helpers, renommage métier, déduplication) sans changer la couverture.

### Quality Gates & Evidence Contract

Un journal de preuves structuré atteste l'état des portes qualité (tests, build, mutation, intégrité RED/GREEN). L'engineer le **remplit** (writer), le reviewer le **lit** (reader). Le journal enregistre des résultats, il ne fixe pas la barre : les seuils et le niveau d'application de chaque porte viennent de [skraft-quality-bar]({{ "/fr/reference/skills/" | relative_url }}). Skills : [quality-gates-evidence-contract]({{ "/fr/reference/skills/" | relative_url }}), [resolving-stack-commands]({{ "/fr/reference/skills/" | relative_url }}).

---

## 🛡️ Review — Concepts de validation indépendante

### Adversarial Review Lenses

Chaque reviewer produit un verdict via **4 lentilles indépendantes** puis une synthèse pondérée. Les lentilles regardent le même artefact sous des angles différents (quality-gates, architecture-boundaries, test-integrity, cold-reader). Les quatre s'exécutent sur **chaque** revue : il n'y a pas de mode réduit ni de fan-out variable. Skill : [adversarial-review-lenses]({{ "/fr/reference/skills/" | relative_url }}).

### Review Criteria par phase

Chaque phase possède sa grille de gates et son barème : [discovery-review-criteria]({{ "/fr/reference/skills/" | relative_url }}), [planning-review-criteria]({{ "/fr/reference/skills/" | relative_url }}), [architecture-review-criteria]({{ "/fr/reference/skills/" | relative_url }}), [acceptance-review-criteria]({{ "/fr/reference/skills/" | relative_url }}).

### Preuves Playwright

Pour les comportements UI, les captures et traces Playwright servent de preuve objective de fonctionnement. Skill : [playwright-evidence]({{ "/fr/reference/skills/" | relative_url }}).

---

## Voir aussi

- [Le pipeline phase par phase]({{ "/fr/explanation/pipeline/" | relative_url }})
- [Architecture du système]({{ "/fr/explanation/architecture" | relative_url }})
- [Clean Architecture en détail]({{ "/fr/explanation/clean-architecture" | relative_url }})
- [Référence des skills]({{ "/fr/reference/skills/" | relative_url }})
