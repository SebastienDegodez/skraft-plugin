---
layout: doc
lang: fr
title: "Pour les décideurs"
description: "Pourquoi une organisation qui livre avec des assistants IA a besoin de SKRAFT : une discipline imposée par le code, la même sur chaque hôte, traçable et vérifiable."
persona: manager
---

# Pour les décideurs

> SKRAFT fait suivre aux assistants IA le même pipeline d'ingénierie, sur chaque poste et
> chaque outil. Les contrôles sont faits par un programme testé, pas laissés à la bonne
> volonté du modèle.

## Situation

Vos équipes livrent déjà avec des assistants IA : Claude Code, GitHub Copilot CLI, Copilot
dans VS Code. Le code arrive plus vite qu'avant. Chaque développeur choisit son outil, son
système (Windows ou macOS) et sa façon de demander.

## Complication

La vitesse ne garantit ni la qualité ni la régularité. Un assistant produit du code
plausible ; il ne prouve pas qu'il est testé. Si la méthode tient dans des consignes écrites
(la « prose » des prompts), chaque modèle l'applique à sa façon, et chaque outil la
contrôle à sa façon.

La première version de SKRAFT l'a montré. Un pipeline pouvait durer 8 h sur un projet .NET
presque vide sous VS Code. Les causes étaient structurelles :

- des décisions laissées à la prose de l'agent ;
- des **hooks** (scripts que l'hôte lance à chaque appel d'outil) coûteux et au
  comportement inégal selon l'hôte ;
- des sous-agents lancés par d'autres sous-agents ;
- des recettes bash exécutées sous PowerShell ;
- des preuves de qualité assemblées par le modèle lui-même.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Question

Comment obtenir des assistants IA un travail discipliné, identique d'un poste à l'autre, et
vérifiable par quelqu'un qui n'était pas là ?

## Réponse

SKRAFT V2 fait conduire le pipeline RESEARCH → DESIGN → DISTILL → DELIVER par un
**moteur** : un programme testé, livré dans le plugin, le même sur tous les hôtes. Le moteur
décide de l'ordre des phases, des sorties attendues, des relances et des gates. Les
assistants font le travail ; ils ne décident pas s'il est fini.

La discipline imposée ne change pas depuis la v1 : Outside-In TDD, Clean Architecture,
revue adverse, mutation testing, BDD. Ce qui change, c'est qui la fait respecter.

Les travaux de Forsgren, Humble et Kim (*Accelerate*, 2018) vont dans ce sens : les équipes
les plus performantes n'opposent pas vitesse et stabilité, elles obtiennent les deux.

## Ce que l'organisation obtient

### Une discipline imposée par le code, pas par la prose

Le moteur vérifie lui-même ce qu'une consigne ne fait qu'espérer. Il pré-crée le document
qu'un agent doit remplir, contrôle qu'il est rempli, relance une fois l'agent avec la liste
de ce qui manque, puis s'arrête en nommant la cause. Aucun agent ne lance un autre agent :
seul le **pilote d'hôte** (la partie de SKRAFT propre à chaque outil) lance les agents, sur
ordre du moteur.

### Le même pipeline sur chaque outil et chaque système

Le même moteur tourne dans Claude Code (par un mod) et dans GitHub Copilot CLI (par un
workflow dynamique). Les commandes passent sans shell, avec la même forme sous sh et
PowerShell. Les tests du moteur tournent sous Windows, macOS et Linux.

> **À venir.** VS Code passera par le SDK Copilot, avec une boucle de repli conduite par
> l'agent : prévu au lot 10.

### Une traçabilité auditable

Chaque run écrit un **journal d'événements** : une ligne par fait (étape lancée, résultat
enregistré, phase close, gate lancée). Chaque ligne porte l'empreinte SHA-256 de la ligne
précédente. Une modification à la main casse cette chaîne et le moteur s'arrête en le
disant. Les **preuves de gate** (commande, dossier, résultat, sorties) sont écrites par le
moteur, jamais par le modèle.

### Des équipes autonomes, sans attendre une release

Chaque dépôt décrit ses composants et leurs commandes dans `skraft-config.json` : build,
test, format, lint, couverture, architecture, mutation. SKRAFT détecte les projets
(.NET, Java, Python, TypeScript, JavaScript, React), propose des commandes par défaut, et
vérifie que chacune peut tourner. Une commande écrite par l'équipe est toujours celle qui
tourne. Les seuils de qualité, eux, ne se négocient pas : ils ne sont pas configurables.

### De quoi qualifier le livrable

Les gates de couverture et de mutation laissent leurs preuves dans le dossier du run.
L'équipe de qualification y lit la fragilité du service et les tests de bout en bout à
prévoir.

> **À venir.** Le plan de test pour l'équipe de qualification et le rapport de run (temps,
> coût, relances par étape) : prévus au lot 8. La boucle de clôture mutation : prévue au
> lot 7.

### Un coût maîtrisé

