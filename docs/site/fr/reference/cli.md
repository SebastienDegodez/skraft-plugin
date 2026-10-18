---
layout: doc
lang: fr
title: "La ligne de commande skraft"
description: "Chaque commande de skraft : synopsis, options, effet, sortie texte et JSON, codes de sortie, le nœud de revue du workflow, et ses équivalents dans le mod Claude Code et le workflow Copilot."
persona: software-engineer
---

# La ligne de commande skraft

> `skraft` est la porte d'entrée en ligne de commande du moteur : chaque commande appelle un cas d'usage et affiche ce qu'il rend, sans rien décider elle-même.

## Pourquoi — le problème que ça résout

En v1, l'état d'un run, les gates et les contrôles de l'environnement passaient par de la
prose d'agent, des hooks et des scripts bash. Le résultat changeait selon l'hôte et le
système. La V2 met ces décisions dans un **moteur à cas d'usage** (le code qui décide de
l'ordre des phases, des sorties attendues, des relances et des gates). La ligne de commande
`skraft` donne accès à ce moteur depuis n'importe quel terminal, sous sh comme sous
PowerShell, avec la même sortie et les mêmes codes de sortie.

## Concepts clés — comment ça marche

### Appeler skraft

Le point d'entrée est un script Node livré dans le plugin. Remplacez `<dossier du plugin>`
par le dossier où l'hôte a installé le plugin skraft :

```
node "<dossier du plugin>/engine/drivers/cli/skraft.mjs" <commande>
```

La même forme marche sous sh et sous PowerShell. Lancez-la **depuis la racine de la copie de
travail** : `skraft-config.json` et `.copilot-tracking/` y sont lus et écrits. La suite de la
page écrit `skraft <commande>` pour cette ligne complète. Prérequis : Node 22 ou plus, Git.

La ligne de commande, le mod Claude Code et le workflow Copilot appellent des cas d'usage du
même moteur, pas tous les mêmes : la CLI n'appelle pas `RunPipeline` (elle ne lance aucun
agent) ; le mod et le workflow appellent `Init`, `RunPipeline` et `Observe`.

```mermaid
flowchart LR
    T([terminal]) -->|skraft …| CLI[skraft.mjs]
    M([mod Claude Code]) -->|/skraft, run_pipeline| HP
    W([workflow Copilot]) -->|skraft-pipeline| HP
    CLI --> UC[cas d'usage de la CLI<br/>Init · Observe · RunGate · Doctor<br/>ConfigureComponents]
    HP[cas d'usage des hôtes<br/>Init · RunPipeline · Observe]
    UC --> J[(.copilot-tracking/skraft-plans/)]
    HP --> J
    UC --> C[skraft-config.json]
```

### Synopsis

```
usage: skraft --version
       skraft init [--add <folder>]...                                   detect the components into skraft-config.json
       skraft init <slug> [--issue <number>] [--title <text>] [--base <ref>]   start or resume a pipeline
       skraft status [--json]
       skraft gate [--all] [--json]                                      run the gates of the changed components (all with --all)
       skraft doctor [--run] [--base <ref>] [--json]                     check every command can run (--run: run each once)
```

Règles communes des options :

- une option à valeur s'écrit `--nom valeur` ; une valeur qui commence par `--` n'est pas une
  valeur ;
- une option inconnue, ou répétée sans être répétable, rend la ligne mal formée ; seule
  `--add` se répète ;
- une ligne mal formée affiche l'usage ci-dessus sur stderr et sort avec le code **2**.

### Codes de sortie

| Commande | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `--version` | toujours | — | — |
| `init` (sans slug) | composants écrits ou déjà listés | config invalide, `--add` refusé | ligne mal formée |
| `init <slug>` | le slug est le pipeline actif | refus (`invalid-slug`, `invalid-base`, `config-invalid`, `base-unresolved`, `source-control-unavailable`, `journal-tampered`) | ligne mal formée, `--issue` pas un entier positif |
| `status` | tout statut sauf `tampered` | statut `tampered` | argument autre que `--json` |
| `gate` | gates `passed` (y compris aucun composant modifié) | `failed`, `refused`, `blocked` | ligne mal formée |
| `doctor` | tous les contrôles `ok` | au moins un contrôle `FAIL` | ligne mal formée |
| commande inconnue | — | — | toujours |

Les codes `refused` et `blocked` sont détaillés dans
[Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}).

### `skraft --version`

Affiche la version lue dans le `plugin.json` du plugin. Sortie : une ligne. Code 0.

