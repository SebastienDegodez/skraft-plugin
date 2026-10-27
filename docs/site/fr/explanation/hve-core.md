---
layout: doc
lang: fr
title: "État et reprise"
persona: tech-lead
description: "Pourquoi SKRAFT V2 remplace state.json par un journal d'événements chaîné, d'où l'état est recalculé, et comment cela permet une reprise exacte et la détection des écarts."
---

# État et reprise

> Le moteur n'écrit pas un état ; il écrit des faits. L'état se recalcule à chaque lecture,
> et la reprise repart du dernier fait enregistré.

## Le problème : un état que tout le monde peut écrire

En v1, l'état du pipeline tenait dans `.copilot-tracking/skraft-plans/<slug>/state.json` :
phase courante, verdicts, compteurs de reprise. C'était un instantané, réécrit à chaque
transition.

Un instantané a trois faiblesses :

- il ne dit pas **comment** on en est arrivé là ;
- une écriture à la main, ou par un agent passant par le shell, est indiscernable d'une
  écriture légitime ; la v1 avait besoin d'un hook (G7) pour l'interdire, et ce hook ne
  lisait que les commandes POSIX ;
- deux runs qui écrivent en même temps s'écrasent sans le savoir.

## Un journal d'événements à la place

La V2 remplace `state.json` par `events.jsonl`, dans le même dossier de suivi. C'est un
**journal d'événements** : un objet JSON par ligne, un événement par fait. Le run démarre
(`run.started`), une étape est lancée (`step.started`), son résultat est enregistré
(`step.recorded`), une phase se clôt (`phase.closed`), le run s'arrête ou finit
(`run.stopped`, `run.finished`), une gate tourne (`gate.ran`), une question est posée à un
humain puis répondue (`question.asked`, `question.answered`). Chaque événement porte son
type et son heure.

Le moteur écrit chaque fait dans le journal avant de décider de la suite. Il ne modifie
jamais une ligne déjà écrite : il ajoute.

> « At its heart is the notion that you can use a different model to update information than the model you use to read information. »
> — Fowler, M., *Bliki: CQRS*, 2011.

## L'état est recalculé à la lecture

Le journal est le modèle d'écriture. L'état (phase en cours, tentative, sorties manquantes,
statut du run) est le modèle de lecture : le moteur le recalcule à chaque lecture en
rejouant les événements. Aucun fichier d'état ne peut donc diverger du journal.

`skraft status` et le panneau « Skraft » du mod Claude Code lisent cette même vue
recalculée ; le panneau dessine aussi le graphe du workflow et répond à une question en
attente par un bouton. Après chaque étape, le moteur en tire `WORKFLOW.md`, `run-report.md` et
`qa-report.md`. Un Canvas Copilot qui dessine la même vue n'est pas encore livré.

## Reprise exacte, sans rejouer un agent fini

Un run interrompu (hôte fermé, machine éteinte, agent arrêté) reprend là où il s'était
arrêté : le moteur relit le journal et recalcule l'étape suivante. Rien n'est rejoué « pour
voir ».

- Une étape lancée dont la sortie est déjà remplie est enregistrée sans relancer l'agent.
- Une étape lancée dont la sortie manque relance l'agent, dans la même tentative.
- Un agent que l'hôte n'a pas pu lancer (`agent-unavailable`) ne consomme pas sa tentative :
  la reprise le relance.
- La base de comparaison git est journalisée au premier démarrage du slug ; une reprise
  garde celle-là.
- Une question sans réponse met le run en attente ; le relancer repose la même question, avec
  la même clé, et ne lance aucun agent. Une fois répondue, le run applique la réponse et
  continue. Un run interrompu à n'importe quel point de décision reprend de la même façon.

Un run que la v1 a laissé en cours reprend aussi : `skraft migrate` lui donne un journal signé
(ses phases terminées closes, sa phase en cours qui repart de son premier nœud, `state.json`
laissé tel quel), puis `skraft init <slug>` le reprend.

## Une chaîne de hachage pour détecter une modification

Chaque ligne du journal porte dans `prev` l'empreinte SHA-256 de la ligne précédente
(`null` pour la première). Modifier, supprimer ou insérer une ligne casse la chaîne.

À la lecture suivante, le moteur le voit et s'arrête sur `journal-tampered`, en nommant la
ligne fautive : il faut restaurer le fichier ou démarrer un nouveau slug. Le moteur ne
« répare » rien et ne devine rien. Ce contrôle remplace le hook G7, sans coût par appel
d'outil et de la même façon sur tous les hôtes.

Une chaîne seule se recalcule par qui modifie le fichier. Chaque ligne se termine donc aussi
par `sig`, un HMAC de la ligne sous la clé du run ; la première ligne nomme cette clé
(`keyId`), rangée dans `~/.skraft/journal-keys/` sur la machine qui a démarré le run. Une
signature fausse arrête le run sur `journal-tampered`. Un journal dont cette machine n'a pas la
clé (un run démarré ailleurs) s'arrête sur `journal-unverifiable` ; `skraft journal adopt`,
tapé et confirmé par une personne, le signe à partir de là sous une clé de cette machine et
laisse les lignes antérieures telles quelles.

## Un second run qui écrit en même temps

Si un autre run écrit dans le même journal pendant que celui-ci tourne, le moteur s'en
aperçoit au moment d'ajouter son propre fait et s'arrête sur `journal-changed`. Deux runs ne
peuvent pas s'écraser en silence ; on relance une fois l'autre run arrêté.

Avant cela, un run prend un **bail** sur son pipeline, `<slug>/.lock`, et le renouvelle toutes
les 30 secondes tant qu'il le pilote. Une deuxième session sur le même pipeline est refusée
(`pipeline-locked`) tant que le bail est renouvelé ; un bail non renouvelé depuis deux minutes
est la trace d'une session disparue, et le run suivant le reprend. Une session qui a perdu son
bail s'arrête (`lock-lost`). Quand la boucle VS Code confie des agents, le bail reste laissé le
temps de leur travail, et `skraft record` le reprend.

## `.active-slug` : jamais deviné

`.copilot-tracking/skraft-plans/.active-slug` désigne le pipeline actif de la copie de
travail. Il est obligatoire. Sans lui, le moteur refuse (`no-active-pipeline`) au lieu de
choisir le dernier dossier venu. On change de pipeline par un démarrage explicite :
`/skraft <slug>`, `skraft init <slug>` ou le workflow avec `slug` rendent ce slug actif avant
de lancer quoi que ce soit. Un appel qui nommerait un autre slug que l'actif sans cet init
serait refusé (`slug-mismatch`) ; c'est un garde-fou interne, qu'aucune commande actuelle ne
déclenche. Ni le moteur ni un
agent ne choisissent un slug à la place du développeur.

## Un pipeline par worktree

Chaque worktree git a son propre `.copilot-tracking/`, donc son propre `.active-slug` et ses
propres journaux. Deux stories avancent en parallèle dans deux worktrees sans partager
d'état.

## Pour aller plus loin

- [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }}).
- [Référence : dossier de suivi, events.jsonl, codes]({{ "/fr/reference/run-journal" | relative_url }}).
- [Garde-fous : du hook au moteur]({{ "/fr/explanation/hooks" | relative_url }}).
- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}).

## Sources

- Fowler, M., *Bliki: CQRS*, 2011.
