---
title: "Le serveur MCP de skraft"
description: "Le serveur MCP du plugin : comment l'hôte le démarre, ses outils et prompts, ceux offerts par hôte, le dossier de travail d'un outil et les refus."
persona: software-engineer
---

# Le serveur MCP de skraft

Le plugin skraft livre un serveur MCP qui offre les [commandes skraft](./cli.md) à un hôte d'agents comme outils : chaque outil exécute la ligne de commande qu'il représente, dans le même processus, et répond ce que cette commande affiche.

Pourquoi le moteur décide et un pilote ne fait qu'exécuter : [Architecture](../explanation/architecture.md).

:::caution[Non vérifié sur V2]
Seul GitHub Copilot CLI 1.0.105 a été mesuré en train de charger ce serveur : il lit `mcp.json`,
démarre le serveur une fois et ne reçoit pas la boucle d'agent. Sous VS Code et Claude Code, le
manifeste, le nom que l'hôte donne à la poignée de main et les noms sous lesquels un hôte montre
les outils et les prompts sont lus dans les spécifications et les sources, pas observés.
:::

## Comment un hôte le démarre <!-- #start -->

L'hôte démarre le serveur quand il charge le plugin ; une personne ne le tape jamais. La ligne
qu'il exécute est `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs" mcp`.

| Hôte | Manifeste | Dossier du plugin dans la ligne |
| --- | --- | --- |
| GitHub Copilot CLI, VS Code | `mcp.json` à la racine du plugin (Agent Plugins 1.0.0) | `${PLUGIN_ROOT}` |
| Claude Code | `mcpServers` de `.claude-plugin/plugin.json` | `${CLAUDE_PLUGIN_ROOT}` |

Le serveur parle JSON-RPC 2.0 sur stdin et stdout, un message par ligne, versions de protocole
`2025-11-25`, `2025-06-18`, `2025-03-26` et `2024-11-05`. Il n'écrit que le protocole sur stdout ;
son journal va sur stderr. Il s'arrête quand l'hôte ferme stdin, une fois finis les appels en
cours.

## Outils <!-- #tools -->