La V2 ne livre aucun hook de commande : aucun programme ne se lance à chaque appel d'outil.

> **À venir.** Retirer des prompts des agents ce que le moteur vérifie déjà, pour qu'ils ne
> paient plus pour lire des consignes qu'un programme applique : prévu au lot 6 (objectif :
> au moins 40 % de prompts en moins).

## Objectifs mesurables

Le plan V2 fixe des cibles. Ce sont des **objectifs**, pas des résultats mesurés.

| Objectif | Cible |
| --- | --- |
| Durée du run de référence (fixture .NET vide, Mac et Windows) | Divisée par 4 au moins par rapport aux 8 h |
| Preuves inconclusives sur ce run | Zéro |
| Relances dues à l'environnement sur ce run | Zéro |
| Somme des prompts d'agents | Réduite d'au moins 40 % (284 Ko en v1) |
| `skraft next` et `skraft record` (repli VS Code) | Sous 300 ms chacun |
| Surcoût par appel d'outil | 0 ms (aucun hook) |

Le chemin vers ces cibles est lui-même contrôlé. Chaque lot est comparé à la v1 sur les
mêmes projets d'essai : phases atteintes, verdicts, gates, artefacts, durée, coût, relances.
Une régression bloque la PR du lot. Le moteur est couvert par des tests d'acceptation par
cas d'usage et par du mutation testing en CI (seuil 80 % global ; le cœur vise 100 %).

Les mêmes travaux (*Accelerate*, 2018) relient la performance de livraison logicielle à la
performance de l'organisation.

## Comment l'adopter

1. **Un pilote sur un dépôt.** Choisissez un dépôt réel et une équipe volontaire. Installez
   le plugin `skraft` dans Claude Code ou GitHub Copilot CLI. Prérequis : Node 22 ou plus
   et Git ; Docker si un composant mocke ses dépendances avec Microcks (le défaut).
2. **Décrire et vérifier les composants.** `skraft init` détecte les projets et écrit
   `skraft-config.json` ; `skraft doctor` vérifie que chaque commande peut tourner. L'équipe
   corrige les commandes qui ne marchent pas chez elle.
3. **Un premier run RESEARCH.** Lancez une story et lisez ce qu'elle laisse : le document de
   recherche, le journal du run, l'état affiché par `skraft status`.
4. **Étendre.** Ajoutez des dépôts et des équipes au rythme des lots : chaque lot livré
   ajoute une phase ou un contrôle.

Le [tutoriel des premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}) fait ce
parcours pas à pas.

## Disponible aujourd'hui et feuille de route

**Aujourd'hui (lots 0 à 2)** : la phase RESEARCH de bout en bout dans Claude Code et Copilot
CLI ; le journal chaîné et la reprise ; `skraft-config.json` à composants, la détection,
`skraft doctor` ; la base de comparaison par dépôt ; les gates, lancées à la main par
`skraft gate`.

| Lot | Ce qu'il ajoute |
| --- | --- |
| 3 | DESIGN, DISTILL et DELIVER conduits par le moteur ; droits d'écriture vérifiés par diff git à chaque étape ; workflow personnalisable |
| 4 | Revue en code par lentilles isolées, verdict calculé par le moteur |
| 5 | Décisions humaines (`skraft decide`) : ratification d'ADR, escalades |
| 6 | Agents et skills élagués, prompts réduits |
| 7 | Boucle de clôture mutation |
| 8 | Vues complètes (Canvas Copilot, panneau Claude Code), rapport de run, publication des captures dans la PR |
| 9 | Plugin `skraft-brownfield` pour le code existant |
| 10 | VS Code (SDK Copilot, puis repli) |
| 11 | Bascule et version 2.0.0 |

## Pour qui

| Rôle | Ce que SKRAFT lui apporte |
| --- | --- |
| Direction technique, responsable d'équipe | Une méthode identique dans toutes les équipes, et une trace vérifiable de chaque run |
| Développeur sous VS Code (Windows ou Mac) | Un run qui avance sans réglage caché ni blocage silencieux, et une reprise après interruption (lot 10) |
| Développeur sous Claude Code ou Copilot CLI | Le même run, plus rapide quand l'hôte le permet |
| Développeur dont un script ne marche pas chez lui | Remplacer une commande dans `skraft-config.json` sans attendre une release |
| Équipe de qualification | Le plan de test et les preuves de couverture et de mutation |
| Mainteneur de SKRAFT | Un moteur testé, mutable sans peur, où chaque contrôle a une valeur prouvée |

## Pour aller plus loin

- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) — le moteur, les pilotes d'hôte, la profondeur 1.
- [Garde-fous : du hook au moteur]({{ "/fr/explanation/hooks" | relative_url }}) — pourquoi la V2 part de zéro hook.
- [État et reprise]({{ "/fr/explanation/hve-core" | relative_url }}) — le journal chaîné.
- [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}).

## Sources

- Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.
- Martin, R. C., *Clean Architecture*, 2017.
