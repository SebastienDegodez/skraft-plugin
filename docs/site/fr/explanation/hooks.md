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

Résultat : `hooks/hooks.json` ne déclare que le module du mod Claude Code. Aucun hook de
commande n'est livré.

## Ce qui remplace chaque garde-fou

| Garde-fou v1 | En V2 | Disponible |
| --- | --- | --- |
| SessionStart (export de `SKRAFT_PLUGIN_ROOT`, purge des journaux) | Retiré : plus aucune variable d'environnement nécessaire, le moteur donne des chemins absolus. La purge doit devenir une commande `skraft housekeeping` | Variable : oui. Purge : prévue par le plan, pas encore disponible |
| Provenance des lancements | Retirée : elle n'avait jamais le nom de l'appelant. Seul le pilote lance des agents | Oui |
| G1 ordre des phases, G9 complétude du brief | Dans le moteur, qui calcule l'étape suivante et compose le brief | Oui pour RESEARCH ; DESIGN, DISTILL, DELIVER au lot 3 |
| G2 injection des skills | En-tête `skills:` sous Claude Code ; ailleurs, chemins absolus des skills obligatoires dans le brief | Lot 6 |
| G3 contrôle à l'arrêt du sous-agent, trace G3 | Retirés ; le chargement réel des skills est mesuré par les évaluations Vally | Oui |
| Journal de lancement | Événements du moteur dans `events.jsonl` | Oui |
| G7 écriture directe de l'état | Chaîne de hachage du journal, vérifiée à la lecture suivante | Oui |
| G8 droits d'écriture | Diff git du moteur après chaque étape ; l'orchestrateur n'a pas d'outil d'édition | Lot 3 |

> **À venir.** Le contrôle des droits d'écriture par diff git, étape par étape, est prévu au
> lot 3. Jusque-là, seule RESEARCH tourne par le moteur.

## Prévenir ou détecter

Un hook **prévient** : il refuse l'appel d'outil avant qu'il ait lieu. Le moteur
**détecte** : il constate après l'étape qu'un fichier a été modifié à la main, que la sortie
manque, ou (au lot 3) qu'un agent a écrit hors de son périmètre, et il arrête le run en le
disant.

C'est un choix assumé. Sans hook, un agent lancé à la main hors du moteur n'est pas arrêté
pendant qu'il travaille ; l'écart est découvert ensuite, par la chaîne de hachage ou le diff
git. En échange, le contrôle est le même sur tous les hôtes, se teste sans hôte, et ne coûte
rien aux appels d'outil.

## Quand un hook peut revenir

Un hook revient seulement s'il remplit les trois conditions :

1. il protège une action **irréversible** que le moteur ne peut pas détecter après coup ;
2. son coût par appel est **mesuré** ;
3. il marche sur Claude Code, Copilot CLI et VS Code, ou documente son comportement d'échec
   sur chacun.

> **À venir.** La mesure sur des runs réels, qui dira si un hook doit revenir, est prévue au
> lot 10.

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
- [État et reprise]({{ "/fr/explanation/hve-core" | relative_url }}) — la chaîne de hachage qui remplace G7.
- [Référence : dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}).
- [Lancer les gates et lire leurs preuves]({{ "/fr/how-to/run-gates" | relative_url }}).

## Sources

- Wiegers, K., *Peer Reviews in Software*, 2002.
