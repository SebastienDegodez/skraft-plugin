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
| **Classe par rôle** | Chaque agent porte une classe cible B12 — `implementer`, `planner` ou `reviewer`. Les producteurs d'artefacts (discoverer, planner, architect, engineer) reçoivent la classe la plus capable ; les reviewers de phase et les lentilles, dont la tâche est bornée, reçoivent la classe la moins chère qui tienne le travail. Deux rôles font exception et exigent une classe *Sonnet ou supérieure* quel que soit leur rôle : `software-engineer` et `software-engineer-reviewer` (arbitrage multi-contraintes). |
| **Surface d'outils** | Aucun agent ne reçoit un catalogue MCP complet. Chaque agent ne voit que les outils dont il a besoin pour sa tâche précise. Chaque outil superflu est une invitation à raisonner inutilement. |
| **Profondeur (`depthTier`)** | La profondeur de chaque run est gouvernée par `depthTier` (`basic` / `standard` / `comprehensive` / `custom`) : fan-out à 1, 2 ou 4 lentilles adversariales ; périmètre/seuil de mutation ; gate Gherkin activée ou non. Un run `basic` n'instancie pas les reviewers complets. |
| **Élagage structurel** | Sur un handoff HVE entrant, la phase DISCOVER est sautée : le backlog et la priorisation arrivent déjà formés. Le pipeline n'exécute pas ce qu'il n'a pas à recalculer. |

Ces leviers ne sont pas indépendants. La discipline de cache et la classe par rôle se
renforcent mutuellement : un modèle de classe basse rechargeable depuis le cache KV coûte une
fraction de ce qu'un modèle de classe haute recalculé coûterait. La surface d'outils et la
profondeur limitent la surface de décision à l'intérieur de chaque tour, ce qui
raccourcit la réponse et réduit la fenêtre de contexte nécessaire.

## Mesures réelles

Les deux premiers leviers — discipline de cache et classe de modèle — ont été mesurés
sur un run réel du pipeline SKRAFT exécuté en *agentic workflow* (gh-aw), via le schéma
*Effective Tokens* (ET v0.2.0) du harness. Les chiffres ci-dessous proviennent des
fichiers `agent_usage.json` émis par huit exécutions d'agents et de reviewers — ils ne
sont pas estimés.

### Discipline de cache — −42,6 % de tokens effectifs

Le taux de réussite du cache KV est stable autour de **48 %** de l'entrée totale sur les
huit exécutions. Le schéma ET pondère un token lu depuis le cache à **0,1×** contre
**1,0×** pour un token recalculé — dix fois moins cher.

| Tokens effectifs (8 phases) | Sans cache | Avec cache | Gain |
|---|---|---|---|
| Total | 47,6 M | 27,3 M | **1,74× — −42,6 %** |

Le gain découle de la **forme** des prompts : un préfixe système stable, non réécrit
entre les tours, reste éligible au cache. C'est précisément le levier que les
[hooks]({{ "/fr/explanation/hooks" | relative_url }}) préservent côté infrastructure —
un invariant tenu par du code ne déplace pas le préfixe, là où un invariant ré-injecté
en prose le ferait rater.

### Classe de modèle — séparation de 27×

Le même schéma applique un multiplicateur par modèle. Sur ce run, deux classes ont été
observées : **9,0×** pour la classe *frontier* (claude-sonnet-5) et **0,33×** pour la
classe *capable* (claude-haiku-4.5). À travail normalisé égal, allouer la classe capable
plutôt que frontier coûte donc **9,0 / 0,33 ≈ 27× moins** en tokens effectifs — ce qui
fait du choix de classe le multiplicateur dominant de la dépense.

*Provenance : run gh-aw `SDLC` sur l'issue #72 du dépôt `meetup-coding-with-ai`, schéma
Effective Tokens v0.2.0, modèle de référence `claude-sonnet-4.5`.*

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
estimé, la première question n'est pas « quels reviewers désactiver ? » mais
« quel levier de forme n'est pas encore appliqué ? ».

## Ce qui est en place — ce qui arrive

### En place

La classe de modèle est **réellement appliquée** : un résolveur déterministe
(`plugins/skraft-framework/src/`, Clean Architecture, zéro dépendance) lit le `cost_role_class` et le
plancher `model_requirement` de chaque agent, puis **pinne le champ `model:`** de son
`*.agent.md` au modèle concret résolu. Le tableau de la section « Mesures réelles »
décrit la politique : `reviewer → claude-haiku-4.5`, `implementer → claude-sonnet-4.5`,
`planner → claude-sonnet-5`, le plancher Sonnet relevant les deux exceptions
(`software-engineer`, `software-engineer-reviewer`). Une seule source de vérité ; un
linter CI (`resolve-model --check`) échoue si un agent dérive de la politique. Le champ
`depthTier` dans `state.json` gouverne le fan-out des lentilles et l'activation des
gates optionnelles. Ces deux mécanismes constituent le gouverneur principal de la
dépense à l'heure actuelle.

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