### `skraft init [--add <folder>]...`

**Effet.** Détecte un composant par projet trouvé dans la copie de travail et dans chaque
dossier `--add`, et les ajoute à `skraft-config.json` (créé s'il manque). Les composants déjà
listés et toutes les autres clés du fichier restent tels qu'écrits. Règles de détection et
défauts par stack : [skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }}).

| Option | Valeur | Règle |
| --- | --- | --- |
| `--add <folder>` | dossier relatif à la copie de travail (`../payment-web`) | répétable ; refusé s'il est absolu ou si ce n'est pas un dossier |

**Sortie (stdout, code 0)** — une de ces lignes :

| Cas | Ligne |
| --- | --- |
| composants ajoutés | `skraft-config.json: <nom> (<stack>, <racine>), …` |
| rien de nouveau, le fichier a déjà une clé `components` (même vide) | `skraft-config.json already lists every project found (N components)` |
| aucun projet trouvé, fichier absent ou sans clé `components` (le fichier est écrit avec `"components": []`) | `no project found; skraft-config.json lists no component` |

**Erreurs (stderr, code 1).**

| Cas | Message |
| --- | --- |
| config invalide | `skraft-config.json is invalid: <erreur>; <erreur>…` |
| `--add` absolu | `--add <folder> is not relative to the working copy` |
| `--add` pas un dossier | `--add <folder> is not a folder` |

### `skraft init <slug> [--issue <number>] [--title <text>] [--base <ref>]`

**Effet.** Fait de `<slug>` le pipeline actif de la copie de travail (écrit
`.copilot-tracking/skraft-plans/.active-slug`) et ouvre son journal. Au **premier** init d'un
slug, le moteur lit `skraft-config.json`, calcule la base de chaque dépôt et écrit
l'événement `run.started`. Un init sur un slug qui a déjà un journal le reprend : la config
n'est pas relue, et la story et `--base` sont ignorés (la base journalisée reste).

| Argument / option | Valeur | Règle |
| --- | --- | --- |
| `<slug>` | kebab-case (`checkout-by-card`) | sinon refus `invalid-slug` |
| `--issue <number>` | entier positif sans zéro initial | sinon ligne mal formée (code 2) |
| `--title <text>` | un seul argument ; mettez-le entre guillemets s'il a des blancs | — |
| `--base <ref>` | ref git : sans blanc, ne commence pas par `-` | lu seulement au premier init du slug : sinon refus `invalid-base` ; prioritaire sur tout `baseBranch`. Sur un slug qui a déjà un journal, il est ignoré, même invalide |

**Sortie.** Succès : `<slug> is the active pipeline` sur stdout, code 0. Refus : le message
du moteur sur stderr, code 1, par exemple :

| Code | Message |
| --- | --- |
| `invalid-slug` | `slug must be kebab-case, got "<slug>"` |
| `invalid-base` | `--base must be a git ref, got "<ref>"` |
| `config-invalid` | `skraft-config.json is invalid: <erreurs>` |
| `base-unresolved` | `the working copy (<dépôt>) has no merge base with <ref>` ou `component <nom> (<dépôt>) has no merge base with <ref>`, un par dépôt sans base, joints par `; `, puis `; set baseBranch in skraft-config.json or pass --base <ref>` |
| `source-control-unavailable` | `<erreur>; the components of skraft-config.json need Git for their base` |
| `journal-tampered` | `journal tampered: events.jsonl line N …; restore the file or start a new slug` |

`init <slug>` ne lance aucun agent depuis le terminal : c'est le mod ou le workflow qui
déroule le pipeline.

### `skraft status [--json]`

**Effet.** Lit le pipeline actif et son journal, sans rien écrire.

**Sortie texte** — dans cet ordre, chaque ligne seulement si elle s'applique :

```
skraft <slug>: <status>
RESEARCH  pending|open|closed
agent: <agent> (<step>, attempt <n>)
cost: <montant> USD
<raison>
```

Sans pipeline actif, la première ligne est `skraft: idle`.

**Sortie `--json`** — l'objet de vue du pipeline :

| Champ | Type | Contenu |
| --- | --- | --- |
| `slug` | string ou null | pipeline actif, `null` si aucun |
| `status` | string | `idle`, `not-initialised`, `running`, `done`, `blocked`, `tampered` |
| `reason` | string | raison du statut, vide si aucune |
| `phases` | `[{ phase, state }]` | une entrée par phase ; `state` = `pending`, `open` ou `closed` |
| `current` | `{ step, phase, agent, attempt }` ou null | tentative en cours, `null` sinon |
| `attempts` | number | nombre de tentatives démarrées |
| `costUsd` | number ou null | somme des coûts journalisés, `null` si aucun |

