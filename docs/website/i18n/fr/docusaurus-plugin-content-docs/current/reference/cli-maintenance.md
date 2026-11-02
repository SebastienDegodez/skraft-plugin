---
title: "La ligne de commande skraft — installation et maintenance"
description: "Où skraft trouve le plugin, puis doctor, migrate, journal adopt, workflow eject|check|diff et la liste des commandes."
persona: software-engineer
---

# La ligne de commande skraft — installation et maintenance

Les commandes `skraft` qui installent, vérifient et entretiennent les runs d'un dépôt : comment la commande trouve le plugin, `doctor`, `migrate`, `journal adopt`, `workflow` et `commands`. Les commandes qui conduisent un run sont dans [La ligne de commande skraft](./cli.md), avec les codes de sortie.

## La commande `skraft` <!-- #skraft-command -->

`npm i -g @skraft/cli` installe `skraft` une fois par machine. Le paquet a sa propre version et ne
contient aucun moteur : à chaque appel, il cherche le plugin qu'un hôte a installé et importe son
`engine/drivers/cli/skraft.mjs` dans le même processus, arguments inchangés. Rien n'est
enregistré : une mise à jour du plugin par l'hôte est suivie dès l'appel suivant.

| Ordre | Où | Retenu quand |
| --- | --- | --- |
| 1 | `SKRAFT_PLUGIN_ROOT` | la variable est posée ; un dossier sans moteur arrête là, sans repli |
| 2 | `<COPILOT_HOME ou ~/.copilot>/installed-plugins/<marketplace>/skraft/` | le dossier contient le moteur ; le marketplace nommé `skraft` d'abord, puis les autres par nom |
| 3 | `installPath` des entrées `skraft@…` de `<CLAUDE_CONFIG_DIR ou ~/.claude>/plugins/installed_plugins.json` | le dossier contient le moteur ; une entrée liée à un dépôt (`local`, puis `project`, par son `projectPath`) seulement dans ce dépôt, puis celle de `user` ; à égalité, le `lastUpdated` le plus récent d'abord |

Avec `--version`, la commande écrit aussi `plugin: <variable|copilot|claude-code> <dossier>` sur
stderr ; stdout garde la ligne de version.

**Session.** `skraft` seul, dans un terminal, ouvre une session : la bannière skraft (animée, sur
stderr) une fois, puis une invite `skraft ›` où chaque ligne est une commande (`doctor`, `status`,
`decide yes`…), avec complétion par Tab et historique. Chaque ligne tourne dans son propre
processus, sur le plugin trouvé à ce moment ; pendant qu'elle tourne, Ctrl-C arrête la commande,
pas la session. `help` affiche l'usage ; `exit`, `quit` ou Ctrl-D
quitte. Une commande isolée n'affiche jamais la bannière. `NO_COLOR` la décolore,
`SKRAFT_BANNER=static` coupe l'animation, `SKRAFT_BANNER=0` la coupe ; `SKRAFT_INTERACTIVE=0`
garde `skraft` seul comme un appel au moteur.

**`skraft upgrade`.** Installe le dernier `@skraft/cli` de son canal (`latest`, ou `alpha` pour
une alpha), puis lance `copilot plugin update skraft` et `claude plugin update
skraft@<marketplace>` pour chaque hôte qui a le plugin (Claude Code le charge à la session
suivante). Un programme absent du PATH est sauté ; une étape en échec sort avec le code 1. Une
fois par jour, une session signale qu'un `@skraft/cli` plus récent existe
(`SKRAFT_UPDATE_CHECK=0` coupe la vérification ; `SKRAFT_REGISTRY` nomme un autre registre). Quand aucun plugin n'est trouvé, elle écrit sur stderr
un message fixe qui nomme les commandes d'installation et `SKRAFT_PLUGIN_ROOT`, et sort avec le
code 1.

## `skraft commands --json` <!-- #skraft-commands -->

**Effet.** Affiche chaque ligne d'usage en JSON : `{ "schema": 1, "commands": [{ "command", "synopsis"?, "summary"? }] }`,
dans l'ordre de l'usage. Le routage, l'usage et cette liste viennent d'une seule table du moteur.
La commande `skraft` la lit pour l'aide de sa session (`help`, `help <commande>`), sa complétion
par Tab (commandes, sous-commandes, options) et son « did you mean » sur une commande inconnue.
Code 0 ; tout autre argument : l'usage, code 2.

## `skraft journal adopt [--pr <number>]`

**Effet.** Signe le journal du pipeline actif à partir d'ici avec une nouvelle clé de cette
machine, quand cette machine ne peut pas le vérifier (`journal-unverifiable`) : le run a été
démarré sur une autre machine, ou avant que les journaux soient signés. La commande écrit une
ligne `journal.adopted` ; les lignes d'avant restent telles quelles, non vérifiées. Elle
demande d'abord, au terminal :

