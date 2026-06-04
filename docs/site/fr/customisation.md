---
layout: doc
lang: fr
title: "Customisation"
persona: tech-lead
---

# Customisation

SKRAFT est un framework, pas un carcan. Chaque composant est conçu pour être adapté à votre contexte — mais certaines contraintes ne sont pas négociables. Cette page distingue ce qui peut changer de ce qui ne doit pas.

## Niveaux de customisation

| Niveau | Quoi | Exemples | Citation |
|--------|------|----------|----------|
| **L1 — Surface** | Textes de prompts, vocabulaire, glossaire métier | Renommer les labels, adapter les templates de story, traduire les messages | Evans (2003) : le langage ubiquitaire doit refléter le domaine |
| **L2 — Cycles** | Profondeur des phases, seuils de qualité, itérations reviewer | Ajuster le mutation score floor, changer le nombre de retries, configurer la profondeur du Walking Skeleton | Beck (2004) : scope, temps, coût et qualité sont des variables à gérer |
| **L3 — Invariants** | Structure des artefacts, contrats inter-agents, CQS | Modifier le format de `state.json`, changer le protocole de verdict | Martin (2017) : l'architecture protège les cas d'usage |

> « A model is a selectively simplified and consciously structured form of knowledge. »
> — Evans, E., *Domain-Driven Design*, 2003.

**Règle d'or** : L1 est libre, L2 est configurable avec précaution, L3 nécessite une compréhension profonde du système et peut casser les garanties du pipeline.

## Invariants opposables

Ces contraintes sont non négociables. Chaque invariant est défendu par une référence académique ou industrielle.

| Invariant | Pourquoi | Référence |
|-----------|----------|-----------|
| Tests d'acceptation avant code | Les scénarios BDD définissent le comportement attendu avant toute implémentation | Adzic, G., *Specification by Example*, 2011 |
| Mutation score floor | Le coverage de lignes est insuffisant — le mutation testing vérifie l'efficacité réelle des tests | Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011 |
| Reviewer en lecture seule (CQS) | Poser une question ne doit pas changer la réponse — le reviewer ne modifie jamais les artefacts | Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997 |
| Une story = un Use Case | Chaque passage dans le pipeline traite exactement un Use Case, pas de batching | Cockburn, A., *Writing Effective Use Cases*, 2001 |
| Walking Skeleton d'abord | La première itération traverse toutes les couches de bout en bout | Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009 |
| Outside-In TDD | Les tests partent du comportement observable et descendent vers les détails internes | Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009 |
| Object Calisthenics | Contraintes de design appliquées au code métier pour forcer la qualité structurelle | Bay, J., *Object Calisthenics*, 2008 |

## Étendre une phase

Vous pouvez ajouter une étape à une phase existante — par exemple, insérer un `security-reviewer` entre DESIGN et DISTILL. Voici la marche à suivre :

### 1. Créer l'agent

Créez un fichier `.agent.md` pour votre nouvel agent en utilisant le skill [create-custom-agent](/fr/reference/skills/create-custom-agent). Définissez clairement :
- Son rôle (exécuteur ou reviewer)
- Son contrat d'entrée/sortie
- Ses invariants

### 2. Enregistrer dans l'orchestrateur

Ajoutez l'agent dans la configuration de l'orchestrateur, en précisant :
- Sa position dans la séquence des phases
- Les conditions de dispatch (après quel agent, avant quel agent)
- Le format de verdict attendu (si reviewer)

### 3. Respecter CQS

Si votre agent est un reviewer, il **doit** être en lecture seule. S'il est un exécuteur, il **doit** produire des artefacts dans le format attendu par la phase suivante.

### 4. Tester la chaîne

Exécutez un cycle complet du pipeline avec votre nouvel agent pour vérifier que :
- Les artefacts circulent correctement entre les phases
- Les verdicts sont correctement interprétés par l'orchestrateur
- Le retry fonctionne en cas de rejet

> « Good architecture makes the system easy to understand, easy to develop, easy to maintain, and easy to deploy. »
> — Martin, R. C., *Clean Architecture*, 2017.

## ⚠️ Risques de réduction des contrôles

> 🚧 GENERATED DRAFT — section à compléter et valider par un humain.

Certaines customisations réduisent les contrôles intégrés de SKRAFT. Ce n'est pas interdit, mais c'est risqué. Cette section identifie les principales zones de fragilisation.

### Supprimer ou affaiblir un gate

Chaque gate (G1–G5) protège une invariant précis. Supprimer un gate signifie que la phase suivante démarrera sans garantie que les critères de la phase précédente sont remplis.

| Action | Risque | Ce qui disparaît |
|--------|--------|-----------------|
| Supprimer G1 (DISCOVER) | Stories mal définies en DISCUSS | Vérification du DoR (Definition of Ready) |
| Supprimer G3 (DESIGN) | Architecture non validée avant les tests | Détection des violations de Clean Architecture |
| Abaisser le mutation score floor | Tests de surface uniquement | Détection des tests qui ne testent pas vraiment |

### Désactiver une lentille de revue

Les 4 lentilles couvrent des angles complémentaires. Désactiver l'une d'elles crée un angle mort.

| Lentille supprimée | Angle mort |
|-------------------|------------|
| `architecture-boundaries` | Les violations de frontières architecturales passent en PR humaine |
| `test-integrity` | Les tests de façade (qui passent sans tester) ne sont pas détectés |
| `quality-gates` | Les seuils de qualité (mutation, coverage) ne sont pas vérifiés |
| `cold-reader` | La lisibilité du code n'est pas vérifiée : le prochain développeur sera perdu |

### Passer un reviewer en mode écriture (violer CQS)

Si un reviewer peut modifier des artefacts, il introduit un effet de bord dans la revue. Le verdict ne reflète plus l'état original — il reflète un état modifié par le reviewer lui-même. C'est une violation du principe CQS qui peut produire des résultats non reproductibles.

> **Règle** : ne jamais donner à un reviewer le droit d'écrire dans les artefacts. Si vous souhaitez qu'un agent améliore automatiquement les artefacts, créez un agent *exécuteur* distinct, pas un reviewer.

<!-- 🚧 À compléter : ajouter des exemples issus de retours d'expérience réels. -->

## Voir aussi

- [Architecture](/fr/architecture) — Vue CQS du pipeline
- [Concepts fondamentaux](/fr/concepts) — CQS, CQRS, Walking Skeleton
- [Pipeline](/fr/pipeline/) — Description de chaque phase