Signification de chaque statut :
[Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}). Code 1
seulement pour `tampered`.

> **À venir.** Seule la phase RESEARCH figure dans `phases` aujourd'hui. DESIGN, DISTILL et
> DELIVER s'y ajoutent au lot 3.

### `skraft gate [--all] [--json]`

**Effet.** Lance les gates du pipeline actif : les commandes nommées `build`, `format`,
`lint`, `test`, `architecture`, `coverage`, `mutation` de chaque composant, dans cet ordre,
depuis la racine du composant. Chaque gate écrit une preuve et un événement `gate.ran`. Un
composant s'arrête à sa première gate en échec ; les autres composants continuent.

| Option | Effet |
| --- | --- |
| (aucune) | portée `touched` : seulement les composants modifiés depuis leur base |
| `--all` | portée `all` : tous les composants |
| `--json` | sortie JSON au lieu du texte |

**Sortie texte** — une ligne par gate lancée, puis une ligne de synthèse :

```
pass  web/lint
fail (environment)  web/test: <raison>
skraft <slug>: gates <status> — <raison>
```

Pour un refus ou un blocage, la synthèse porte le code : `skraft <slug>: gates refused
(<code>) — <raison>`.

**Sortie `--json`** :

| Champ | Type | Contenu |
| --- | --- | --- |
| `status` | string | `passed`, `failed`, `refused`, `blocked` |
| `slug` | string ou null | pipeline actif |
| `scope` | string | `touched` ou `all` |
| `components` | string[] | composants retenus |
| `gates` | `GateResult[]` | voir ci-dessous |
| `failure` | string ou null | `environment` si au moins un échec d'environnement, sinon `deterministic` en cas d'échec, `null` sans échec |
| `code` | string ou null | code de refus ou de blocage |
| `reason` | string | synthèse |
| `phase` | null | présent seulement sur un refus ou blocage venu du pipeline actif |

Chaque `GateResult` : `component`, `gate` (`none` pour un composant sans commande de gate),
`status` (`pass`, `fail`), `failure` (`environment`, `deterministic`, `null`), `reason`,
`evidence` (chemin absolu du fichier de preuve ; pour la gate `none`, le dossier
`gates/<composant>`, où aucun fichier n'est écrit).

| Résultat | `reason` de synthèse |
| --- | --- |
| tout passe | `N gates passed on <composants>` |
| aucun composant modifié | `no component changed since its base; no gate to run` |
| au moins un échec | `<composant>/<gate>: <raison>; …` |

Codes possibles : `no-active-pipeline`, `not-initialised`, `config-invalid`, `no-components`
(refused) ; `journal-tampered`, `journal-changed` (blocked). Raisons d'échec, classes
d'échec et format des preuves :
[skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }}) et
[Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}).

### `skraft doctor [--run] [--base <ref>] [--json]`

**Effet.** Vérifie que chaque commande de chaque composant peut tourner sur cette machine.
N'écrit rien dans le journal.

| Option | Effet |
| --- | --- |
| `--run` | lance chaque commande une fois depuis la racine de son composant, avec la base calculée |
| `--base <ref>` | ref de base pour `--run` ; sans `--run`, elle n'est pas lue |
| `--json` | sortie JSON |

Contrôles, dans l'ordre :

| Sujet | Passe si | Détail en échec |
| --- | --- | --- |
| `node` | Node 22 ou plus | `Node <version>; skraft needs Node 22 or later` |
| `config` | fichier présent, valide, au moins un composant | `skraft-config.json is invalid: …` ; `no skraft-config.json; run skraft init to detect the components` ; `skraft-config.json lists no component; run skraft init to detect them` |
| `base` (avec `--run`) | la base se calcule | message de `invalid-base`, `base-unresolved` ou `source-control-unavailable` |
| `<composant>` | la racine est un dossier | `root <racine> is not a folder` (ses commandes ne sont pas contrôlées) |
| `<composant>` | au moins une commande de gate | `no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json` |
| `<composant>/<commande>` | la ligne se découpe et son programme est trouvé (PATH, et PATHEXT sous Windows) | `"<ligne>" <raison>` ; `command not found: <programme> (from <racine>); install it or change commands.<nom> in skraft-config.json` (pour `python`, `(from <racine>; looked for .venv/bin/python, .venv/Scripts/python.exe, python, python3)`) |
| `<composant>/<commande>` avec `--run` | la commande sort avec 0 | `<commande lancée> exited <code>` (base remplacée, interpréteur choisi) |
| `docker` | `docker info` répond, si un composant mocke avec Microcks | `Docker does not answer, and Microcks, the mocking of <composants>, needs it; start Docker, or set "mocking": { "strategy": "inprocess" } on the component` |