```
skraft journal adopt: sign the journal of <slug> on from here with a key of this machine, leaving unverified <lines>? [y/N]
```

`<lines>` nomme les plages de lignes et leurs types d'événement. Seul `y` adopte.

**Sortie.** Succès (stdout, code 0) : `<slug>: journal adopted with a new key of this machine;
its <n> earlier lines stay unverified`. Refus (stderr, code 1) :

| Cas | Message |
| --- | --- |
| pas de terminal interactif | `skraft journal adopt takes a person's yes: run it yourself in an interactive terminal; nothing was adopted` |
| réponse autre que `y` | `not confirmed; nothing was adopted` |
| rien à adopter | `<slug>: this machine verifies every line of the journal; there is nothing to adopt` |
| journal altéré | le message `journal-tampered` : une chaîne cassée ou une signature fausse ne s'adopte jamais |
| journal modifié après la question | `<slug>: the journal changed since you were shown what adopting it leaves unverified; run skraft journal adopt again` |
| pas de pipeline actif | `no-active-pipeline` |

Avec `--pr <numéro>`, la commande adopte de la même façon le journal de revue de cette pull request, `.copilot-tracking/skraft-reviews/pr-<numéro>/events.jsonl` ; les messages nomment alors
`pr-<numéro>` là où ils nomment `<slug>`, et un journal modifié entre-temps dit
`run skraft journal adopt --pr <number> again`. Tout autre argument après `adopt`, ou un numéro qui n'est pas un entier positif, rend la ligne mal formée (code 2).

## `skraft migrate [--dry-run] [--json]`

**Effet.** Amène à la V2, sur place, une copie de travail laissée par la v1, en deux parties :

- **`skraft-config.json`** : les clés v1 (`trackingLayout`…) sont retirées, les clés V2 gardées,
  et les composants que `skraft init` trouve sont listés ; une clé qui ne correspond à rien est
  signalée et le fichier n'est pas réécrit. L'écriture est atomique.
- **Chaque run v1 encore en cours** (`.copilot-tracking/skraft-plans/<slug>/state.json`, sans
  `events.jsonl`) reçoit un journal signé : un `run.started` marqué `migratedFrom: "v1"` sur le
  workflow en vigueur, les artefacts de ses phases terminées, un `phase.closed` par phase
  terminée ; sa phase en cours repart de son premier nœud. `state.json` n'est jamais touché. Un
  run que la v1 a fini (`DONE`) est sauté ; une migration arrêtée en route est complétée ;
  relancer la commande ne change rien (`already-migrated`).

Reprenez un run migré par `skraft init <slug>`, puis l'hôte comme d'habitude. `--dry-run`
n'écrit rien et affiche ce qu'il écrirait.

**Sortie texte** — la ligne de la configuration, puis une ligne par run, puis le résumé :

```
skraft-config.json: dropped trackingLayout; skraft init would then list the components it finds; their bases are not shown
would write skraft-config.json:
  { … }
would-migrate  checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; 1 artefact path of the completed phases dropped (outside-run 1); resume it with skraft init checkout-flow
  would append: {"type":"run.started","slug":"checkout-flow",…}
  would append: {"type":"phase.closed","phase":"RESEARCH"}
  would append: {"type":"phase.closed","phase":"DESIGN"}
skipped  shipped: the v1 run is DONE; nothing to migrate
skraft migrate: 1 to migrate (dry run: nothing written), 1 skipped, 0 refused
```

Sans `--dry-run`, chaque ligne de run commence par `migrated` et le résumé devient `skraft
migrate: N migrated, N skipped, N refused`. Un `state.json` hors du schéma v1 est refusé avec sa
raison (`refused  <slug>: state.json holds a field the v1 state schema does not declare;
nothing was migrated`).

**Code de sortie** : 0 quand rien n'attend une personne ; 1 quand un run est refusé
(`some-refused`), qu'une clé de configuration ne correspond à rien (`config-unmapped`), que les
composants n'ont pas pu être listés (`config-components-refused`), ou qu'aucun run ne peut être
migré (`journal-key-unavailable`, `config-invalid`, `workflow-invalid`, `base-unresolved`,
`source-control-unavailable`) ; 2 pour tout argument autre que `--dry-run` et `--json`. Quand
aucun run ne peut être migré, la dernière ligne est la raison du refus au lieu du résumé.

**Sortie `--json`** : `{ ok, code, reason, dryRun, config: { status, reason, … }, pipelines: [{
slug, status, code, reason, events?, dropped? }] }`, `status` = `migrated`, `would-migrate`,
`skipped` ou `refused`.

## `skraft workflow eject [review]`, `check [--json]`, `diff [--json]`

