---
layout: doc
lang: fr
title: "Hôtes"
description: "Claude Code, Copilot CLI et VS Code : prérequis, installation, pilote, commandes, questions humaines, suivi du run, et ce que chaque hôte peut ou ne peut pas faire."
persona: software-engineer
---

# Hôtes

> skraft tourne sous trois hôtes, Claude Code, Copilot CLI et VS Code, chacun conduit par un pilote qui exécute ce que demande le même moteur.

Pourquoi un moteur et des pilotes, et le contrat du pilote Copilot :
[Architecture]({{ "/fr/explanation/architecture" | relative_url }}).

## Prérequis {#prerequisites}

| Outil | Version | Pour |
| --- | --- | --- |
| Node | 22 ou plus | le moteur, la ligne de commande `skraft`, l'extension Copilot ; `skraft doctor` le vérifie |
| Git | — | la base de chaque composant, les commits, les rejeux de commits rouges |
| `gh` | connecté à l'hôte du dépôt | seulement pour lire l'issue de la story (`--issue`), ouvrir la pull request, commenter l'issue, `skraft review --pr` ; sur `github`, le serveur MCP GitHub de l'hôte, quand il est connecté, les sert d'abord et `gh` est le repli (le CLI `skraft` et `skraft next` passent toujours par `gh`) ; voir [Forge]({{ "/fr/reference/skraft-config" | relative_url }}#forge) |
| `az` | connecté à l'organisation, avec son extension `azure-devops` | sur Azure DevOps seulement, pour lire le work item de la story (`--issue`), y tenir le commentaire du run et ouvrir la pull request ; le serveur MCP Azure DevOps de l'hôte (`ado`), quand il est connecté, sert d'abord le work item et son commentaire et `az` est le repli (le CLI `skraft` et `skraft next` passent toujours par `az`) ; voir [Forge]({{ "/fr/reference/skraft-config" | relative_url }}#azure-devops-mcp-server-first-az-as-fallback) |
| Copilot CLI | — | Copilot CLI ; sous VS Code, le pilote SDK (`skraft-run.mjs`) le lance sans interface |

## Installation {#install}

| Hôte | Installation |
| --- | --- |
| Claude Code | `/plugin marketplace add SebastienDegodez/skraft-plugin`, puis `/plugin install skraft` |
| Copilot CLI | installer `skraft` depuis la marketplace du dépôt, ou installer un clone avec `copilot plugin install ./plugins/skraft-framework` |
| VS Code | `skraft` sous `@agentPlugins` dans la vue Extensions, ou un clone déclaré dans `chat.pluginLocations` |

Le plugin `skraft-backlog` (DISCOVER, DISCUSS) s'installe à part, depuis la même marketplace ;
il ne partage aucun code d'exécution avec `skraft`. Le plugin `skraft-brownfield` aussi.

## Pilotes {#drivers}

Un pilote exécute ce que le moteur demande ; il ne décide ni de l'ordre, ni du verdict, ni de
l'avancement. Il est le seul à lancer des agents (profondeur 1).

| Pilote | Hôte | Lance les agents | Pose les questions | Montre le run |
| --- | --- | --- | --- | --- |
| `drivers/claude-mod/` | Claude Code | `$.agent.spawn`, lot en parallèle | `$.ui.ask`, boutons du panneau | panneau Skraft, `/skraft` |
| `drivers/copilot-workflow/` | Copilot CLI | `ctx.agent`, borné par `maxConcurrentSubagents` | question posée une fois dans le chat (`session.ui.select` ou `input`) ; `ctx.pause` sans réponse, puis l'outil `skraft_decide` ou `skraft decide` | canvas `skraft-pipeline`, journal `/workflows` |
| `drivers/copilot-sdk/` | VS Code, SDK Copilot présent | lance le CLI Copilot sans interface et y suit le workflow `skraft-pipeline` | dans le terminal | terminal |
| `drivers/cli/` | VS Code sans SDK, et tout terminal | `skraft next` écrit les briefs, l'agent orchestrateur lance les sous-agents, `skraft record` reprend ; lentilles en séquence | `skraft decide` | `skraft status`, `WORKFLOW.md` |

