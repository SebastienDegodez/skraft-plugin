---
layout: doc
lang: fr
title: "SKRAFT — Le Handbook"
persona: tech-lead
---

# SKRAFT — Le Handbook

Bienvenue dans le Handbook SKRAFT. Ce guide est structuré pour vous faire comprendre, phase par phase, l'intérêt et la philosophie de notre pipeline SDLC agentique. Chaque phase est gérée par des agents IA spécialisés dotés de "skills" précis, et validée par un regard indépendant.

---

## 1. Origines : HVE, BRD et PRD

Tout projet robuste nécessite une fondation solide. SKRAFT ne vit pas isolé : il s'intègre dans l'écosystème **HVE** de Microsoft et s'aligne sur les documents d'exigences métier (BRD) et produit (PRD).

* **HVE — Hypervelocity Engineering ([microsoft/hve-core](https://github.com/microsoft/hve-core)) :** C'est le substrat. HVE est une bibliothèque de prompts, d'agents spécialisés, d'instructions et de skills pour GitHub Copilot, bâtie autour de la méthodologie **RPI (Research → Plan → Implement)**. HVE fournit des conventions strictes et partagées : un fichier `state.json`, un protocole par tour, et une arborescence d'artefacts datés sous `.copilot-tracking/`.
* **BRD (Business Requirements Document) :** Documente le **« Pourquoi »**. Quels sont les objectifs commerciaux, les problèmes à résoudre et les métriques de succès ? Dans HVE, le BRD est lui-même produit par un planner dédié.
* **PRD (Product Requirements Document) :** Documente le **« Quoi »**. Il traduit le BRD en spécifications fonctionnelles, parcours utilisateurs (user journeys) et périmètre produit.

**Comment SKRAFT et HVE fonctionnent ensemble :**
SKRAFT **remplace uniquement le planner RPI** de HVE par son pipeline SDLC complet (DISCOVER → DELIVER), tout en réutilisant **verbatim** les conventions HVE pour la persistance d'état (`state.json`) et les chemins d'artefacts. Les autres planners HVE (Security, BRD, Doc Ops, etc.) restent indépendants et coexistent en pairs, sans couplage.

L'apport de chacun est complémentaire : **HVE** apporte le substrat partagé et l'interopérabilité entre agents ; **SKRAFT** apporte la rigueur d'un cycle SDLC complet, phase par phase, avec un reviewer indépendant à chaque étape. Le BRD et le PRD alimentent en amont la phase DISCOVER, que SKRAFT transforme ensuite en code fonctionnel et testé.

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
👉 **[Comprendre la Clean Architecture dans le détail]({{ "/fr/clean-architecture" | relative_url }})**

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
- Explorez le [fonctionnement détaillé du pipeline]({{ "/fr/pipeline/" | relative_url }}).
- Parcourez le [glossaire complet des concepts]({{ "/fr/concepts" | relative_url }}) — tous les concepts SKRAFT, intégrés et expliqués.