**`skraft workflow eject`** copie le `workflows/pipeline.skraft.dot` du plugin dans
`.skraft/pipeline.skraft.dot`, tamponné de la version du plugin (`skraft_version`) ; le run suit
ensuite la copie. `skraft workflow eject review` copie seulement `review.skraft.dot` dans
`.skraft/review.skraft.dot` ; chaque appel à `review` la fait tourner. Aucune des deux n'écrase
une copie.

| Cas | Sortie | Code |
| --- | --- | --- |
| copié | `.skraft/pipeline.skraft.dot holds the skraft <version> pipeline; the run follows it` (review : `… holds the skraft <version> review; every call to review runs it`) sur stdout | 0 |
| la copie existe | `<chemin> already exists; edit it, or remove it` sur stderr | 1 |

Syntaxe, règles de validité et nœuds verrouillés ou obligatoires : [Le workflow DOT](./workflow-dot.mdx).

**`skraft workflow check`** valide le workflow qu'un run suivrait (la copie du dépôt s'il y en a
une, sinon celui du plugin) et les workflows qu'il appelle, face à `skraft-config.json` : un
début et une fin, chaque nœud atteignable, `max_visits` sur toute boucle, formes et attributs
connus, agents existants, nœuds verrouillés gardés ou `unlock="<raison>"`, nœuds obligatoires
gardés.

| Cas | Sortie | Code |
| --- | --- | --- |
| valide | des lignes `warning: <avertissement>` (une famille de modèle que la configuration masque), puis `<fichier> is valid: phases RESEARCH, DESIGN, …`, suivi de `; <nœud> is unlocked and skipped: <raison>` pour chaque nœud déverrouillé | 0 |
| invalide | `skraft-config.json is invalid: …` ou les erreurs du workflow, sur stderr | 1 |

**`skraft workflow diff`** compare les copies du dépôt aux workflows du plugin sans rien
écrire : une ligne par changement, puis le résumé.

| Cas | Sortie | Code |
| --- | --- | --- |
| comparé | les changements, puis le résumé. Quand la copie porte la version du plugin : `<fichier>: N changes from the skraft <version> workflow`. Sinon le premier changement est `skraft_version <de> → <version>` (`none` quand la copie ne porte aucune version) et le résumé devient `<fichier> carries skraft_version <de>, this plugin is <version>; N changes from the skraft <version> workflow`. Avec un workflow appelé éjecté aussi, un résumé par fichier, joints par `; ` | 0 |
| rien d'éjecté | `the working copy has neither .skraft/pipeline.skraft.dot nor .skraft/review.skraft.dot; the plugin's run as shipped (skraft workflow eject [review] copies them)` sur stderr | 1 |
| copie invalide | `<fichier> is invalid: <erreurs>` sur stderr | 1 |

Avec `--json`, `check` affiche `{ ok, name, errors, unlocked: [{ node, reason }], warnings,
reason }` et `diff` affiche `{ ok, name, changes, reason }`. `eject` ne prend aucune option.

## `skraft doctor [--run] [--base <ref>] [--json]`

**Effet.** Vérifie que chaque commande de chaque composant peut tourner sur cette machine.
N'écrit rien dans le journal. La première ligne nomme la version du plugin qui répond
(`ok    plugin: skraft <version>` ; `plugin` dans le JSON) ; elle ne compte pas comme un contrôle.

| Option | Effet |
| --- | --- |
| `--run` | lance chaque commande une fois depuis la racine de son composant, avec la base calculée, et écrit ce qu'elle a affiché dans `.copilot-tracking/skraft-doctor/<composant>/<commande>.log` (remplacé à chaque lancement) |
| `--base <ref>` | ref de base pour `--run` ; sans `--run`, elle n'est pas lue |
| `--json` | sortie JSON |

Contrôles, dans l'ordre :

| Sujet | Passe si | Détail en échec |
| --- | --- | --- |
| `node` | Node 22 ou plus | `Node <version>; skraft needs Node 22 or later` |
| `config` | fichier présent, valide, au moins un composant | `skraft-config.json is invalid: …` ; `no skraft-config.json; run skraft init to detect the components` ; `skraft-config.json lists no component; run skraft init to detect them` |
| `forge` | la forge du run est joignable d'ici (sur `github` : un remote, `gh` installé et connecté à son hôte ; sur `azure-devops` : un remote qui nomme organisation, projet et dépôt, `az` avec son extension `azure-devops` installé et connecté à cette organisation) ; sinon un avertissement, jamais un échec | avertissement : `<forge>, named in the configuration: <reason>` ou `<forge>, deduced from the Git remote: <reason>` ; raisons : `the working copy has no Git remote whose URL names a host and a repository`, `gh, the GitHub CLI, is not installed`, `gh is not signed in to <host>; run gh auth login --hostname <host>`, `the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository`, `az, the Azure CLI, is not installed`, `skraft runs az under Windows only from the Azure CLI installer (MSI or winget), …`, `the azure-devops extension of the Azure CLI is not installed; run az extension add --name azure-devops`, `az is not signed in to the Azure DevOps organization <URL de l'organisation>, …` |
| `base` (avec `--run`) | la base se calcule | message de `invalid-base`, `base-unresolved` ou `source-control-unavailable` |
| `<composant>` | la racine est un dossier | `root <racine> is not a folder` (ses commandes ne sont pas contrôlées) |
| `<composant>` | au moins une commande de gate | `no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json` |
| `<composant>/<commande>` | la ligne se découpe et son programme est trouvé (PATH, et PATHEXT sous Windows) | `"<ligne>" <raison>` ; `command not found: <programme> (from <racine>); install it or change commands.<nom> in skraft-config.json` (pour `python`, `(from <racine>; looked for .venv/bin/python, .venv/Scripts/python.exe, python, python3)`) |
| `<composant>/<commande>` avec `--run` | la commande sort avec 0 | `<commande lancée> exited <code>; its output is in .copilot-tracking/skraft-doctor/<composant>/<commande>.log` (base remplacée, interpréteur choisi) |
| `<composant>` (après ses commandes) | chaque skill de mocking et de contract testing que demande le composant existe dans le plugin ou la copie de travail (`.claude/skills/`, `.github/skills/`) ; sinon un avertissement | avertissement : `skills found nowhere, in the plugin or the working copy: <skills>; mocking-strategy-roster and contract-testing say which recipe its tests use instead, or that they stop` |
| `vscode` | toujours `ok` | nomme le pilote VS Code : `Copilot SDK <version> (<chemin>): under VS Code, run the pipeline through it with engine/drivers/copilot-sdk/skraft-run.mjs`, ou `no Copilot SDK under <dossier>: under VS Code, the Skraft - Orchestrator agent conducts skraft next and skraft record; …` |
| `models` | chaque agent que nomme `assign.agents` existe dans le plugin ou la copie de travail | `assign.agents.<id>: no agent <id> in the plugin, .claude/agents/ or .github/agents/; did you mean <le plus proche>?` |
| `models/<hôte>` (`claude-code`, `copilot`) | chaque famille sur laquelle tournent les agents du workflow a un modèle pour cet hôte ; sinon un avertissement avec le nombre de lancements qui retombent sur l'hôte | avertissements : `no model on <hôte> for <famille> (<n> dispatches)…` ; `CLAUDE_CODE_EFFORT_LEVEL is set…` ; `max effort on <agent> (<modèle>)…` pour un modèle Copilot dont le nom ne contient pas `claude` ; `~/.copilot/settings.json sets subagents.agents for <agent>…` quand skraft passe son propre modèle ou niveau |