Les commandes d'un composant sont contrôlées gates d'abord (dans l'ordre des gates), puis
`e2e` dans l'ordre du fichier. Le doctor s'arrête après `config` si la config
est invalide, absente ou vide. Sans `--run`, `{baseSha}` est remplacé par `HEAD` pour le
seul découpage.

**Sortie texte** :

```
ok    node: Node v22.…
FAIL  web/test: command not found: npx (from ../payment-web); install it or change commands.test in skraft-config.json
skraft doctor: 1 checks failed
```

La dernière ligne est `skraft doctor: every check passed` ou `skraft doctor: N checks failed`.

**Sortie `--json`** : `{ "ok": boolean, "checks": [{ "subject", "status": "ok"|"fail", "detail" }] }`.

### Nœud de revue (`shape=component`)

Le workflow est un graphe DOT : le `workflows/skraft.dot` du plugin, ou le
`skraft-workflow.dot` du dépôt écrit par `skraft workflow eject`. Un nœud de revue lance des
lentilles, des agents en lecture seule, sur ce que le run a changé, et le moteur calcule son
verdict à partir de leurs findings.

```dot
deliver_review [shape=component, lenses="test-integrity,architecture-boundaries,cold-reader,mock-fidelity,contract-fidelity"]
deliver_review -> deliver [label="NEEDS_REWORK", max_visits=3]
deliver_review -> exit    [label="APPROVED"]
```

| Règle | Détail |
| --- | --- |
| `lenses` | obligatoire ; noms kebab-case séparés par des virgules, chacun une fois |
| Agent d'une lentille | la lentille `<nom>` est l'agent `<nom>-lens`, cherché dans le plugin, puis dans `.claude/agents/` (Claude Code) ou `.github/agents/` (Copilot) ; `finding-refuter` doit aussi être trouvé, sinon le workflow est refusé |
| Arête `APPROVED` | exactement une ; une arête sans étiquette compte comme `APPROVED` |
| Arête `NEEDS_REWORK` | au plus une ; sans elle, un `NEEDS_REWORK` arrête le run avec `review-rejected` ; au-delà de son `max_visits`, avec `loop-ceiling` |
| Pilote | le pilote d'hôte lance les lentilles et le réfuteur (profondeur 1) ; aucun agent n'en lance un autre |

**Ce que lit chaque lentille.** Toutes les lentilles sauf `cold-reader` lisent aussi le
`context.md` de la revue (story, règles du projet, qui a écrit quel document). Les fichiers sont
dans `reviews/<nœud>-<visite>/` ([Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }})).

| Lentille | Lit |
| --- | --- |
| `fitness`, `business-alignment` | documents de la phase, de la story et des autres phases |
| `architecture-compliance`, `testability`, `boundary-enforcement` | documents de la phase, patch, chemins changés |
| `architecture-boundaries` | documents de la story et des autres phases, patch, chemins changés |
| `cold-reader` | patch et chemins changés seulement : ni story, ni périmètre, ni contexte |
| `mock-fidelity`, `contract-fidelity` | patch, chemins changés, `components.json` |
| toute autre lentille (`consistency`, `coverage`, `test-integrity`, une lentille du dépôt) | tout ce qui précède |

Le patch contient tous les changements depuis la base du run, hors dossier de suivi. Un chemin
changé sans section dans le patch est un fichier nouveau non suivi : la lentille l'ouvre.

**Lentilles conditionnelles.** Une lentille à déclencheur ne tourne que si un chemin changé ou
une ligne que le patch ajoute ou garde lui correspond ; sinon la revue tourne sans elle.

| Lentille | Chemin | Ligne |
| --- | --- | --- |
| `mock-fidelity` | un nom de fichier contenant `mock`, `stub` ou `fake` | `WireMock…`, `MockServer`, `Microcks…`, `Mountebank`, `HttpMessageHandler`, `nock`, `msw` |
| `contract-fidelity` | un nom de fichier contenant `contract`, `.apiexamples`, `.apimetadata`, `openapi….yaml/json` | `VerifyAsync`, `Pact…`, `ProviderVerifier`, `ContractTest` |

