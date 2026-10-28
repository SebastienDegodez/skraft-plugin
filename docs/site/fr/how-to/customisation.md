---
layout: doc
lang: fr
title: "Personnaliser SKRAFT"
description: "Ce que vous pouvez adapter aujourd'hui en V2 (composants, commandes, base, mocking, modèles et niveau de réflexion par agent, questions à un humain), ce qui arrive aux lots suivants, et le risque de chaque contrôle que vous réduisez."
persona: tech-lead
---

# Personnaliser SKRAFT

**But** : adapter SKRAFT à votre dépôt sans retirer, par mégarde, une preuve dont votre équipe dépend.

En V2, le **moteur** décide de l'ordre des phases, des sorties attendues, des relances, des verdicts et des gates. Vous ne réglez pas ces décisions ; vous décrivez votre dépôt dans `skraft-config.json`, et le moteur s'y tient.

## Ce que vous pouvez adapter aujourd'hui

Les réglages passent par `skraft-config.json`, à la racine de la copie de travail qui lance le run ; les étapes d'un run passent par le workflow, que `skraft workflow eject` copie dans `.skraft/`.

| Quoi | Où | Effet | Guide |
|---|---|---|---|
| Les composants | `components[]` : `name`, `root`, `stack` | Ce que le moteur construit et teste, y compris un dépôt voisin (`../payment-web`) | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Les commandes | `commands` d'un composant | Une commande écrite par vous est **toujours** celle qui tourne ; le moteur ne la remplace jamais par un défaut | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Les gates | les commandes nommées `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | Ce que lancent les nœuds de gate de DELIVER et `skraft gate`, dans cet ordre | [Lancer les gates]({{ "/fr/how-to/run-gates" | relative_url }}) |
| La base | `baseBranch` global ou par composant, `--base <ref>` à l'init | Le commit de comparaison : composants modifiés, `{baseSha}` dans les commandes | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Le mocking | `mocking.strategy` : `"microcks"` ou `"inprocess"` | `inprocess` par défaut pour TypeScript, JavaScript et React, `microcks` sinon ; `microcks` exige Docker pour les gates de test | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Droits d'écriture et tests de contrat | `paths` (`src`, `tests`) et `contractTesting` d'un composant | Où le software engineer peut écrire en DELIVER ; s'il lit les skills de contract testing | [skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }}) |
| Le workflow | `.skraft/pipeline.skraft.dot`, `.skraft/review.skraft.dot` | Vos propres agents, lentilles, gates et questions | [ci-dessous](#own-agent) |
| Modèles et niveau de réflexion | `models`, `assign`, aussi dans `~/.skraft/config.json` et `skraft-config.local.json` | Le modèle et le niveau de réflexion de chaque agent, par hôte | [ci-dessous](#models-and-effort) |

Ce qui ne se règle pas :

- Les **seuils qualité** ne sont pas configurables.
- L'ordre des phases, le nombre de tentatives d'un agent et les codes de blocage sont dans le moteur.
- Les contrôles propres au moteur (journal, droits d'écriture, sorties attendues) ne sont pas des nœuds du workflow : aucune copie ne les retire. Les gates de DELIVER sont verrouillées et les revues obligatoires.

Les autres clés de premier niveau de `skraft-config.json` sont conservées telles quelles par `skraft init`.

## Choisir le modèle et le niveau de réflexion de chaque agent {#models-and-effort}

`models` et `assign` choisissent ce sur quoi chaque agent tourne, sous Claude Code et sous Copilot. Quatre fichiers s'appliquent, chacun un JSON Merge Patch sur les précédents (un objet est fusionné clé par clé, une liste ou une valeur remplace la précédente, `null` la supprime) :

1. les défauts du plugin : `economy` → `haiku`, `standard` → `sonnet`, `frontier` → `opus` sous Claude Code ; les lentilles sur `reviewer`, `solution-researcher` sur `researcher`, `solution-architect` sur `planner`, tout autre agent sur `implementer` ;
2. `~/.skraft/config.json`, le vôtre, pour tous vos dépôts ;
3. `skraft-config.json`, celui de l'équipe, commité ;
4. `skraft-config.local.json`, le vôtre, jamais commité : `skraft init` l'ajoute au `.gitignore`.

Les fichiers 2 et 4 suivent `plugins/skraft-framework/schemas/skraft-config.local.schema.json` et ne contiennent pas `components` ; le fichier 3 suit `skraft-config.schema.json`. Aucun fichier ne nomme de workflow : le run suit `.skraft/pipeline.skraft.dot` quand vous l'avez éjecté.

- **Une famille** est un palier (`economy` < `standard` < `frontier`, le seul rang), un rôle à palier intégré (`reviewer` → economy, `researcher` et `implementer` → standard, `planner` → frontier ; `"tier"` le change) ou une famille libre qui déclare son `"tier"` (`gpt-codex`). Une famille n'est jamais un modèle versionné : `gpt-5.5` est un modèle.
- **`models`** donne à chaque famille, par hôte (`claude-code`, `copilot`), un `model` — ou une liste essayée dans l'ordre, avec le même niveau — et un `effort` (`low`, `medium`, `high`, `xhigh`, `max`). Ce qu'une famille ne précise pas vient de son palier, puis l'hôte décide.
- **`assign`** choisit la famille : une chaîne la nomme, `inherit` laisse l'hôte choisir, un objet ajoute un `effort` par hôte (jamais un modèle), `null` retire une règle d'un fichier inférieur.

Résolution, famille et niveau séparément :

| Quoi | Le premier qui s'applique |
|---|---|
| Famille | `assign.agents.<agent>` → la famille que nomme un workflow en vigueur (`model=`, `<lentille>@<famille>`, `refuter=`) → `assign.types.<phase, lens, refuter, worker>` → `assign.default` → l'hôte (Claude Code : le `model:` du fichier d'agent ; Copilot : `/agents`, puis la session) |
| Modèle pour un hôte | celui de la famille pour cet hôte → celui de son palier → l'hôte |
| Niveau pour un hôte | `assign.agents.<agent>` pour cet hôte → `assign.types.<type>` pour cet hôte → celui de la famille → celui de son palier → l'hôte |
| Réfutateur | une règle ou `refuter=` qui nomme sa famille, sinon un palier au-dessus de la lentille la plus forte qu'il vérifie, `frontier` au plus |

Le fichier local d'un développeur, par exemple :

```json
{
  "$schema": "./plugins/skraft-framework/schemas/skraft-config.local.schema.json",
  "models": {
    "economy":  { "claude-code": { "model": "haiku",  "effort": "low" },    "copilot": { "model": "gpt-5.5", "effort": "low" } },
    "standard": { "claude-code": { "model": "sonnet", "effort": "medium" }, "copilot": { "model": "gpt-5.5", "effort": "high" } },
    "frontier": { "claude-code": { "model": "opus",   "effort": "high" },   "copilot": { "model": "gpt-6.0", "effort": "xhigh" } },
    "implementer": { "copilot": { "model": ["gpt-6.0", "gpt-5.5"] } },
    "gpt-codex":   { "tier": "standard", "copilot": { "model": "gpt-5.5-codex", "effort": "medium" } },
    "deep-review": { "tier": "frontier", "claude-code": { "model": "opus", "effort": "max" }, "copilot": { "model": "gpt-6.0", "effort": "xhigh" } }
  },
  "assign": {
    "types": { "lens": "economy" },
    "agents": {
      "software-engineer": "gpt-codex",
      "cold-reader-lens": "deep-review",
      "architecture-boundaries-lens": { "claude-code": { "effort": "high" }, "copilot": { "effort": "high" } },
      "solution-architect": { "family": "planner", "claude-code": { "effort": "max" } },
      "fitness-lens": null
    }
  }
}
```

Avec `{ "assign": { "agents": { "fitness-lens": "implementer" } } }` dans le fichier de l'équipe, le `null` rend `fitness-lens` à la règle par type : toutes les lentilles tournent sur `economy`, `cold-reader-lens` sur `deep-review` (opus · max, gpt-6.0 · xhigh), `software-engineer` sur `gpt-codex` (sonnet · medium par son palier, gpt-5.5-codex · medium), `acceptance-designer` essaie gpt-6.0 puis gpt-5.5 sous Copilot.

- Sans aucun de ces fichiers, Claude Code reçoit les alias des défauts et Copilot aucun modèle : il lance chaque agent sur le modèle de la session.
- `skraft doctor` affiche, par hôte, chaque agent que lance le workflow avec sa famille, son palier, son modèle, son niveau et la source de chacun, et signale une famille sans modèle pour un hôte, `max` sur un modèle Copilot dont le nom ne contient pas `claude`, `CLAUDE_CODE_EFFORT_LEVEL` et un réglage d'agent de `~/.copilot/settings.json` que skraft masque ; une règle pour un agent que personne ne fournit échoue, avec le nom le plus proche.
- `skraft workflow check` signale un `model=`, `@<famille>` ou `refuter=` de votre workflow qu'une règle par agent masque, défauts du plugin compris.
- Un run journalise ce sur quoi chaque agent a tourné ; une reprise le rejoue, quoi que disent les fichiers depuis.
- Le mod Claude Code passe le modèle mais pas le niveau : `$.agent.spawn` n'en prend aucun (Claude Code 2.1.305) ; le niveau du fichier d'agent s'applique.

## Interroger un humain dans le workflow

Le workflow est un graphe DOT (`workflows/pipeline.skraft.dot` dans le plugin ; `skraft workflow eject` le copie dans `.skraft/pipeline.skraft.dot`). Un nœud de forme `hexagon` est un **nœud question** : il pose une question à un humain, et le run attend que la réponse arrive. Le workflow par défaut demande la ratification des ADR proposés par DESIGN, une fois la revue de conception passée (les boucles de revue après DESIGN abrégées) :

```text
start -> publish_consent -> visuals_consent -> research -> design -> design_review_lenses -> … -> design_review
publish_consent [shape=hexagon, question="publish-consent"]
visuals_consent [shape=hexagon, question="reporting-consent"]
design_review -> design  [label="NEEDS_REWORK", max_visits=3]
design_review -> adr     [label="APPROVED"]
adr      [shape=hexagon, question="adr-ratification"]
adr -> distill   [label="RATIFIED"]
adr -> design    [label="REJECTED", max_visits=3]
distill -> distill_review_lenses -> … -> distill_review -> deliver -> gates -> mutation -> deliver_review_lenses -> … -> deliver_review -> visuals -> pr_writer -> publish -> exit
visuals  [shape=parallelogram, publish="playwright-visuals", when="frontend"]
mutation -> kill_mutants [label="FAIL", max_visits=5]
kill_mutants [agent="software-engineer", each="survivor-file"]
kill_mutants -> mutation_review_lenses -> mutation_review_test_integrity -> mutation_review
mutation_review -> gates [label="APPROVED"]
```

Les nœuds `gates` et `mutation` sont `locked=true` : un workflow de dépôt n'en retire un qu'avec `unlock="<raison>"`. Déverrouiller `mutation` est la seule façon de se passer du mutation testing ; ce n'est pas recommandé.

Le moteur juge la mutation sur le rapport de l'outil, pas sur son code de sortie. Il note les fichiers changés depuis la base du composant (tous ceux du rapport faute de base, ou quand Git ne sait pas lister les changements) : le cœur (un fichier sous un dossier du composant dont le dernier mot est `domain` ou `application`, comme `Checkout.Domain`, `checkout-domain`, `src/cart/application`) doit atteindre 100 %, le bord (tout le reste) 80 %. Un score, c'est les mutants détectés (tués, en timeout, et les erreurs mémoire de PIT) sur les détectés et les survivants (survécu, sans couverture) ; le seuil n'est pas configurable et décide, quel que soit le code de sortie de l'outil. Quand un périmètre manque son seuil, le moteur envoie ses survivants à `kill_mutants`, un dispatch par fichier. `mutation_review` vérifie les nouveaux tests avec `test-integrity`, puis les gates tournent à nouveau. La boucle s'arrête quand la mutation passe ; quand deux tours ne laissent pas moins de mutants en vie que le meilleur tour précédent (`mutation-stalled`) ; ou à son `max_visits`. Ces deux derniers arrêts nomment les mutants restants.

Le rapport est lu là où la commande par défaut de chaque stack l'écrit, sous la racine du composant : `StrykerOutput/reports/mutation-report.json` (.NET), `reports/mutation/mutation.json` (JavaScript, TypeScript, React), `mutation-report.json` (Python), `target/pit-reports/mutations.xml` (Java, Maven) ou `build/reports/pitest/mutations.xml` (Gradle). Il doit être au format JSON mutation-testing-elements, ou être le XML de PIT. Les scripts de mutation des skills `quality-gates-*` publient leur rapport à cet endroit, et seulement pour un run sain : un run qui a passé, ou que seul son score fait échouer. Avec eux, laissez `mutationReport` absent. Une commande qui l'écrit ailleurs nomme son fichier avec `mutationReport` sur le composant, relatif à sa racine ; ce fichier est le rapport que la commande publie pour le moteur, jamais la copie qu'un script garde dans son dossier de preuves, écrite quel que soit le run. Avec Gradle, ajoutez `XML` aux `outputFormats` de PIT dans le build ; un projet Maven multi-module écrit un rapport par module : nommez celui à lire avec `mutationReport`. Une mutation sans rapport lisible attend un humain, quel que soit son code de sortie, de même qu'un run échoué dont le rapport ne compte aucun mutant. Chaque commande par défaut utilise le mode incrémental de son outil, pour qu'un tour de la boucle ne remute pas tout le projet : `--incremental` pour StrykerJS, `-DwithHistory` pour PIT, `--since:{baseSha}` pour Stryker.NET ; quoi que l'outil mute, le seuil est jugé sur les fichiers changés depuis la base.

| Question | Réponses | Refus |
|---|---|---|
| `adr-ratification` | `RATIFIED`, `REJECTED` | `REJECTED`, avec une raison |
| `reporting-consent` | `ACCEPTED`, `DECLINED` | — |
| `publish-consent` | `ACCEPTED`, `DECLINED` | — |

`reporting-consent` demande une fois par dépôt, avant le premier agent, si skraft peut publier les captures d'écran de ses runs, qui peuvent montrer des données privées ; la réponse va dans `skraft-config.json` (`publish.visuals`). Tant qu'aucun composant n'est un frontend (stack `react`, ou un composant avec `commands.e2e`), elle n'est pas posée et rien n'est écrit.

`publish-consent` demande une fois par dépôt, avant le premier agent, si skraft peut pousser la branche et ouvrir ou mettre à jour sa pull request en fin de run, et tenir à jour un commentaire sur l'issue de la story avec l'avancement, le temps et le coût du run ; la réponse va dans `skraft-config.json` (`publish.pullRequest`), avec la version de la question à laquelle elle répond (`publish.questionVersions.pullRequest`). Quand le texte d'une question de consentement change, sa version change : une acceptation donnée à une version antérieure est redemandée, un refus reste valable. Un run lancé avec `--from-artifacts` commence en DESIGN et ne la pose pas : renseignez à la main `publish.pullRequest` à `true` et `publish.questionVersions.pullRequest` à `2`.

Règles des arêtes qui sortent d'un nœud question :

- chaque arête porte une réponse en label ;
- une arête sans label prend toutes les réponses qui n'ont pas d'arête à elles, sauf un refus ;
- un refus exige son arête à lui, avec label, en général vers le nœud dont il refuse le travail, avec `max_visits` pour borner la boucle ;
- un nœud question hérite de sa phase comme les autres nœuds.

Le moteur refuse un workflow avec une question inconnue, un nœud question sans `question`, deux arêtes sans label sortant d'un nœud question, deux arêtes pour la même réponse, un label qui n'est pas une réponse, un refus sans arête à lui, ou une boucle dont aucune arête ne porte `max_visits`. Exemples : `node adr: REJECTED needs an edge of its own, back to the node whose work it refuses`, `node adr: no edge for RATIFIED; label one RATIFIED, or leave one unlabeled`, `loop adr -> design -> design_review_lenses -> design_review_consistency -> design_review -> adr has no max_visits`.

## Modifier une revue {#reviews}

Une revue est un fan-out (`shape=component`), un nœud lentille par branche (`shape=note`, `lens="<nom>"`, lancé comme l'agent `<nom>-lens`) et un fan-in (`shape=tripleoctagon`) qui réfute les findings, calcule le verdict et porte les arêtes `APPROVED` et `NEEDS_REWORK`. Pour ajouter une lentille de votre dépôt à la revue de conception, ajoutez un nœud et une chaîne de deux arêtes :

```text
design_review_threat_model [shape=note, lens="threat-model"]
design_review_lenses -> design_review_threat_model -> design_review
```

La lentille tourne avec les autres ; `.claude/agents/threat-model-lens.md` ou `.github/agents/threat-model-lens.md` doit exister. `model="<famille>"` sur un nœud lentille nomme sa famille ; `when="mock"` ou `when="contract"` ne la lance que si les changements touchent des mocks ou des contrats ([déclencheurs]({{ "/fr/reference/cli" | relative_url }})). `skraft workflow diff` liste chaque nœud lentille ajouté, retiré ou modifié.

La revue DELIVER vit dans son propre fichier, `workflows/review.skraft.dot`, qu'appelle `deliver_review [shape=house, workflow="review"]`. Pour lui ajouter une lentille, copiez-le avec `skraft workflow eject review` (il arrive dans `.skraft/review.skraft.dot`) et ajoutez le nœud et ses deux arêtes entre `lenses` et `verdict` :

```text
threat_model [shape=note, lens="threat-model"]
lenses -> threat_model -> verdict
```

La lentille tourne alors en DELIVER, que ce soit le pipeline du plugin ou votre copie qui appelle `review`. `review.skraft.dot` reçoit ses entrées (`base`, `head`, `story`, `documents`, `components`) de l'appel : retirez `input_documents` et ses lentilles relisent les changements sans les documents du run ([nœud d'appel]({{ "/fr/reference/cli" | relative_url }})).

Les fan-in des revues DESIGN, DISTILL et de mutation, l'appel `deliver_review`, et dans `review.skraft.dot` son fan-in et les lentilles `test-integrity` et `architecture-boundaries`, sont `mandatory=true` : aucun workflow de dépôt ne les retire, ne les contourne ni ne les affaiblit, même avec une raison. Changer le `model=` d'une lentille obligatoire est permis ; lui ajouter un `when`, la déplacer dans une autre revue ou renvoyer le `NEEDS_REWORK` de la revue vers une autre phase est refusé ; un agent de la phase de la revue ajouté après elle aussi : placez-le avant la revue ou dans une phase à lui ([règles]({{ "/fr/reference/cli" | relative_url }})).

`skraft workflow check` refuse une branche qui contourne le fan-in, un fan-in sans fan-out, une lentille deux fois dans une revue et une arête de verdict sur le fan-out. Un workflow éjecté avant cette forme écrit encore `lenses="a,b,c"` sur un nœud `component` : la vérification le refuse et écrit, pour chaque nœud concerné, les nœuds et arêtes qui le remplacent, identifiants compris, pour que la copie retrouve le workflow du plugin (`skraft workflow diff` ne liste alors plus que vos propres changements).

## Ouvrir la pull request en fin de run {#pull-request}

Le workflow par défaut se termine par une phase PUBLISH : l'agent `pr-writer` (famille `economy` par défaut ; à changer par `assign.agents`) écrit la ligne de résumé, What changes, Why et Out of scope dans un template que le moteur lui donne, puis le nœud `publish` (`shape=parallelogram, publish="pull-request"`) rend la description et ouvre la pull request.

```json
{
  "publish": {
    "pullRequest": true,
    "draft": false
  }
}
```

- `pullRequest` : la réponse à `publish-consent` ; `false` garde chaque run en local. `skraft publish`, tapé par vous, vaut consentement pour cette publication-là même quand `pullRequest` vaut `false` : le réglage reste tel quel, et le journal enregistre la demande (`publish.requested`).
- `draft` : une pull request ouverte par skraft est un brouillon, sauf si `draft` vaut `false`.
- La base est la branche sur laquelle le run calcule ses diffs (`baseBranch`, `--base`, sinon `main`) ; la tête est la branche de HEAD. skraft la pousse vers la même branche du remote, jamais en force, et ne pousse jamais la base ni la branche par défaut.
- La forge est celle que nomme l'URL du remote (`origin`, sinon le premier), GitHub Enterprise compris ; skraft lance `gh` avec `--repo <hôte>/<owner>/<dépôt>`, un `gh auth login --hostname <hôte>` suffit donc. Dans un fork, `origin` est en général votre fork : skraft y pousse la branche et ouvre la pull request dans le dépôt que nomme `origin`, jamais dans celui que vous avez forké ; une base écrite avec un remote devant (`upstream/main`) nomme la branche de ce remote (`main`). Rien n'est poussé tant que gh ne dit pas quelle est la branche par défaut du dépôt.
- git et ssh ne demandent jamais rien : un push qui attend un mot de passe ou une passphrase échoue tout de suite, et le run le dit.
- Une pull request fermée ou fusionnée de la branche est laissée telle quelle : skraft n'en ouvre pas d'autre. Un corps modifié par quelqu'un depuis que skraft l'a écrit n'est jamais écrasé.
- Ce qu'écrit un agent est rendu inerte avant publication : mots-clés de fermeture suivis d'une référence d'issue et mentions @ passent en code, les balises HTML sont retirées ; seule la ligne `Closes`/`Refs` du moteur renvoie à l'issue.
- Une pull request ouverte pour la branche est mise à jour, seulement si son corps a changé ; skraft n'en ouvre jamais une seconde.
- Sans consentement, sans remote, sans `gh` ou sans connexion, sur une HEAD détachée ou sur la branche de base, le run se termine en local et dit pourquoi. La description reste dans `.copilot-tracking/skraft-plans/<slug>/pull-request.md` ; une fois la cause corrigée, `skraft publish` ouvre ou met à jour la pull request.
- La description commence par `Refs #<issue>` ; `Closes #<issue>` seulement quand la pull request vise la branche par défaut. Décisions, tests, preuves du rouge, gates, revue, résumé du run et mention de l'IA sont rendus depuis le journal ; une section sans donnée enregistrée le dit. What changes, Why, Decisions applied et Out of scope s'affichent sous leur titre ; Tests, RED evidence, Quality gates, Review, Screenshots, Run summary et AI disclosure sont repliées dans un bloc `<details>` qui se déplie au clic, son résumé comptant ce qu'il contient (`Quality gates: 3 passed`, `Review: 2 findings`). Quality gates reste dépliée quand une gate a échoué, Review quand un constat attend un humain (`Review: 4 findings, 1 for a human`). `pull-request.md` suit le même rendu.
- Après chaque étape, le dossier de suivi contient aussi `run-report.md` (temps, coût et relances par étape ; `skraft report` l'affiche) et `WORKFLOW.md` (chaque étape faite, en cours ou à venir).
- Après chaque étape, le dossier de suivi contient aussi `qa-report.md`, pour l'équipe qui qualifie la story, construit par le moteur depuis le seul journal :
  - un lien vers le plan de test qu'écrit DISTILL (`details/<date>/test-plan-<slug>.md`) ;
  - par composant, le dernier résultat de chaque gate avec sa durée et un lien vers son log ; dessous, le score de mutation de chaque périmètre (cœur et frontière, avec son seuil et le nombre de mutants comptés) et chaque mutant resté vivant, y compris dans un périmètre qui atteint son seuil (`mutation report not read` quand le dernier run de mutation n'a laissé aucun rapport lisible) ;
  - les commits rouges des cycles TDD (le test d'acceptation de DISTILL compris) avec le code de sortie du rejeu qui les a prouvés rouges quand le moteur les a rejoués : celui de la commande de test, ou celui de la commande e2e quand toutes les commandes de test passaient au commit ;
  - le dernier passage de chaque revue : son verdict, le nombre de constats des lentilles, ce qu'a dit chaque lentille.

  Aucun pourcentage de couverture n'est affiché : la gate `coverage` ne passe que si sa commande atteint le seuil de qualité, et son log en est la preuve. Un sujet de commit, une ligne de mutant et la raison du statut, écrits par un agent ou un outil, sont chacun dans un bloc de code en ligne.

## Suivre un run sur son issue {#issue-progress}

Un run lancé depuis une issue (`/skraft checkout #42 …`, `skraft init checkout --issue 42`, l'argument `issue` du workflow) la lit d'abord : à son démarrage, le moteur lit l'issue par `gh` sur le dépôt que `gh` choisirait (son défaut, sinon le remote `upstream`, sinon `origin`) et la garde dans `<slug>/plans/<date>/issue-<number>.md`, que chaque agent et chaque lentille de revue lit en premier. Quand l'issue ne peut pas être lue (pas de remote qui nomme un hôte et un dépôt, `gh` absent ou non connecté à cette forge, une forge autre que GitHub, échec de `gh`), le run démarre quand même : ses agents n'ont que le numéro et le titre de l'issue, `run.started` journalise pourquoi dans `issueUnread`, et `skraft init` le dit. Un numéro pour lequel la forge répond sans issue (`issue-not-found`) ou avec une pull request (`issue-is-pull-request`) ne démarre rien. Un run repris ne relit jamais l'issue.

Un tel run tient aussi un seul commentaire sur cette issue, une fois la question `publish-consent` actuelle acceptée :

- posté à la première transition, puis réécrit à chacune : une phase se ferme, une revue renvoie le travail, le run se termine, terminé ou bloqué. Seul le premier envoi notifie les abonnés de l'issue ;
- chaque version montre, une fois le run terminé, son état et le code qui l'a arrêté, chaque phase cochée, en cours ou celle où le run s'est arrêté, la phase suivante, le verdict et le nombre de passes de chaque revue, le dernier résultat de chaque gate avec ses mutants survivants et son log, la pull request ouverte ou mise à jour, les totaux, et toutes les étapes dans un tableau replié.

Le moteur rend le commentaire depuis le journal, à l'identique sous Claude Code, Copilot et la boucle VS Code ; la raison de l'arrêt d'un run, qui peut nommer des chemins de votre machine ou citer un agent, reste dans le dossier de suivi (`run-report.md`). Son dernier corps reste dans `.copilot-tracking/skraft-plans/<slug>/issue-progress.md`, et sa première ligne, un marqueur caché qui nomme le slug, permet à n'importe quelle machine de le retrouver : un run qui a perdu l'URL du commentaire (machine arrêtée juste après l'envoi) le réécrit au lieu d'en poster un second, et un commentaire supprimé par un humain est posté de nouveau. Seuls vos propres commentaires sont réécrits : le jeton de `gh` doit donc pouvoir lire l'utilisateur connecté (`gh api user`) ; sinon aucun commentaire n'est retrouvé ni posté, et chaque transition est journalisée sautée avec cette raison. La forge est celle que nomme le remote, via `gh`, comme pour la pull request. Une transition que la forge ne prend pas (pas de remote, pas de `gh`, pas connecté, refus) est journalisée `issue.comment-skipped` avec la raison et dite dans le log du run ; la transition suivante tient de nouveau tout le run, et le run continue. Un run sans issue ne tient rien ; sans le consentement, ou avec une acceptation d'une question antérieure, chaque transition est journalisée sautée, et un consentement donné plus tard n'en raconte aucune. Une phase que le run a trouvée fermée (`--from-artifacts`) n'est pas une transition.

## Montrer les captures d'un frontend dans la pull request {#visuals}

Une fois la revue de livraison approuvée, le nœud `visuals` (`shape=parallelogram, publish="playwright-visuals"`) lance `commands.e2e` de chaque frontend depuis sa racine ; `when="frontend"` saute le nœud quand aucun composant n'en est un. Un composant React sans `commands.e2e` est invité à en déclarer une. Les captures sont une preuve, pas une gate : quoi qu'il arrive, le run continue jusqu'à la pull request.

Le moteur lit `skraft-visuals/manifest.json` sous la racine du composant quand la commande se termine (il vide d'abord celui d'un run précédent) :

```json
{
  "screenshots": [
    { "title": "Checkout, card paid", "theme": "light", "path": "skraft-visuals/checkout-light.png" },
    { "title": "Checkout, card paid", "theme": "dark", "path": "skraft-visuals/checkout-dark.png" }
  ]
}
```

- `theme` : `light` ou `dark`, le projet Playwright qui a pris la capture ; `path` : un `.png` relatif à la racine du composant, jamais en dehors ; `title` : le texte alternatif, gardé en texte simple (lettres, chiffres, espaces et ponctuation simple, 120 caractères au plus).
- Un manifeste absent ou invalide, ou un fichier qu'il nomme et qui manque, n'enregistre aucune capture et dit pourquoi ; une commande e2e en échec est signalée comme un run e2e en échec, avec son journal dans le dossier de suivi (`visuals/<composant>/e2e-<n>.log`).
- Avec `publish.visuals` à `true`, les captures sont copiées octet pour octet dans `.copilot-tracking/skraft-plans/<slug>/evidence/<slug>/<composant>/<thème>-<n>.png` et commitées seules sur la branche de travail (`docs(evidence): screenshots of <composants>`, `Refs: #<issue>`). Refusé, rien n'est copié et la pull request indique `not published (consent)`. Encore sans réponse quand le nœud s'exécute (un frontend ajouté depuis, ou un workflow sans le nœud de consentement), le nœud pose lui-même `reporting-consent` avant le run e2e.
- La pull request montre au plus six captures de chaque thème d'un composant et dit combien d'autres sont dans son dossier evidence ; un corps de plus de 60 000 caractères voit ses sections les plus longues coupées avec une marque, jamais à l'intérieur d'un bloc `<details>` qu'elle laisserait ouvert, `pull-request.md` le gardant entier.
- Avant de copier, le moteur refuse une capture qui est un lien symbolique, qui se résout hors de son composant ou qui ne commence pas par la signature PNG ; il n'en copie alors aucune, et la pull request nomme les fichiers refusés.
- La section Screenshots de la pull request montre les captures claires, les sombres repliées dans un bloc `<details>`, chacune par son adresse à ce commit : `https://<hôte>/<owner>/<repo>/raw/<sha>/<path>` (github.com comme GitHub Enterprise ; un dépôt privé les montre à un lecteur connecté) ; quand le remote ne nomme aucun dépôt, les chemins, et la section le dit. Après un squash-merge suivi de la suppression de la branche, ce commit peut être nettoyé et les images ne plus s'afficher.

La configuration Playwright du frontend se complète de deux projets et d'un reporter qui écrit le manifeste à partir des captures jointes par les tests : voir les extraits `playwright.config.ts` et `skraft-visuals-reporter.ts` de la [version anglaise]({{ "/en/how-to/customisation" | relative_url }}#visuals). Dans un test, prenez la capture sous `skraft-visuals/` puis joignez-la avec son titre (`testInfo.attach('<titre>', { path, contentType: 'image/png' })`). Ajoutez `skraft-visuals/` au `.gitignore` du frontend : seules les copies du moteur sont commitées.

## Ajouter un agent de votre dépôt {#own-agent}

Après `skraft workflow eject`, ajoutez un nœud box qui nomme un agent de votre dépôt, puis placez-le sur le chemin. Par exemple, une revue de sécurité avant DISTILL remplace l'arête `adr -> distill [label="RATIFIED"]` :

```text
security [shape=box, agent="acme-security-reviewer", phase="DISTILL", outputs="security-review.md"]
adr -> security [label="RATIFIED"]
security -> distill
```

`.claude/agents/acme-security-reviewer.md` (Claude Code) ou `.github/agents/acme-security-reviewer.agent.md` (Copilot) doit exister. Un agent du dépôt écrit ce que son nœud déclare : `outputs=` pour ses documents dans le dossier de suivi, `writes=` pour des chemins de la copie de travail ; tout le reste fait échouer le contrôle des droits d'écriture. Sa phase est DISTILL : un agent de DESIGN ajouté après la revue de conception contournerait cette revue, et `skraft workflow check` le refuse (`security reaches the exit without passing mandatory node design_review`). Avec le nœud ci-dessus, `skraft workflow check` affiche `.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH`. Il refuse un agent introuvable, et `skraft doctor` montre la famille de modèle sur laquelle l'agent tourne. Pourquoi ces décisions restent dans le moteur : [Architecture]({{ "/fr/explanation/architecture" | relative_url }}).

## Risques — réduire les contrôles

Chaque réglage ci-dessus peut aussi **retirer une preuve**. Le moteur fait tourner ce que vous écrivez : il ne sait pas si votre commande teste vraiment quelque chose. Avant de réduire un contrôle, écrivez la raison quelque part où l'équipe la lira (la description de PR, un ADR).

| Ce que vous faites | Ce qui disparaît | Le signe à surveiller |
|---|---|---|
| Retirer une gate d'un composant (supprimer `architecture` ou `coverage`) | La preuve correspondante : plus de contrôle des dépendances, plus de couverture | La gate n'apparaît plus dans la sortie de `skraft gate` ni dans `gates/<composant>/` |
| Retirer une revue, l'appel à `review`, ou sa lentille `test-integrity` ou `architecture-boundaries` | Rien : elles sont `mandatory=true`, le moteur refuse le workflow, `review.skraft.dot` éjecté compris | `mandatory node <id> …; this node is mandatory and cannot be removed` dans la sortie de `skraft workflow check` |
| Déverrouiller le nœud `mutation` | Le mutation testing, et la boucle qui tue les mutants survivants | `skraft workflow diff` montre le déverrouillage ; le run journalise le nœud comme sauté, avec sa raison. Supprimer plutôt la commande `mutation` d'un composant arrête le run à `mutation`, en échec `environment` |
| Remplacer une commande par une qui ne teste rien (`"test": "node -e 0"`, un script qui sort toujours 0, un filtre qui exclut presque tous les tests) | Toute la gate : elle passe à chaque fois, quel que soit le code | Une preuve `pass` dont `stdout` ne montre aucun test lancé |
| Passer un composant en `inprocess` sans test de contrat | La garantie que vos mocks ressemblent encore au vrai service ; les tests passent contre une dépendance imaginaire | Des tests verts, puis une panne à l'intégration |
| Laisser un composant sans gate | Rien ne prouve ce composant ; le moteur le signale en échec `environment` | `no gate command; …` dans la sortie de `skraft gate` |
| Fixer `--base` ou `baseBranch` sur une ref trop récente | Des fichiers modifiés hors du périmètre comparé : des composants touchés ne sont plus retenus par `skraft gate` | `no component changed since its base; no gate to run` alors que vous avez modifié du code |
| Retirer le nœud question `adr` | La ratification humaine des décisions d'architecture : les ADR restent `Proposed` | `skraft workflow diff` montre le nœud disparu. Retirer seulement le `max_visits` de son arête `REJECTED` ne retire rien : le moteur refuse le workflow (`loop adr -> design -> design_review_lenses -> design_review_consistency -> design_review -> adr has no max_visits`) |
| Modifier `events.jsonl` à la main pour débloquer un run | Le journal comme preuve : la chaîne casse et le run est bloqué en `journal-tampered` | Voir [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }}) |

Pour vérifier qu'une gate prouve encore quelque chose, ouvrez sa preuve (`.copilot-tracking/skraft-plans/<slug>/gates/<composant>/<gate>-<n>.log`) et lisez ce que la commande a réellement fait.

Ce que mesure le mutation testing, et pourquoi le retirer coûte cher : [Glossaire]({{ "/fr/reference/glossary" | relative_url }}) (Jia & Harman, 2011).

## Voir aussi

- [Référence skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }})
- [Zéro hook, contrôles dans le moteur]({{ "/fr/explanation/hooks" | relative_url }})
- [Architecture : moteur et pilotes]({{ "/fr/explanation/architecture" | relative_url }})

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
