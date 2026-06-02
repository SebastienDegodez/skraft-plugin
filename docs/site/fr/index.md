---
layout: default
lang: fr
title: "SKRAFT — Le Handbook"
persona: tech-lead
---

# SKRAFT — Le Handbook

Bienvenue dans le Handbook SKRAFT. Ce guide est structuré pour vous faire comprendre, phase par phase, l'intérêt et la philosophie de notre pipeline SDLC agentique. Chaque phase est gérée par des agents IA spécialisés dotés de "skills" précis, et validée par un regard indépendant.

---

## 1. Origines : HVE, BRD et PRD

Tout projet robuste nécessite une fondation solide. Dans l'écosystème SKRAFT, nous alignons la valeur métier, les exigences et le produit avant d'écrire la moindre ligne de code.

* **HVE (High-Value Engineering) :** C'est la boussole. L'HVE garantit que les efforts techniques sont toujours alignés avec la vision stratégique et apportent la plus grande valeur ajoutée pour l'entreprise.
* **BRD (Business Requirements Document) :** Documente le **"Pourquoi"**. Quels sont les objectifs commerciaux, les problèmes à résoudre et les métriques de succès ?
* **PRD (Product Requirements Document) :** Documente le **"Quoi"**. Il traduit le BRD en spécifications fonctionnelles, parcours utilisateurs (user journeys) et périmètre produit.

**Comment ces concepts fonctionnent ensemble :**
Le BRD donne la direction métier, le PRD la matérialise en produit, et la philosophie HVE s'assure que l'implémentation maximise le ROI et la maintenabilité. L'apport de l'un nourrit l'autre de manière incrémentale. Le pipeline SKRAFT automatise la transition de ces documents vers un code fonctionnel et testé.

---

## 2. Le Pipeline Phase par Phase et ses Agents

Le cycle de développement SKRAFT est découpé en 5 phases. Pour chaque phase, nous avons un agent exécuteur (qui utilise des skills pour produire des artefacts) et un agent reviewer (qui valide le travail avec un regard critique).

### Phase 1 : DISCOVER (Triage & Alignement)
* **Intérêt :** Traduire le flux brut d'idées, le PRD et le BRD en un backlog cohérent.
* **Agent Exécuteur :** `backlog-discoverer`
  * **Skills :** `issue-triage`, `discovery-review-criteria`
  * **Cible :** Produire un rapport de triage actionnable, en écartant ce qui ne correspond pas aux priorités.
* **Agent Reviewer :** `backlog-discoverer-reviewer` valide la priorisation.

### Phase 2 : DISCUSS (Raffinement)
* **Intérêt :** Affiner les besoins pour les rendre "INVEST" (Indépendants, Négociables, etc.). On prépare le terrain pour le test d'acceptation.
* **Agent Exécuteur :** `backlog-planner`
  * **Skills :** `issue-refinement`, `sprint-planning`
  * **Cible :** Transformer une story floue en critères d'acceptation stricts, sans ambiguïté.
* **Agent Reviewer :** `backlog-planner-reviewer` s'assure de l'absence de zones d'ombre.

### Phase 3 : DESIGN (Architecture)
* **Intérêt :** Ne jamais coder à l'aveugle. Modéliser l'architecture, anticiper les failles et structurer le code.
* **Agent Exécuteur :** `solution-architect`
  * **Skills :** `architecture-decisions`, `architecture-patterns`
  * **Cible :** Rédiger les ADRs (Architecture Decision Records) et concevoir les diagrammes d'architecture en amont.
* **Agent Reviewer :** `solution-architect-reviewer` évalue les choix techniques (sécurité, couplage).

### Phase 4 : DISTILL (Spécification Exécutable)
* **Intérêt :** Aligner le code et la documentation métier via la méthodologie BDD (Behavior-Driven Development).
* **Agent Exécuteur :** `acceptance-designer`
  * **Skills :** `bdd-methodology`, `test-design-mandates`
  * **Cible :** Produire des scénarios Gherkin (Given/When/Then) qui guideront le code.
* **Agent Reviewer :** `acceptance-designer-reviewer` valide que les tests couvrent bien le PRD initial.

### Phase 5 : DELIVER (Implémentation)
* **Intérêt :** Coder avec une garantie de qualité absolue, guidé par les tests.
* **Agent Exécuteur :** `software-engineer`
  * **Skills :** `outside-in-tdd`, `red-synthesize-green`, `mutation-testing`
  * **Cible :** Écrire les tests d'acceptation (Walking Skeleton), implémenter le code de production en TDD, puis refactoriser.
* **Agent Reviewer :** `software-engineer-reviewer` s'assure du respect strict des architectures et de l'intégrité des tests.

---

## 3. L'Ingénierie au Coeur de SKRAFT

L'excellence technique n'est pas une option. SKRAFT enforce l'application de méthodologies strictes à chaque étape.

### Clean Architecture
Pour que nos agents puissent travailler efficacement et que le code reste pérenne, la logique métier doit être strictement isolée de l'infrastructure (frameworks, bases de données).
👉 **[Comprendre la Clean Architecture dans le détail](/fr/clean-architecture)**

### Object Calisthenics
Les agents implémentent les règles des Object Calisthenics pour forcer un code orienté objet propre. Par exemple :
- Un seul niveau d'indentation par méthode.
- Ne pas utiliser le mot-clé `else`.
- Envelopper toutes les primitives et les types de base.
- Pas de getters/setters aveugles.

Ces règles strictes assurent que le code généré garde un couplage faible et une grande lisibilité, évitant ainsi le code spaghetti typique des assistants IA moins cadrés.

### ADR (Architecture Decision Records) & Architectures
L'architecture n'évolue jamais de manière silencieuse. Chaque décision structurante passe par la phase DESIGN et donne lieu à un **ADR**. 
Un ADR capture de manière immutable :
- Le contexte de la décision.
- Les options considérées.
- La décision finale et ses conséquences.
Cela garantit que les futures IA (et les humains) comprendront le *pourquoi* des choix passés, assurant une gouvernance technique sans faille.

---

**Prêt à aller plus loin ?**
- Explorez le [fonctionnement détaillé du pipeline](/fr/pipeline/).
- Découvrez nos [Concepts fondamentaux](/fr/concepts).