Dans `components.json`, un composant sans `mocking` utilise Microcks ; un composant sans
`contractTesting: true` ne demande aucun test de contrat.

**Skills.** Le brief donne à chaque lentille le `SKILL.md` de chaque skill que son descripteur
liste sous `metadata.skills`, pris dans le plugin, puis dans `.claude/skills/` ou
`.github/skills/`. Une skill qu'une lentille ou `finding-refuter` liste et qui est introuvable
refuse le workflow, en nommant le nœud, l'agent et la skill. La lentille les lit avant toute
autre entrée.

**Réponse.** Une lentille termine son dernier message par un document YAML dans un bloc
clôturé ; le moteur lit le dernier bloc clôturé du message.

```yaml
lens: test-integrity
verdict: fail            # pass | fail | inconclusive
findings:                # [] quand elle ne trouve rien
  - id: F1
    gate: G9             # la gate de la table de la lentille
    severity: blocker    # blocker | high | medium | low
    location: "tests/Orders.UnitTest/RefundTests.cs:42"
    description: "le montant attendu 90 est devenu Assert.NotNull"
    suggestion: "rétablir Assert.Equal(90, refund.Amount)"   # facultatif
```

| Règle | Détail |
| --- | --- |
| Clés | seulement `lens`, `verdict`, `findings` ; par finding `id`, `gate`, `severity`, `location`, `description`, `suggestion` ; toute autre clé refuse la réponse |
| Obligatoire | `gate` et `description` ; un `id` absent devient le premier `F<n>` libre |
| Valeurs | textes libres entre guillemets doubles ou en bloc littéral ; ni ancre, ni alias, ni tag ; casse de `verdict` et `severity` normalisée |
| Plafond | au plus 20 findings ; un `pass` avec un finding blocker, high ou medium est refusé |
| Textes | ramenés sur une ligne et tronqués (description : 500 caractères) |
| Réponse refusée | la lentille est relancée une fois avec la raison ; une seconde réponse illisible arrête le run avec `lens-unreadable` ; une reprise ne relance que les lentilles dont la réponse était illisible |

**Réfutation.** Les findings de lentilles différentes au même `chemin:ligne` (le chemin normalisé
comme ceux du patch : `./src\Checkout.cs:12` est `src/Checkout.cs:12`) et de même sévérité
forment un groupe. Chaque groupe de findings blocker, high ou medium part une fois chez
`finding-refuter`, son libellé et son brief nommant chaque lentille du groupe, avec les entrées et
les skills de ces lentilles. Il répond `confirmed`, `refuted` (sa `reason` cite le `chemin:ligne`
lu) ou `unverifiable`, et la réponse vaut pour chaque finding du groupe. Un finding réfuté ne
compte pas ; un finding invérifiable compte, comme celui dont la vérification a été illisible
deux fois.

**Verdict.** Une lentille qui répond `inconclusive`, ou `fail` sans finding blocker, high ou
medium, bloque la revue avec `lens-inconclusive`, en nommant chacune de ces lentilles et ce
qu'elle a noté : le travail n'est pas renvoyé et aucun finding n'est vérifié. Sinon
`NEEDS_REWORK` quand un finding blocker, high ou medium compte, sinon `APPROVED` (les findings
low sont des notes). Les findings retenus vont dans le brief suivant de l'agent de la phase, un
groupe sur une ligne qui cite chacune de ses lentilles.

**Re-revue incrémentale.** À une passe suivante, une lentille dont le résultat précédent était
`pass` sans finding, et dont l'empreinte n'a pas changé, n'est pas relancée : son résultat est
journalisé de nouveau avec `reused: true`. L'empreinte couvre ses entrées, le contenu de chaque
`SKILL.md` qu'elle lit (par nom de skill : déplacer la copie de travail ou le plugin n'y change
rien), les fichiers de règles du projet et le contenu de chaque chemin changé qu'elle lit.

### Équivalents dans le mod Claude Code

