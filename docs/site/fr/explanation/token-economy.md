---
layout: doc
lang: fr
title: "Économie de tokens"
description: "Pourquoi le coût d'un pipeline agentique est une forme architecturale décidée au design, pas un réglage runtime — et comment SKRAFT la tient via les leviers de la discipline Genesis."
---

# Économie de tokens

> Le coût d'un pipeline agentique n'est pas un curseur à ajuster en production :
> c'est une contrainte de forme, décidée au moment de la conception, comme le budget
> mémoire ou la latence acceptable.

## La thèse

Dans la littérature sur le développement produit, le coût d'un lot de travail est
décidé bien avant son exécution — par la taille du lot, les dépendances, le nombre
de boucles de retour. Donald Reinertsen le formule ainsi :

> « The cost of queuing delays is determined by the shape of the flow, not by the
> speed of individual activities. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

Appliqué à un pipeline d'agents, cette intuition se traduit directement : les tokens
consommés par une exécution SKRAFT ne sont pas principalement pilotés par le contenu
de la requête de l'utilisateur, mais par la **forme architecturale du pipeline** —
combien d'agents sont instanciés, quels outils ils voient, quelle classe de modèle
leur est allouée, et combien de fois le contexte doit être rechargé de zéro.

Cette forme est décidée au moment de l'écriture des agents et des skills, pas au
moment de l'invocation. C'est pourquoi SKRAFT traite l'économie de tokens comme un
invariant de conception — un budget, pas un espoir.

## Les leviers

SKRAFT applique cinq leviers issus de la discipline Genesis pour tenir ce budget.
Chaque levier agit sur une dimension distincte de la dépense.

| Levier | Ce que ça fait |
|--------|----------------|
| **Discipline de cache** | Les prompts-système et les instructions partagées sont conçus pour être *rechargés* entre les tours sans recalcul — tout ce qui peut être mis en cache KV l'est, et la structure des messages le garantit. |
| **Classe par rôle** | L'orchestrateur et les reviewers roulent sur un modèle de classe *frontier* (raisonnement large, faible fréquence) ; les agents spécialistes — implementer, planner, researcher — roulent sur un modèle de classe *capable* (fréquence haute, tâches bornées). |
| **Surface d'outils** | Aucun agent ne reçoit un catalogue MCP complet. Chaque agent ne voit que les outils dont il a besoin pour sa tâche précise. Chaque outil superflu est une invitation à raisonner inutilement. |
| **Profondeur (`depthTier`)** | La profondeur de chaque run est gouvernée par `depthTier` (shallow / standard / deep) : fan-out à 1, 2 ou 4 lentilles adversariales ; seuil de score de mutation ; gate Gherkin activée ou non. Un run *shallow* n'instancie pas les reviewers complets. |
| **Élagage structurel** | Sur un handoff HVE entrant, la phase DISCOVER est sautée : le backlog et la priorisation arrivent déjà formés. Le pipeline n'exécute pas ce qu'il n'a pas à recalculer. |

Ces leviers ne sont pas indépendants. La discipline de cache et la classe par rôle se
renforcent mutuellement : un modèle *capable* rechargeable depuis le cache KV coûte une
fraction de ce qu'un modèle *frontier* recalculé coûterait. La surface d'outils et la
profondeur limitent la surface de décision à l'intérieur de chaque tour, ce qui
raccourcit la réponse et réduit la fenêtre de contexte nécessaire.

## Sans rogner la qualité

L'économie décrite ici provient exclusivement de la **forme** : mise en cache, classe
de modèle, volume de sortie, effort alloué. Elle ne touche jamais aux mécanismes qui
garantissent la fiabilité des livrables.

Les lentilles de revue adverse, leurs pondérations, leur protocole de synthèse et le
score seuil d'acceptation sont hors périmètre de l'économie de tokens. Réduire le
nombre de lentilles ou abaisser les seuils n'est pas un levier d'économie — c'est
une dégradation de la qualité. Pour comprendre pourquoi ces gardes-fous ne se négocient
pas, voir la page [La revue avant la revue]({{ "/fr/explanation/why-review-before-review" | relative_url }}).

La distinction est importante en pratique : quand un run dépasse un budget de tokens
estimé (estimé), la première question n'est pas « quels reviewers désactiver ? » mais
« quel levier de forme n'est pas encore appliqué ? ».

## Ce qui est en place — ce qui arrive

### En place

Les annotations `cost_role_class` dans les agents de phase allouent la bonne classe
de modèle à chaque rôle. Le champ `depthTier` dans `state.json` gouverne le fan-out
des lentilles et l'activation des gates optionnelles. Ces deux mécanismes constituent
le gouverneur principal de la dépense à l'heure actuelle.

### Conçu, pas encore implémenté

Le plus grand levier encore non activé est le **schéma de verdict hors-LLM** : faire
rendre les verdicts de revue dans un format structuré (JSON), puis les transformer en
rapport Markdown par un moteur de template — sans passer par le modèle pour la mise
en forme. Ce rendu est aujourd'hui encore confié au LLM, ce qui représente une taxe
non négligeable sur la sortie des reviewers (estimé). Ce levier est conçu ; son
implémentation n'est pas encore dans le pipeline principal.

## Voir aussi

- [Concepts clés]({{ "/fr/explanation/concepts" | relative_url }}) — phases, agents, gates, artefacts
- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) — comment les agents s'assemblent
- [Le substrat HVE-Core]({{ "/fr/explanation/hve-core" | relative_url }}) — le socle sur lequel SKRAFT s'appuie
- [La revue avant la revue]({{ "/fr/explanation/why-review-before-review" | relative_url }}) — pourquoi les lentilles ne se négocient pas
- [Référence : patterns]({{ "/fr/reference/patterns" | relative_url }}) — le catalogue complet des motifs Genesis

## Sources

> « The cost of queuing delays is determined by the shape of the flow, not by the
> speed of individual activities. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.