Chaque outil prend aussi `workspace` ([le dossier où travaille un outil](#workspace)). Sa réponse
est le stdout de la commande, puis son journal ; c'est une erreur seulement quand la commande a
échoué sans afficher de réponse, si bien qu'un doctor ou un gate en échec répond quand même son
JSON.

| Outil | Arguments | Ligne de commande | Offert à |
| --- | --- | --- | --- |
| `skraft_doctor` | `run?`, `base?` | `doctor [--run] [--base <ref>] --json` | tout hôte |
| `skraft_init` | `add?` (dossiers) | `init [--add <folder>]...` | tout hôte |
| `skraft_start` | `slug`, `issue?`, `title?`, `base?`, `fromArtifacts?` | `init <slug> [--issue <n>] [--title <t>] [--base <ref>] [--from-artifacts]` | VS Code |
| `skraft_next` | — | `next --json` | VS Code |
| `skraft_record` | — | `record --json` | VS Code |
| `skraft_status` | — | `status --json` | tout hôte |
| `skraft_report` | — | `report --json` | tout hôte |
| `skraft_journal` | `last?` | `journal show [--last <n>] --json` | tout hôte |
| `skraft_gate` | `all?` | `gate [--all] --json` | tout hôte |
| `skraft_review` | `pr`, `record?` | `review --pr <n> [--record] --json` | VS Code |
| `skraft_workflow_check` | — | `workflow check --json` | tout hôte |
| `skraft_workflow_diff` | — | `workflow diff --json` | tout hôte |
| `skraft_workflow_eject` | `review?` | `workflow eject [review]` | tout hôte |
| `skraft_migrate` | — | `migrate --dry-run --json` | tout hôte |

`skraft_status`, `skraft_report`, `skraft_journal`, `skraft_workflow_check`,
`skraft_workflow_diff` et `skraft_migrate` sont marqués en lecture seule. Les appels passent l'un
après l'autre. Quand l'hôte envoie un `progressToken`, chaque ligne du journal de la commande lui
parvient en `notifications/progress` pendant l'appel.

Une étape de `skraft_start`, `skraft_next`, `skraft_record` ou `skraft_review` nomme dans `then`
l'outil à appeler ensuite, avec le même `workspace`, par exemple
`call the skraft_record tool with {}`.

## Quel hôte reçoit la boucle d'agent <!-- #agent-loop -->

`skraft_start`, `skraft_next`, `skraft_record`, `skraft_review` et les prompts `run` et `review`
conduisent la boucle d'agent. Le serveur ne les offre qu'à un hôte qui se nomme
`Visual Studio Code` ou `Visual Studio Code - Insiders` à la poignée de main (`clientInfo.name`).

| Hôte à la poignée de main | Boucle d'agent offerte | Comment une story se déroule |
| --- | --- | --- |
| `Visual Studio Code`, `Visual Studio Code - Insiders` | oui | l'agent Skraft - Orchestrator appelle `skraft_start`, puis `skraft_next` et `skraft_record` |
| GitHub Copilot CLI | non | les workflows `skraft-pipeline` et `skraft-review` |
| Claude Code | non | `/skraft` et l'outil `run_pipeline` du mod |
| tout autre nom, ou aucun | non | la boucle d'agent par `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` |

Un outil ou un prompt non offert est refusé comme inconnu (`-32602`), et rien ne s'exécute. Les
instructions que le serveur donne à l'hôte à la poignée de main disent la même chose.

## Le dossier où travaille un outil <!-- #workspace -->

1. Les racines `file:` que l'hôte liste (`roots/list`), quand il a déclaré la capacité `roots`.
   Le serveur attend la liste 10 secondes.
2. Sinon, le dossier où l'hôte a démarré le serveur, sauf s'il est dans le plugin.
3. Avec plusieurs dossiers, `workspace` en nomme un, par son chemin ou son nom de dossier.

| Refus | Cas |
| --- | --- |
| `no-workspace` | aucune racine, et le serveur a démarré dans le plugin |
| `several-workspaces` | plusieurs racines et pas de `workspace` |
| `unknown-workspace` | `workspace` ne nomme aucun dossier partagé par l'hôte |
| `closed` | l'hôte a fermé la connexion avant que l'appel ne s'exécute |

Chaque refus est une erreur d'outil dont le texte commence par son code ; rien ne s'exécute.

## Arguments <!-- #arguments -->

Chaque outil déclare un schéma d'entrée fermé. Un argument texte est non vide et ne commence
jamais par `-` ; un nombre est un entier positif ; `add` est une liste de tels textes. Un argument
que l'outil ne prend pas, du mauvais type ou manquant est refusé avant toute exécution, et le
refus nomme l'argument, jamais la valeur écrite.

## Prompts <!-- #prompts -->

| Prompt | Arguments | Ce qu'il demande au modèle | Offert à |
| --- | --- | --- | --- |
| `init` | — | `skraft_doctor`, puis la skill `skraft-init` | tout hôte |
| `run` | `slug` (kebab-case), `issue?` | `skraft_start`, puis `skraft_next`, et les règles de la boucle | VS Code |
| `status` | — | `skraft_status` et `skraft_report`, résumés | tout hôte |
| `review` | `pr` | `skraft_review`, et les règles de la boucle | VS Code |

Un argument malformé ou manquant est refusé (`-32602`).

## Ce qui reste dans un terminal <!-- #terminal -->

`skraft decide`, `skraft publish`, `skraft review --publish`, `skraft journal adopt` et
`skraft migrate` sans `--dry-run` demandent le oui d'une personne : ce ne sont pas des outils. Une
commande qui demande une confirmation n'en reçoit aucune par le serveur, si bien qu'aucun outil
n'enregistre une décision humaine.

## Voir aussi <!-- #see-also -->

- [La ligne de commande skraft](./cli.md)
- [Installation et maintenance](./cli-maintenance.md)
- [Hôtes](./hosts.md)