Le mod Claude Code (le pilote d'hôte de Claude Code) appelle `Init`, `RunPipeline` et
`Observe`, sans Node : il lance git par `$.process.run`. Chaque `/skraft` ouvre le panneau
**Skraft**.

| Dans la conversation | Effet | Réponse |
| --- | --- | --- |
| `/skraft <slug> [#issue] [titre…] [--base <ref>]` | Init du slug, puis run en arrière-plan | `skraft <slug> started — progress in the Skraft pane.` |
| `/skraft`, `/skraft status`, `/skraft help` | vue du pipeline actif | `skraft <slug> — <status>`, une ligne par phase (`✓` closed, `▶` open, `·` pending), raison, agent, `cost: $<montant>` |
| `/skraft decide …` | aucune question avant le lot 5 | `skraft: no question is pending for <slug>; nothing to decide.` |

Dans `/skraft <slug> …`, `#<nombre>` placé juste après le slug donne l'issue ; le reste des
mots forme le titre ; `--base <ref>` peut se placer n'importe où après le slug. Autres
réponses :

| Cas | Réponse |
| --- | --- |
| Init refusé | `skraft <slug>: not started — <raison>` |
| un run tourne déjà | `skraft is already running <slug>; see the Skraft pane.` |
| fin du run (notification) | `skraft <slug>: <status> (<code>) — <raison>` |

Le panneau **Skraft** montre les phases, l'agent en cours, le coût et les dernières
lignes du journal de progression, autant que la hauteur du panneau en laisse.

**Outil `mcp__skraft__run_pipeline`** (appelé par le modèle) : démarre ou reprend le
pipeline et rend la main tout de suite ; le run continue en arrière-plan.

| Champ | Type | Règle |
| --- | --- | --- |
| `slug` | string | kebab-case ; absent ou vide → reprend le pipeline actif ; l'outil ne choisit jamais de slug |
| `issue` | integer | pris seulement s'il est positif |
| `title` | string | titre de la story |
| `base` | string | ref git ; seulement pour un nouveau slug |

### Équivalents dans le workflow Copilot CLI

Le workflow dynamique `skraft-pipeline` lance les agents par `ctx.agent`.

| Arg | Type | Règle |
| --- | --- | --- |
| `slug` | string | présent → Init puis run ; absent → reprise du pipeline actif |
| `issue` | integer | numéro de l'issue |
| `title` | string | titre de la story |
| `base` | string | ref git ; seulement pour un nouveau slug |
| `agentIds` | object | `{ "<id du fichier agent>": "<id de l'agent dans la session>" }` |

Le workflow rend `{ status, slug, phase, code, reason }` (`status` = `done`, `blocked` ou
`refused`) et journalise `<slug>: <status> (<code>): <raison>`. Une reprise ne relance pas un
agent dont les sorties sont déjà remplies.

**Outil `skraft_decide`** { `key`, `answer` } : aucune question n'est en attente avant le
lot 5. Il répond `Refused: <slug> has no pending question; nothing was recorded.`, ou
`Refused: <raison>` sans pipeline actif.

> **À venir.** `skraft decide` et les questions aux humains arrivent au lot 5. Sous VS Code,
> le pilote SDK Copilot et le repli `skraft next` / `skraft record` sont prévus au lot 10.

## Pourquoi cette pratique

> « Good architecture makes the system easy to understand, easy to develop, easy to maintain, and easy to deploy. »
> — Martin, R. C., *Clean Architecture*, 2017.

La ligne de commande, le mod et le workflow ne sont que des pilotes d'hôte. Ils traduisent
une commande en appel de cas d'usage et affichent le résultat. Une règle changée dans le
moteur change donc partout à la fois, et un comportement observé sous un hôte se reproduit
au terminal.

## Pièges & anti-patterns

- **Lancer skraft hors de la racine** : la config et le dossier de suivi sont lus depuis le
  dossier courant. Ailleurs, `status` répond `idle` et `gate` refuse.
- **Lire le code 1 de `status` comme une erreur de run** : seul `tampered` sort avec 1. Un
  run `blocked` sort avec 0 ; lisez le statut.
- **Passer `--base` pour un slug existant** : la base est fixée au premier init. Démarrez un
  nouveau slug pour en changer.
- **Scripter sur la sortie texte** : utilisez `--json`, dont les champs sont listés ici.

## Pour aller plus loin

- [Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }})
- [Lancer les gates et lire leurs preuves]({{ "/fr/how-to/run-gates" | relative_url }})
- [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }})
- [skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }})
- [Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }})
- [Moteur, pilotes, profondeur 1]({{ "/fr/explanation/architecture" | relative_url }})

## Sources

- Martin, R. C. *Clean Architecture*, 2017.

Termes à connaître : **moteur**, **pilote d'hôte**, **slug**, **gate** — voir le
[glossaire]({{ "/fr/reference/glossary" | relative_url }}).
