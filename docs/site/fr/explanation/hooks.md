---
layout: doc
lang: fr
title: "Garde-fous : du hook au moteur"
description: "Pourquoi SKRAFT V2 part de zéro hook, ce qui remplace chaque garde-fou de la v1, et à quelle condition un hook peut revenir."
sidebar_position: 18
persona: tech-lead
---

# Garde-fous : du hook au moteur

> En v1, des hooks surveillaient l'agent à chaque appel d'outil. En V2, le moteur qui lance
> l'agent vérifie lui-même ce qui compte, avant et après chaque étape.

## Ce qu'était un garde-fou en v1

Un **hook** est un programme que l'hôte lance sur un événement : avant un appel d'outil,
au démarrage ou à l'arrêt d'un sous-agent, à l'ouverture d'une session. La v1 s'en servait
pour faire respecter ses invariants : ordre des phases (G1), skills chargées (G2, G3),
écriture directe dans `state.json` interdite (G7), droits d'écriture de l'orchestrateur
(G8), complétude du brief d'un agent (G9).

L'idée était juste : un invariant ne vaut que s'il est appliqué mécaniquement. Ce qui a
changé, c'est l'endroit où l'appliquer.

## Pourquoi la V2 part de zéro hook

### Un coût à chaque appel d'outil

La v1 déclarait cinq entrées de hook sans filtre : chaque appel d'outil lançait un processus
`node`, sur chaque hôte, pour chaque agent. Ce coût se payait même quand aucun invariant
n'était en jeu. La V2 vise 0 ms de surcoût par appel d'outil.

### Un comportement inégal selon l'hôte

Un hook dépend de ce que l'hôte lui transmet et de la façon dont il respecte sa réponse.
Relevé sur la v1 :

- la provenance d'un lancement ne voyait jamais le nom de l'agent appelant ;
- la trace de G3 restait inerte sous Claude Code ;
- G8 bloquait DELIVER sous Copilot ;
- G7 ne lisait que les commandes shell POSIX, pas PowerShell.

Un même pipeline se comportait donc différemment selon l'outil. C'est le contraire de ce que
SKRAFT promet.

### Des contrôles que le moteur fait déjà

En V2, le moteur compose lui-même le brief de chaque agent, fixe ses sorties, et écrit le
journal. Il n'a plus besoin de surveiller un modèle qui écrirait l'état par le shell : l'état
n'est plus un fichier que l'agent modifie, c'est un journal que le moteur relit et vérifie.

Résultat : aucun hook de commande n'est livré. `hooks/hooks.json` tient en une ligne,
`{ "modules": ["./skraft-mod.tsx"] }` : il déclare le **module du mod Claude Code**, le code qui
donne à Claude Code la commande `/skraft`, l'outil `run_pipeline` et le panneau Skraft. Ce module
ne lance rien à un appel d'outil ; il pilote le moteur, comme le workflow Copilot sous Copilot.

## Ce qui remplace chaque garde-fou

| Garde-fou v1 | En V2 |
| --- | --- |
| SessionStart (export de `SKRAFT_PLUGIN_ROOT`, purge des journaux) | Retiré : plus aucune variable d'environnement nécessaire, le moteur donne des chemins absolus dans chaque brief. Rien ne remplace encore la purge |
| Provenance des lancements | Retirée : elle n'avait jamais le nom de l'appelant. Seul le pilote lance des agents, et aucun agent n'en lance un autre |
| G1 ordre des phases | Le moteur calcule l'étape suivante depuis le graphe du workflow et le journal ; un agent ne démarre que quand le run atteint son nœud |
| G9 complétude du brief | Le moteur compose lui-même le brief, avec le chemin absolu de chaque entrée et de chaque sortie |
| G2 injection des skills | Le brief liste les skills que l'agent lit avant de commencer, par chemin absolu, sur tous les hôtes |
| G3 contrôle à l'arrêt du sous-agent, trace G3 | Retirés ; le chargement réel des skills est mesuré par les évaluations Vally |
| Journal de lancement | Événements du moteur dans `events.jsonl` |
| G4 / G5 artefacts, verdict, commit | Sorties attendues pré-créées puis vérifiées ; verdict de revue calculé par le moteur ; convention de commit et commits rouges du TDD vérifiés après chaque étape |
| G7 écriture directe de l'état | Chaîne de hachage et signature du journal, vérifiées à chaque lecture ; une modification à la main arrête le run |
| G8 droits d'écriture | Diff git du moteur après chaque étape, comparé à ce que l'agent peut écrire. Sous Claude Code, l'orchestrateur n'a pas d'outil d'édition ; sous VS Code, il n'écrit que les fichiers de réponse que la boucle d'agent liste |

Deux contrôles n'ont pas d'équivalent en v1 : le **bail de session**, qui refuse une deuxième
session sur un run qu'une autre pilote, et les **nœuds verrouillés et obligatoires** du workflow,
qu'une copie du dépôt ne peut pas retirer en silence.

## Prévenir ou détecter

Un hook **prévient** : il refuse l'appel d'outil avant qu'il ait lieu. Le moteur
**détecte** : il constate après l'étape qu'un fichier a été modifié à la main, qu'une sortie
manque, qu'un agent a écrit hors de son périmètre ou commité un test rouge qui passe, et il
refuse l'étape ou arrête le run en le disant.

C'est un choix assumé. Sans hook, un agent lancé à la main hors du moteur n'est pas arrêté
pendant qu'il travaille ; l'écart est découvert ensuite, par le journal ou le diff git. En
échange, le contrôle est le même sur tous les hôtes, se teste sans hôte, et ne coûte rien aux
appels d'outil.

## Quand un hook peut revenir

Un hook revient seulement s'il remplit les trois conditions :

1. il protège une action **irréversible** que le moteur ne peut pas détecter après coup ;
2. son coût par appel est **mesuré** ;
3. il marche sur Claude Code, Copilot CLI et VS Code, ou documente son comportement d'échec
   sur chacun.

Aucun hook n'a rempli ces conditions à ce jour.

## Ce qu'aucun garde-fou ne couvre

Ni un hook ni le moteur ne détectent une **erreur factuelle** : une règle métier inventée, un
endpoint qui n'existe pas, une connaissance du domaine fausse dans un test. Ils contrôlent
la structure du travail (ordre, sorties, intégrité, gates), pas la vérité de son contenu.
Cela reste le rôle de la revue et des tests d'acceptation métier.

Wiegers (*Peer Reviews in Software*, 2002) range la revue par les pairs parmi les pratiques
qualité les plus efficaces : c'est elle, pas un garde-fou mécanique, qui attrape ce type
d'erreur.

## Pour aller plus loin

- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) — le moteur, les pilotes, la profondeur 1.
- [État et reprise]({{ "/fr/explanation/hve-core" | relative_url }}) — la chaîne de hachage signée qui remplace G7.
- [Référence : dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}).
- [Lancer les gates et lire leurs preuves]({{ "/fr/how-to/run-gates" | relative_url }}).

## Sources

- Wiegers, K., *Peer Reviews in Software*, 2002.