Les commandes d'un composant sont contrôlées gates d'abord (dans l'ordre des gates), puis
`e2e` dans l'ordre du fichier. Le doctor s'arrête après `config` si la config
est invalide, absente ou vide. Sans `--run`, `{baseSha}` est remplacé par `HEAD` pour le
seul découpage.

**Sortie texte** :

```
ok    node: Node v22.…
ok    forge: github, deduced from the Git remote
FAIL  web/test: command not found: npx (from ../payment-web); install it or change commands.test in skraft-config.json
models on claude-code:
  step      agent                type   family      tier      model   effort  source (family/model/effort)
  research  solution-researcher  phase  researcher  standard  sonnet  -       agent/tier/host
  …
models on copilot:
  …
skraft doctor: 1 checks failed
```

Une fois la configuration et le workflow lus, un tableau par hôte liste chaque agent que lance le workflow (les lentilles d'un nœud de revue, puis son réfutateur tel qu'il vérifie la lentille la plus forte du nœud) : famille, palier, modèle (une liste essayée dans l'ordre), niveau de réflexion, et la source de chacun ; `-` là où l'hôte décide.

La dernière ligne est `skraft doctor: every check passed`, `skraft doctor: no check failed, N with a warning` ou `skraft doctor: N checks failed`.

**Sortie `--json`** : `{ "ok": boolean, "checks": [{ "subject", "status": "ok"|"warn"|"fail", "detail" }], "assignments": { "<hôte>": [{ "step", "agent", "type", "family", "tier", "model", "effort", "source": { "family", "model", "effort" } }] } | null }`.

## Voir aussi <!-- #see-also -->

- [La ligne de commande skraft](./cli.md)
- [Le workflow DOT](./workflow-dot.mdx)
- [Installer skraft sur un hôte](../how-to/install-on-a-host.mdx)
- [Migrer depuis la v1](../how-to/migrate-from-v1.md)
- [Éjecter un workflow](../how-to/eject-workflow.mdx)
