---
title: "Le REPL d'une tentative : skraft_repl"
description: "Le REPL JavaScript où un agent lance ses commandes de projet : l'API d'une cellule, la trace signée de chaque run, les limites, les refus, le non mesuré."
persona: software-engineer
---

# Le REPL d'une tentative : `skraft_repl`

`skraft_repl` est un [outil MCP](./mcp-server.md) qui donne à l'agent d'une tentative ouverte un REPL JavaScript (node) persistant. L'agent y lance les commandes de son projet (build, format, lint, test, architecture, couverture, bout en bout), et le moteur note ce que chaque programme a fait. Le moteur n'exige encore aucun de ces runs : la trace est un enregistrement, qu'un changement ultérieur vérifiera.

Pourquoi le moteur enregistre les runs au lieu de lire ce qu'un agent en dit : [Architecture](../explanation/architecture.md).

:::caution[Non vérifié sur V2]
Mesuré : un premier appel de l'outil sous `claude -p`, Claude Code 2.1.325 (macOS), est refusé tant
que la session n'autorise pas l'outil par son nom, puis atteint le moteur, `Bash` étant refusé.
Non mesuré : la persistance de « toujours autoriser », une session interactive, l'autopilote,
VS Code, Copilot CLI (quelles sessions d'agent reçoivent l'outil, en headless, est mesuré ; s'il
demande avant un appel ne l'est pas), le délai d'appel MCP de l'hôte, et si un hôte envoie
`notifications/cancelled`. Windows : le choix du shell et l'arrêt de l'arbre sont écrits, pas
lancés. Voir `docs/v2/host-verification.md`.
:::

## Qui le reçoit, et quand <!-- #who -->

| Règle | Détail |
| --- | --- |
| Agents | le concepteur d'acceptation et l'ingénieur logiciel, dont les descripteurs nomment l'outil ; jamais une lentille de revue |
| Tentative | l'appel est lié à la tentative ouverte du run actif : sans tentative ouverte, ou pour un agent qui ne commite aucun code, il est refusé par `repl-unavailable` |
| Noyau | un processus enfant par tentative, démarré au premier appel et arrêté quand la tentative se ferme, quand une autre tentative appelle, après 15 minutes sans usage, sans cellule ni run vivants, quand la session se ferme ou quand le noyau meurt. Il doit se dire prêt en dix secondes, sinon l'appel répond `repl-failed` ; il tourne avec ses propres options Node, jamais celles du serveur, et un tas de 2 Gio au plus : au-delà le noyau s'arrête et l'appel répond `repl-crashed`. Un noyau s'arrête avec tous les processus que ses cellules ont lancés elles-mêmes : son groupe de processus sous POSIX, son arbre sous Windows |
| Concurrence | l'appel n'attend pas dans la file du serveur : `skraft_status` et `skraft_precheck` répondent pendant qu'une cellule tourne ; deux appels envoyés ensemble partagent un seul noyau, le second attendant son démarrage ; un second appel pendant une cellule est refusé par `repl-busy` ; une annulation nomme sa requête et n'atteint que cet appel |
| Bail | `logs/runs/<étape>-<visite>-<tentative>/.lock` nomme le serveur qui tient le REPL de la tentative ; le serveur le renouvelle toutes les 30 secondes. Un autre serveur est refusé par `repl-held-elsewhere`, sauf si le détenteur a disparu (le système dit qu'aucun processus ne tourne sous son pid, ou qu'un processus démarré à une autre heure y tourne) ou n'a pas renouvelé le bail depuis cinq minutes ; un détenteur dont l'heure de démarrage ne peut pas être lue n'est jamais tenu pour disparu |

## Ce qu'une cellule peut faire <!-- #cell -->

La cellule est du JavaScript. Les variables restent d'un appel au suivant et une cellule peut faire `await` au premier niveau.

| Nom | Fait |
| --- | --- |
| `run(command, { cwd = '.', timeout = 600, gate, label })` | lance un programme et rend aussitôt une poignée. `command` est un tableau argv (sans shell) ou une chaîne, exécutée par `sh -c` ; sous Windows par Git Bash s'il est installé, sinon par `pwsh` ou `powershell`. `cwd` est relatif à la copie de travail et n'en sort jamais. `timeout` est en secondes, de 1 à 7200. Toute autre option est refusée, et le run ne démarre pas (la trace le note non démarré). Huit runs d'une tentative vivent à la fois au plus : un neuvième ne démarre pas |
| poignée | `id`, `command`, `running`, `tail(n = 50)`, `output()`, `poll()` (le résultat, ou `null` tant qu'il tourne), `kill(signal = 'SIGTERM', grace = 5)` (`SIGTERM`, `SIGINT` ou `SIGKILL`, une grâce de 0 à 30 secondes entières, jamais au-delà du délai du run ; tout autre rend un refus fixe et le programme continue) ; `await handle` donne `{ exitCode, output, durationMs, head, log }` (`head` : le HEAD du dépôt qui contient `cwd` à la fin du programme, la valeur de `headAfter` dans la trace) |
| `gate(name, command, options)` | `run` avec la gate nommée : `build`, `format`, `lint`, `test`, `architecture`, `coverage` ou `e2e` |
| `absent(gate, component, reason)` | déclare que l'`AGENTS.md` du projet ne nomme aucune gate de ce nom pour le composant |
| `console.log` | écrit dans le résultat de l'appel |

Un appel prend `code` (vide pour attendre la cellule en cours), `reset` et `workspace` ; tout autre argument est refusé. `reset: true` arrête le noyau et ses runs, même pendant une cellule, démarre un noyau neuf et y exécute `code` ; son résultat commence par `repl-reset`.

Une cellule vit 7260 secondes au plus (le plus long run et une minute) : au-delà elle est interrompue, son noyau redémarré trois secondes plus tard si elle tourne encore, et l'appel suivant répond `repl-restarted`.

Une cellule qui dépasse 90 secondes répond avec ce qu'elle a affiché, ses runs continuent. Un appel au code vide attend alors la cellule et en rend la fin. Un run fini pendant qu'une autre cellule continue est annoncé en tête du résultat suivant (`[run-done r3 exit 0 …]`).

## Ce que l'agent relit <!-- #result -->

Le résultat contient, dans l'ordre, 24 Kio au plus : les runs finis depuis le dernier appel, ce que la cellule a affiché, une ligne par run qu'elle a lancé (id, fin, durée, commande, journal), puis la valeur finale inspectée à la profondeur 2 ou l'erreur de la cellule. Ce qui est coupé vit en entier dans `cell-<n>.log` à côté des runs, et le résultat le nomme. Le journal d'un run s'écrit pendant que le programme tourne, on peut donc le lire pendant le run ; il contient les 64 premiers Mio de la sortie, et la ligne `run` dit quand le reste a été coupé (`cut`). Son SHA-256 se calcule à mesure qu'il s'écrit. Chaque ligne de `runs.jsonl` est ajoutée à la fin ; une ligne ou un journal qui ne peut pas s'écrire met `repl-trace-failed` en tête de chaque résultat suivant, qui nomme le `logs/unexpected.log` du run.

## La trace <!-- #trace -->

Le serveur, pas la cellule, lance chaque programme et écrit `runs.jsonl` dans le dossier de la tentative `logs/runs/<étape>-<visite>-<tentative>/` :

| Ligne | Quand | Contient |
| --- | --- | --- |
| `start` | un programme démarre | id du run, cellule, commande, dossier (relatif à la copie de travail, `/` entre ses parties, `.` pour la copie de travail elle-même), gate, étiquette |
| `run` | il se termine | l'argv réellement lancé et le shell, le code de sortie, le signal, s'il a dépassé son délai ou été tué, la taille de sa sortie et si elle a été coupée, le SHA-256 de son journal, le `HEAD` Git du dépôt qui contient son dossier avant et après, et si l'arbre était propre au départ |
| `absent` | une gate est déclarée absente | gate, composant, raison |

Un arbre est propre quand Git ne liste aucun fichier non commité hors du dossier de suivi. Chaque ligne se termine par un HMAC de la clé du journal du run, gardée hors de la copie de travail : la trace montre une altération, elle ne l'empêche pas, car une commande lancée par un agent peut lire la clé aussi.

## Limites et refus <!-- #limits -->

| Code | Signifie |
| --- | --- |
| `repl-unavailable` | pas de tentative ouverte, ou un agent qui ne commite aucun code |
| `repl-busy` | une cellule de la tentative tourne encore |
| `repl-held-elsewhere` | un autre serveur tient le REPL de la tentative |
| `repl-restarted` | une cellule ne s'arrêtait pas et le noyau a été arrêté : ses variables sont perdues |
| `repl-crashed` | le noyau s'est arrêté seul : ses variables sont perdues |
| `repl-trace-failed` | en tête de chaque résultat dès qu'une ligne de la trace ou le journal d'un run n'a pas pu s'écrire : la trace est incomplète |
| `repl-reset` | en tête du résultat d'un appel avec `reset: true` : le noyau a été arrêté et un neuf démarré, ses variables sont perdues |
| `repl-failed` | le noyau n'a pas pu démarrer ; le refus nomme le `logs/unexpected.log` du run, qui dit pourquoi |
| `repl-unexpected` | skraft lui-même a échoué pendant l'appel ; le refus nomme le `logs/unexpected.log` du run, qui contient l'exception |

Les textes sont fixés par le moteur. Le résultat d'une cellule porte la sortie et les erreurs de la cellule, seul endroit où la règle des messages fixes du moteur ne s'applique pas ; une exception du moteur lui-même va au `logs/unexpected.log` du run, que rien ne relit et que le refus nomme. Une exception levée avant que l'appel soit lié à une tentative va au journal du serveur, et l'appel répond un texte fixe. Une annulation de la requête (`notifications/cancelled`) arrête les attentes de la cellule, termine les runs qu'elle a lancés et répond `interrupted` ; une annulation reçue avant que l'appel ait lancé sa cellule est conservée : la cellule ne tourne jamais et l'appel répond `repl-interrupted` ; une cellule qui ne s'arrête toujours pas au bout de trois secondes termine le noyau. Une interruption ne peut pas casser une boucle synchrone : elle termine le noyau. Arrêter un noyau termine ses runs par SIGKILL et les attend dix secondes au plus ; un run demandé pendant que le noyau s'arrête ne démarre jamais, et la trace le note non démarré (`the attempt's REPL was ended`).

Chaque programme tourne avec les droits du développeur, comme dans `Bash` : le REPL n'est pas un bac à sable. Un serveur tué sans nettoyage laisse ses programmes dans `.copilot-tracking/skraft-repl/<pid>.json` ; le serveur suivant qui démarre un noyau termine ceux dont l'heure de démarrage enregistrée correspond encore, jamais un processus que le système a réutilisé. L'heure de démarrage de chaque processus est demandée au système (`ps`, PowerShell sous Windows) une seule fois, pendant que le serveur continue de répondre à ses autres appels. Ce journal reste sous `.copilot-tracking/skraft-repl/`, hors du dossier de suivi de toute story : il appartient au serveur, pas à un run.
