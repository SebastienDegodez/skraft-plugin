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
qu'un agent doit remplir, contrôle qu'il est rempli, relance l'agent avec la liste de ce qui
manque (trois tentatives au plus), puis s'arrête en nommant la cause. Il vérifie aussi après
chaque étape que l'agent n'a écrit que là où il le peut, et que chaque commit rouge du TDD
échoue vraiment. Aucun agent ne lance un autre agent :
seul le **pilote d'hôte** (la partie de SKRAFT propre à chaque outil) lance les agents, sur
ordre du moteur.

### Le même pipeline sur chaque outil et chaque système

Le même moteur tourne dans Claude Code (par un mod), dans GitHub Copilot CLI (par un
workflow dynamique) et dans VS Code (par le SDK Copilot, ou par une boucle de repli conduite
par l'agent quand le SDK manque). Les commandes passent sans shell, avec la même forme sous sh
et PowerShell. Les tests du moteur tournent sous Windows, macOS et Linux.

### Une traçabilité auditable

Chaque run écrit un **journal d'événements** : une ligne par fait (étape lancée, résultat
enregistré, phase close, gate lancée). Chaque ligne porte l'empreinte SHA-256 de la ligne
précédente et une signature sous une clé de la machine qui le fait tourner. Une
modification à la main casse cette chaîne et le moteur s'arrête en le disant. Les **preuves de gate** (commande, dossier, résultat, sorties) sont écrites par le
moteur, jamais par le modèle.

### Des équipes autonomes, sans attendre une release

Chaque dépôt décrit ses composants et leurs commandes dans `skraft-config.json` : build,
test, format, lint, couverture, architecture, mutation. SKRAFT détecte les projets
(.NET, Java, Python, TypeScript, JavaScript, React), propose des commandes par défaut, et
vérifie que chacune peut tourner. Une commande écrite par l'équipe est toujours celle qui
tourne. Les seuils de qualité, eux, ne se négocient pas : ils ne sont pas configurables.

### De quoi qualifier le livrable

Les gates de couverture et de mutation laissent leurs preuves dans le dossier du run. La
mutation doit atteindre 100 % sur le cœur métier et 80 % ailleurs ; le moteur renvoie les
mutants survivants à l'ingénieur, fichier par fichier, jusqu'à la barre ou jusqu'à un arrêt
qui nomme ce qui reste. `qa-report.md` rassemble pour l'équipe de qualification le plan de
test, les gates, les scores de mutation et les verdicts de revue ; `run-report.md` donne le
temps, le coût et les relances de chaque étape. Le run se termine par une pull request décrite
depuis le journal, avec les captures d'un front.

### Un coût maîtrisé

La V2 ne livre aucun hook de commande : aucun programme ne se lance à chaque appel d'outil.
Les prompts des agents ne portent plus ce que le moteur vérifie déjà : ils ne paient plus pour
lire des consignes qu'un programme applique. Le modèle de chaque agent est une famille choisie
dans la configuration : une économique pour les lentilles de revue, une plus forte là où la
planification le demande.

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
   le plugin `skraft` dans Claude Code, GitHub Copilot CLI ou VS Code. Prérequis : Node 22 ou plus
   et Git ; Docker si un composant mocke ses dépendances avec Microcks (le défaut hors TypeScript, JavaScript et React).
2. **Décrire et vérifier les composants.** `skraft init` détecte les projets et écrit
   `skraft-config.json` ; `skraft doctor` vérifie que chaque commande peut tourner. L'équipe
   corrige les commandes qui ne marchent pas chez elle.
3. **Un premier run.** Lancez une story et lisez ce qu'elle laisse : le document de
   recherche, les ADR, les tests d'acceptation, le code livré, `qa-report.md` et la pull
   request en brouillon.
4. **Étendre.** Ajoutez des dépôts et des équipes ; adaptez le workflow dans `.skraft/` là où
   une équipe a besoin d'un agent, d'une lentille ou d'une question de plus.

Le [tutoriel des premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}) fait ce
parcours pas à pas.

## Disponible aujourd'hui et feuille de route

**Aujourd'hui** : les quatre phases RESEARCH, DESIGN, DISTILL et DELIVER conduites par le
moteur dans Claude Code, Copilot CLI et VS Code ; un workflow personnalisable ; les droits
d'écriture vérifiés par diff git à chaque étape ; la revue en code par lentilles isolées, avec
un verdict calculé par le moteur ; les décisions humaines (ratification d'ADR, escalades) ; la
boucle de clôture mutation ; le panneau Claude Code, le rapport de run et le rapport QA ; la
pull request de fin de run avec ses captures et son commentaire d'issue ; le plugin
`skraft-brownfield` pour le code existant ; `skraft review --pr` pour revoir une pull request
quelconque avec les mêmes lentilles ; `skraft migrate` pour les runs commencés en v1.

**À venir pour la 2.0.0** : une vue Canvas Copilot, et la comparaison finale v1/V2 sur toutes
les fixtures.

## Pour qui

| Rôle | Ce que SKRAFT lui apporte |
| --- | --- |
| Direction technique, responsable d'équipe | Une méthode identique dans toutes les équipes, et une trace vérifiable de chaque run |
| Développeur sous VS Code (Windows ou Mac) | Un run qui avance sans réglage caché ni blocage silencieux, et une reprise après interruption |
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