Cas d'usage appelés par chaque pilote :

| Pilote | Cas d'usage |
| --- | --- |
| mod Claude Code, workflow Copilot | `Init`, `RunPipeline`, `Observe`, `Decide`, `ReviewPullRequest` |
| SDK Copilot | aucun directement : il lance le workflow `skraft-pipeline` dans le CLI Copilot |
| ligne de commande | `Init`, `Observe`, `Decide`, `RunGate`, `Doctor`, `ConfigureComponents`, `WorkflowCommands`, `Publish`, `AdoptJournal`, `Migrate`, `ReviewPullRequest`, et `RunPipeline` par `next` / `record` |

## Démarrer, répondre, suivre {#at-a-glance}

| Hôte | Démarrer ou reprendre un run | Répondre à une question | Suivre le run |
| --- | --- | --- | --- |
| Claude Code | `/skraft <slug> [#issue] [titre]`, ou l'agent `skraft-orchestrator` | la boîte de dialogue, les boutons du panneau, ou `/skraft decide <réponse>` | le panneau Skraft, `/skraft` |
| Copilot CLI | `/skraft <slug> [#issue] [titre…]` ([la commande](#skraft-command)), ou l'agent `skraft:skraft-orchestrator` ; les deux lancent le workflow `skraft-pipeline` | la boîte de dialogue de Copilot dans le chat ; sinon l'outil `skraft_decide` ou `skraft decide` dans un terminal | le canvas `skraft-pipeline`, le journal `/workflows`, `skraft status` |
| VS Code | `/skraft` dans le chat dit quoi taper mais ne lance aucun run depuis là ; `node "<dossier du plugin>/engine/drivers/copilot-sdk/skraft-run.mjs" <slug>` ; sans SDK Copilot, l'agent `skraft-orchestrator`, qui conduit `skraft next` / `skraft record` | `skraft decide` dans un terminal | `skraft status`, `WORKFLOW.md` |

Sans slug, le run reprend le pipeline actif de la copie de travail. Une seule session conduit un
pipeline à la fois : une seconde est refusée (`pipeline-locked`) tant que la première tient le
bail du run.

L'agent `skraft-orchestrator` ne fait que lancer : sous Claude Code, son seul outil est
`mcp__skraft__run_pipeline` ; sous Copilot CLI, il lance le workflow `skraft-pipeline` ; sous
VS Code, il conduit la boucle `skraft next` / `skraft record` et n'écrit que les fichiers de
réponse qu'elle liste.

## Claude Code {#claude-code}

Le mod (`hooks/skraft-mod.tsx`, seul module déclaré dans `hooks/hooks.json`) appelle le moteur
sans Node ni `import()` : il lance Git, les gates et les rejeux par `$.process.run`. Chaque
`/skraft` ouvre le panneau **Skraft** (`skraft-pipeline`).

| Dans la conversation | Effet | Réponse |
| --- | --- | --- |
| `/skraft <slug> [#issue] [titre…] [--base <ref>] [--from-artifacts]` | Init du slug, puis run en arrière-plan | `skraft <slug> started — progress in the Skraft pane.` |
| `/skraft`, `/skraft status`, `/skraft help` | vue du pipeline actif | `skraft <slug> — <status>`, une ligne par phase (`✓` closed, `▶` open, `·` pending), raison, agent, `cost: ~$<montant> (approximate: it includes anything else exchanged in this session while an agent ran)` |
| `/skraft review <numéro> [--publish]` | revoit la pull request `<numéro>` en arrière-plan, comme `skraft review --pr`, ses lentilles lancées ensemble ; le consentement à publier demandé dans un dialogue (en-tête `Review comment`) | `skraft review #<numéro> started — progress in the Skraft pane.` ; à la fin la notification `skraft review #<numéro>: <status> (<code>) — <reason>` ; sans numéro : `skraft: /skraft review <pull request number> [--publish]` |
| `/skraft decide [<clé>] <réponse> [raison…]` | enregistre la réponse (mêmes règles et refus que `skraft decide`), puis reprend le pipeline actif | `<slug>: <key> answered <answer>; run the pipeline again to go on`, puis la ligne de démarrage ; refus : `skraft: not recorded — <raison>` |

Dans `/skraft <slug> …`, `#<nombre>` placé juste après le slug donne l'issue ; le reste des
mots forme le titre ; `--base <ref>` et `--from-artifacts` peuvent se placer n'importe où après le slug. Autres
réponses :

| Cas | Réponse |
| --- | --- |
| Init refusé | `skraft <slug>: not started — <raison>` |
| un run tourne déjà | `skraft is already running <slug>; see the Skraft pane.` |
| fin du run (notification) | `skraft <slug>: <status> (<code>) — <raison>` |

Dans `/skraft decide`, un premier mot en forme de clé (`adr-1`) nomme la question ; sans
lui, la réponse va à la question que le run attend. Les mots après la réponse forment la
raison. Pour une question `blocked` ou `mutation-plan`, tous les mots après la clé forment la consigne
(`/skraft decide design-1 utiliser la passerelle bancaire`), et une option (`STOP`, `APPLY`) ne compte que seule.

Quand le moteur pose une question, le mod ouvre une boîte de dialogue `$.ui.ask` avec la
question, ses options et un en-tête (`ADR`, `Reporting`, `Environment`) :

| Dans la boîte de dialogue | Effet |
| --- | --- |
| une option qui n'est pas un refus | enregistrée comme réponse ; le run continue |
| un refus (`REJECTED`) | une deuxième boîte : `Why REJECTED? Type the reason under Other; it goes back to the agent.` ; le texte tapé sous Other est la raison ; `Not now` ou `Answer later` ne donnent pas de réponse |
| du texte tapé sous Other dans la première boîte | une option tapée, quelle que soit la casse, vaut cette option ; un autre texte est un refus avec ce texte pour raison quand la question en a un (`adr-ratification`), la consigne d'une question `blocked` (dont la seule option est `STOP`), et sinon une réponse refusée (le run attend) |
| boîte fermée | pas de réponse : le run attend |

Le panneau **Skraft** montre les phases, chacune suivie de ses étapes du graphe du workflow
(`  ✓ design — solution-architect: done, pass 2, $1.00` : `✓` faite, `▶` en cours, `·` à
venir ; ce que l'étape exécute, son résultat, son passage à partir du deuxième, son coût),
l'agent en cours, le dernier passage de chaque revue (`review design_review: needs-rework —
consistency fail (1), fitness pass`), le dernier résultat de chaque gate par composant
(`gates api: test pass, mutation fail (3 survivors)`), le coût et les dernières lignes du
journal de progression, autant que la hauteur du panneau en laisse. `/skraft` affiche la même
vue sans les étapes. Tant que le run attend, le panneau et `/skraft` montrent la question et
`answer: /skraft decide adr-1 RATIFIED|REJECTED (with your reason after REJECTED)`, ou
`answer: /skraft decide design-1 <instruction>|STOP` pour une question `blocked`, dont le seul
bouton est `STOP` (`APPLY|<instruction>|STOP` pour `mutation-plan`, boutons `APPLY` et `STOP`).

Le panneau montre aussi un bouton par option de la question que le run attend. Un appui est
la réponse de la personne, enregistrée comme `/skraft decide` l'enregistre (mêmes refus),
journalisée `by: "host"`, puis le run reprend ; le résultat va dans la transcription. Un refus
(`REJECTED`) demande d'abord sa raison dans la boîte décrite plus haut ; sans raison, rien
n'est enregistré. Un appui vient de la personne sur le panneau (un clic, son raccourci ou Entrée :
`ui.press`, API des mods de Claude Code 2.1.304) ; aucun outil du modèle n'en déclenche.
Tant qu'un run de la session conduit le pipeline, sa propre boîte pose la question et le
panneau ne montre aucun bouton ; un appui est alors refusé (`skraft is running; answer in its
dialog`). Un appui qui échoue pour une autre raison dit `skraft: the answer could not be recorded;
answer with /skraft decide`.

**Outil `mcp__skraft__run_pipeline`** (appelé par le modèle) : démarre ou reprend le
pipeline et rend la main tout de suite ; le run continue en arrière-plan.

| Champ | Type | Règle |
| --- | --- | --- |
| `slug` | string | kebab-case ; absent ou vide → reprend le pipeline actif ; l'outil ne choisit jamais de slug |
| `issue` | integer | pris seulement s'il est positif |
| `title` | string | titre de la story |
| `base` | string | ref git ; seulement pour un nouveau slug |
| `fromArtifacts` | boolean | démarre en DESIGN depuis les stories DISCUSS, comme `--from-artifacts` |

### Modèle et coût {#claude-code-models}

Le premier modèle Claude Code que la configuration donne à la famille de
l'agent part dans `$.agent.spawn` comme `model` ; sans lui, le modèle du fichier agent décide.
Le niveau de réflexion n'est pas passé (`$.agent.spawn` ne prend pas d'`effort`) : celui du
fichier agent s'applique ; `skraft doctor` montre quand même le niveau affecté. Le mod
journalise le coût de la session avant et après chaque agent, en USD, approximatif.

## Copilot CLI {#copilot-cli}

L'extension `com.github.copilot/extensions/skraft-pipeline/` enregistre les workflows
`skraft-pipeline` et `skraft-review`, l'outil `skraft_decide` et le canvas `skraft-pipeline`.
Le répertoire de travail est celui de la session, relu au démarrage d'un run et à chaque appel
d'outil.

### Commande `/skraft` {#skraft-command}

Le plugin `skraft` livre `com.github.copilot/commands/skraft.md`, qui donne à Copilot la syntaxe de
`/skraft` sous Claude Code. Claude Code garde le `/skraft` du mod : le plugin n'a pas de dossier `commands/`
pour lui. Le texte de la commande n'est pas vérifié par Vally.

**Nom.** Mesuré par la sonde d'hôte sur Copilot CLI 1.0.105, dans le registre de commandes du SDK (le menu
interactif n'a pas été lu) : une commande de plugin nommée comme son plugin est exposée sans préfixe, toute
autre sous la forme `<plugin>:<commande>`. Le manifeste de `skraft` se nomme `skraft`, la commande est donc
`/skraft` ; `skraft-refine` de `skraft-backlog` est `/skraft-backlog:skraft-refine`. Les deux plugins installés,
chacune est listée une fois et aucune n'en masque une autre. Le texte tapé après la commande arrive au prompt,
ajouté à sa fin.

Le premier mot choisit la route. Une route passe par Copilot seulement quand la session propose les workflows
`skraft-pipeline` et `skraft-review` ; sinon la commande ne lance ni run, ni revue, ni agent, et dit quoi taper.

| Saisi | Avec les workflows | Sans eux |
| --- | --- | --- |
| `/skraft`, `/skraft status`, `/skraft help` | ouvre le canvas `skraft-pipeline` sur l'onglet Run ; ne démarre ni ne reprend rien | dit de taper `skraft status` |
| `/skraft <slug> [#issue] [titre…] [--base <ref>] [--from-artifacts]` | lance `skraft-pipeline` avec `{ slug, issue, title, base, fromArtifacts }` et relaie son statut, son code et sa raison | ne lance rien : donne la ligne `skraft-run.mjs` à taper, ou dit de choisir l'agent `Skraft - Orchestrator` |
| `/skraft decide [<clé>] <réponse> [raison…]` | le dialogue de Copilot pose de nouveau la question ; la réponse tapée n'est jamais enregistrée | dit de taper `skraft decide [<clé>] <réponse> [--reason "<raison>"]` |
| `/skraft review <numéro> [--publish]` | lance `skraft-review` avec `pr` et `publish` | dit de taper `skraft review --pr <numéro> [--publish]` |
| `/skraft backlog [critères…]` | passe la main aux agents du backlog (ci-dessous) | idem |

Exemples, les mêmes que sous Claude Code :

```text
/skraft paiement #42 Paiement par carte
/skraft paiement --base develop
/skraft paiement --from-artifacts
```

Deux écarts voulus avec Claude Code. `decide` n'enregistre rien des mots tapés : sous Copilot, une décision humaine
n'est enregistrée qu'après le dialogue de l'hôte. `backlog` est un mot réservé, sauf quand un pipeline nommé `backlog`
existe déjà (`.copilot-tracking/skraft-plans/backlog/`) : `/skraft backlog …` prend alors la route Run, reprend ou démarre
ce pipeline, et dit que, pour la route backlog, vous sélectionnez directement `Skraft - Backlog Discoverer` comme agent du chat.

`/skraft backlog [critères…]` demande le plugin optionnel `skraft-backlog` ; sans lui la commande le dit et donne
`copilot plugin install skraft-backlog@skraft`, et toutes les autres routes marchent. Avec lui, la commande ne lance
aucun agent : vous choisissez `Skraft - Backlog Discoverer` comme agent du chat et lui donnez les critères, puis
`Skraft - Backlog Planner` pour affiner l'issue choisie, puis `/skraft <slug> --from-artifacts` développe la story. Chaque étape
vous attend ; rien ne passe seul au développement.

Il n'y a ni sous-commande `story` ou `resume`, ni option `--issue` ou `--title` dans le chat. Un `#42` seul est passé comme slug et le
moteur le refuse.

### Workflow `skraft-pipeline` {#skraft-pipeline}

Le workflow dynamique `skraft-pipeline` lance les agents par `ctx.agent`.

| Arg | Type | Règle |
| --- | --- | --- |
| `slug` | string | présent → Init puis run ; absent → reprise du pipeline actif |
| `issue` | integer | numéro de l'issue |
| `title` | string | titre de la story |
| `base` | string | ref git ; seulement pour un nouveau slug |
| `fromArtifacts` | boolean | démarre en DESIGN depuis les stories DISCUSS, comme `--from-artifacts` |
| `agentIds` | object | `{ "<id du fichier agent>": "<id de l'agent dans la session>" }` |

Toute autre clé est refusée (`invalid-args`), comme une entrée d'`agentIds` qui ne nomme pas un agent de la session pour ce même fichier agent (`invalid-agent-ids`) ; rien ne démarre et la valeur refusée n'est jamais reprise.

Le workflow rend `{ status, slug, phase, code, reason }` (`status` = `done`, `blocked`,
`waiting` ou `refused`) et journalise `<slug>: <status> (<code>): <raison>`. Une reprise ne
relance pas un agent dont les sorties sont déjà remplies.

Quand le moteur pose une question, le workflow la pose une seule fois à la personne, dans la
boîte de dialogue de Copilot, dans le chat : un choix parmi ses options (`session.ui.select`), ou
un champ texte pour une question qui prend une consigne, celle d'une étape `blocked` ou le
`mutation-plan`, où la personne écrit une option ou sa consigne (`session.ui.input`). Un refus
(`REJECTED`) demande ensuite sa raison, dans un champ texte. La valeur que rend la boîte de
dialogue est la réponse, journalisée `by: "host-confirmed"` ; rien ne demande de la confirmer, et
le run continue. Quand Copilot ne peut pas poser la question (pas de boîte de dialogue, mode
`autopilot`, mode qu'il ne dit pas, trop de questions en peu de temps) ou que la personne la
ferme, le workflow écrit pourquoi et comment répondre, puis se met en pause durable par
`ctx.pause(<clé>)` :

```
Waiting for you — <question>
adr-1 was not answered: <why>. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide adr-1 RATIFIED|REJECTED in a terminal and resume this run.
```

### Canvas `skraft-pipeline` {#canvas}

| Règle | Détail |
| --- | --- |
| Entrée | `tab` seulement, l'onglet que la page montre d'abord (`run`, `configuration` ou `workflow`) ; un slug ou toute autre clé est refusé ; il montre le pipeline actif (`.active-slug`) du répertoire de la session, relu à chaque ouverture, action et rafraîchissement |
| Contenu | quatre onglets. **Run** : chaque phase et ses étapes, le dernier passage de chaque revue, les derniers résultats de gate de chaque composant, les arêtes empruntées, la question en attente ; aucun coût. **Configuration** : la forge, les composants tels qu'écrits, les consentements, les modèles et ce que chaque agent du workflow reçoit par hôte, la barre de qualité en lecture seule. **Workflow** : chaque workflow que le run peut suivre, pas à pas, l'étape en cours du run mise en évidence. **Journal** : en lecture seule, d'après `events.jsonl` ; chaque étape enregistrée (passe, essai, résultat, arête empruntée) et chaque décision humaine (réponse, raison, `by`), les 200 dernières, avec l'état de la chaîne de hachage (intacte, rompue, invérifiable) ; une chaîne rompue n'affiche aucune entrée |
| Action | `get_pipeline` et `get_configuration`, en lecture seule ; la page n'a ni formulaire ni route de réponse. La seule écriture est une modification de la configuration depuis l'onglet Configuration : composants et consentements vont dans `skraft-config.json`, `assign` et `models` dans `skraft-config.local.json` ; le moteur vérifie chaque modification comme un run la charge et n'écrit rien qu'il refuserait |
| Serveur | un serveur sur 127.0.0.1 par instance ouverte, jeton dans l'URL, CSP `default-src 'none'` ; 4 instances au plus ; la seule route qui écrit est `POST /configuration` (jeton dans `X-Skraft-Token`, JSON d'au plus 64 Kio) |

La question en attente est suivie de `Answer it in the
Copilot chat, where Copilot puts it to you; or type skraft decide <key> <answers> in a
terminal.` ; il ne prend aucune réponse.

Tant qu'une question attend, un bouton **On a besoin de vous** s'affiche dans l'en-tête. Il mène à la question sur l'onglet Run, comme la touche `n` hors d'un champ. Il ne répond à rien : la réponse passe par la boîte de dialogue de Copilot ou par `skraft decide`.

La page parle la langue du navigateur, français ou anglais. Les phrases que le driver fixe (aucun répertoire de travail, un pipeline ou une configuration illisible, une configuration non enregistrée, où répondre à la question) et les mots propres de la page la suivent ; ce que le moteur écrit (les étapes et leurs résultats, les revues, la question, les refus du moteur) s'affiche tel que le moteur l'a écrit, et le modèle lit le texte anglais de `get_pipeline` et `get_configuration`. Chaque phase dit son état en un mot (close, en cours, à venir) et chaque étape en un mot que seul un lecteur d'écran lit ; une région vivante polie annonce un nouvel état du run et une question qui se met à attendre. Les consentements sont un seul arrêt de tabulation par groupe : les flèches, Début et Fin déplacent le choix. En couleurs forcées, le choix retenu, l'onglet sélectionné et la phase et l'étape en cours gardent un fond, une bordure ou un contour, et `prefers-contrast: more` assombrit le texte discret et les filets. Après cinq tentatives de rejoindre son serveur (environ 45 s), la page dit de fermer le canvas et de le rouvrir depuis Copilot : un serveur relancé a une nouvelle adresse et un nouveau jeton, qu'un rechargement n'atteint pas. Le tout est vérifié dans un navigateur aux couleurs et au contraste émulés ; il n'a été lu ni avec un lecteur d'écran ni avec le contraste élevé de Windows.

Avant la première phase d'une copie de travail, le workflow ouvre le canvas sur son onglet Configuration et pose dans le chat la question `configuration` : *Démarrer ce run avec la configuration de cette copie de travail ?* `START` continue et est gardé dans `skraft-config.local.json` (`configurationConfirmed`), si bien que les runs suivants démarrent sans demander ; `STOP` ne démarre rien. Passez `configure: true` au workflow pour qu'on vous le redemande. Le CLI et le mod Claude Code ne la posent jamais.

### Outil `skraft_decide` {#skraft-decide}

Sans argument ; toute clé est refusée. Il pose à la personne, une seule
fois, la question qu'attend le pipeline actif, dans la boîte de dialogue de Copilot, comme le
run, et enregistre ce qu'elle donne par le même cas d'usage que `skraft decide` (mêmes règles et
refus : une consigne de plus de 1000 caractères est refusée), journalisé `by: "host-confirmed"`.
Ni la question ni la réponse ne viennent du modèle. Sans boîte de dialogue, en mode `autopilot`,
ou quand la personne ne répond pas, rien n'est enregistré et la personne répond par `skraft
decide` dans un terminal. Il répond `Recorded: <slug>: <key> answered <answer>; run the pipeline
again to go on. Resume the paused skraft-pipeline run (/workflows).`, ou `Refused: <raison>;
nothing was recorded.` Reprendre le run applique la réponse ; les agents déjà passés ne sont pas
relancés.

### Workflow `skraft-review` {#skraft-review}

Arguments { `pr`, `publish`, `agentIds` }. Il revoit une pull request comme
`skraft review --pr`, ses lentilles par `ctx.agent`. `pr` est un entier positif ; toute autre clé
ou valeur est refusée (`invalid-args`) sans être répétée. Avec `publish: true`, le consentement
est écrit au journal du workflow, puis confirmé par la personne dans le dialogue de l'hôte
(`session.ui.confirm` : garder un commentaire de revue sur la pull request #N) et journalisé
`by: host-confirmed` ; en autopilot ou sans dialogue, rien n'est enregistré ni posté, et le journal
renvoie à `skraft review --pr <numéro> --publish` dans un terminal. Il rend l'issue de la revue et écrit `skraft review #<numéro>: <status> (<code>): <reason>`.

### Modèle et coût {#copilot-models}

Un lancement porte les modèles Copilot que la configuration donne à la
famille de l'agent (le préféré d'abord) dans l'option `model`, et son niveau dans
`reasoningEffort`. Copilot refuse le niveau : la même demande repart sans lui. Copilot refuse le
modèle : le suivant de la liste, puis le modèle de la session. Sans modèle configuré, l'agent
tourne sur le modèle de la session. Aucun coût n'est journalisé : Copilot compte en crédits.

## VS Code {#vs-code}

`skraft doctor` dit lequel des deux pilotes s'applique (contrôle `vscode`).

### Pilote SDK Copilot {#copilot-sdk}

```
node "<dossier du plugin>/engine/drivers/copilot-sdk/skraft-run.mjs" [<slug>] [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts] [--allow-all-tools]
```

| Règle | Détail |
| --- | --- |
| SDK | le plus récent `~/.copilot/pkg/<plateforme>/<version>/` qui contient `copilot-sdk/index.js` et l'entrée du CLI ; `COPILOT_CLI_PATH` réglé sur cette entrée s'il ne l'est pas |
| Run | ouvre une session sans interface dans la copie de travail avec le plugin, lance le workflow `skraft-pipeline` et le suit jusqu'à un statut final ; le moteur et le pilote du workflow Copilot font le reste dans le CLI |
| Permissions | chaque permission qu'un agent demande est posée au terminal (`y` l'accorde une fois) ; `--allow-all-tools` les accorde toutes ; sans terminal, refusée |
| Question | un run en pause attend : `skraft decide` dans un terminal, puis `skraft-run.mjs` de nouveau |
| Code de sortie | 0 run fini ou en attente ; 1 sinon ; 2 ligne mal formée |
| Échecs | chaque appel au SDK a un délai (`rpc-timeout`), le suivi une échéance (`run-too-long`) ; Ctrl-C arrête le suivi ; aucun texte du SDK n'est repris |

### Boucle d'agent `next` / `record` {#agent-loop}

Sans SDK Copilot, l'agent `skraft-orchestrator` conduit la boucle de la ligne de commande :

1. `skraft next` fait tourner le pipeline actif jusqu'à ce qu'il ait besoin d'agents ou d'un
   humain ; pour chaque agent, il écrit un brief et un fichier de réponse vide sous
   `<dossier de suivi>/results/loop/` et les liste dans `pending.json`.
2. L'orchestrateur lance chaque agent nommé, sur le modèle indiqué, et garde sa réponse finale
   dans son fichier de réponse.
3. `skraft record` remet les réponses au run et continue comme `next`.
4. Une question arrête la boucle : un humain répond par `skraft decide` dans son terminal, puis
   l'orchestrateur relance `skraft next`.

Les lentilles passent l'une après l'autre. Le journal est celui du workflow Copilot, sans les
modèles ni les coûts que la boucle ne peut pas connaître. Synopsis, sorties et codes :
[`skraft next` et `skraft record`]({{ "/fr/reference/cli" | relative_url }}).

## Ce que chaque hôte peut faire {#capabilities}

| Capacité | Claude Code | Copilot CLI | VS Code + SDK | VS Code, boucle `next` / `record` |
| --- | --- | --- | --- | --- |
| Lentilles d'une revue en parallèle | oui (lot) | oui, borné par `maxConcurrentSubagents` | oui (workflow Copilot) | non, l'une après l'autre |
| Modèle passé à l'agent | oui, le premier modèle Claude Code de la famille | oui, la liste des modèles Copilot, avec repli | oui (workflow Copilot) | nommé dans la sortie de `next` ; l'orchestrateur le choisit |
| Niveau de réflexion passé | non (celui du fichier agent) | oui (`reasoningEffort`), retiré si Copilot le refuse | oui (workflow Copilot) | non |
| Coût journalisé | oui, USD approximatif | non | non | non |
| Question posée dans l'hôte | oui : dialogue et boutons du panneau | oui : dialogue dans le chat ; refusé en `autopilot` ou sans dialogue | non : `skraft decide` | non : `skraft decide` |
| `by` journalisé pour une réponse | `host` (dialogue, bouton), `decide` (`/skraft decide`) | `host-confirmed` | `cli-tty` | `cli-tty` |
| Vue du run | panneau Skraft | canvas `skraft-pipeline` (lecture seule) | terminal | `skraft status`, `WORKFLOW.md` |
| Revue d'une pull request | `/skraft review <numéro>` | `/skraft review <numéro>`, ou le workflow `skraft-review` | `skraft review --pr` (boucle) | `skraft review --pr` (boucle) |
| Commande `/skraft` disponible | oui (le mod) | oui, mesurée `/skraft` dans le registre du SDK (CLI 1.0.105 ; menu non lu) | branchée, non mesurée sous VS Code | branchée, non mesurée sous VS Code |
| Run d'ingénierie disponible | oui | oui | branché, testé sur hôte simulé, pas encore lancé pour de vrai (#222) | branché, testé sur hôte simulé, pas encore lancé pour de vrai (#222) |

## Voir aussi {#see-also}

- [La ligne de commande skraft]({{ "/fr/reference/cli" | relative_url }})
- [Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }})
- [Choisir les modèles des agents]({{ "/fr/how-to/choose-models" | relative_url }}) — modèles et niveau par hôte
- [Architecture]({{ "/fr/explanation/architecture" | relative_url }})

Termes à connaître : **hôte**, **pilote d'hôte**, **moteur**, **slug** — voir le
[glossaire]({{ "/fr/reference/glossary" | relative_url }}).
