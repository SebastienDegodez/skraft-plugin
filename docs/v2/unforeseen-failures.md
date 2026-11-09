# Le moteur skraft face à l'imprévu

> Branche : `feat/unforeseen-failures`, PR #568, empilée sur `feat/564-deliver-per-scenario`
> (PR #567), vers `integration/v2-next` (lots 1 à 5, dans cette seule PR). Lots 6 et 7 : 2.1.0, seulement si les données le
> justifient.
> Ce document est la référence du travail : chaque lot s'y coche, chaque décision s'y écrit.

## 1. Problème

Le moteur V2 gère bien les échecs **prévus** : classes d'échec, disjoncteur, question
RETRY/ABORT, `max_visits`, findings montrés après 3 tentatives. Face à un **imprévu** (hook git
en échec, runtime de conteneurs absent, commande de test fausse, test instable, sortie inconnue
d'un outil), il peut :

- **boucler** : le disjoncteur ne se déclenche pas quand la sortie contient un horodatage, un
  PID ou un chemin variable ;
- **faire payer l'agent** : un échec d'environnement renvoyé à l'agent lui coûte des tours pour
  un problème qu'il ne peut pas corriger ;
- **s'arrêter sans diagnostic** exploitable.

Principe : **le moteur donne l'information, l'agent n'use pas ses tentatives sur ce qu'il ne peut
pas corriger.** Il doit en être ainsi pour les quatre familles de stacks : **.NET, Java, Python et
front (TypeScript, JavaScript, React)**.

Objectif V2 : ne jamais boucler, toujours s'arrêter avec un diagnostic clair. En 2.1, et
seulement si les données le justifient, laisser un LLM trancher une partie des imprévus.

## 2. Constat dans le code

Vérifié sur `integration/v2-next`, plus ce qu'apporte #567.

| Mécanisme existant | Fichier | Limite |
|---|---|---|
| Disjoncteur `sameFailure` | `engine/domain/pipeline/next-step.mjs:258` | compare `JSON.stringify([missing, failures])` brut, sans normalisation ; seulement entre deux tentatives consécutives d'un même nœud |
| Escalade d'une gate | `engine/application/pipeline/run-pipeline-usecase.mjs:792` | seuls les échecs `environment` passent par `escalate` ; les autres suivent `gateRoute` sans disjoncteur par signature |
| Réponse aux questions | `engine/application/pipeline/run-questions.mjs:161` | journalise `by: deps.human.by ?? 'host'`. La provenance existe : `host-confirmed` (dialogue Copilot), `cli-tty` (CLI interactive), `host` (mod Claude Code), filtrée par `HUMAN_PROVENANCES`. Seul le mod Claude Code ne prouve pas qu'un humain a répondu |
| Retry d'agent | `next-step.mjs` (`DEFAULT_ATTEMPTS = 3`, `feedback: last.failures`) | correct ; à ne pas doubler |
| Commit refusé par Git | `engine/application/pipeline/agent-commits.mjs` | déjà non imputé à l'agent (`escalate`), mais le message ne dit pas quel hook ni sa sortie |
| Rejeu des commits (#567) | `engine/application/pipeline/commit-replays.mjs` | `machineReason` escalade un programme qui ne démarre pas et l'absence de runtime de conteneurs ; un rouge **sans rapport** reste imputé à l'agent, même quand la commande n'en écrit jamais (cause config) |
| Textes d'arrêt | `blockText`, `reviewCeilingText`, `environmentText` | incomplets : pas de SHAs, pas de rounds, pas de conséquence par option |
| Mesure par pannes injectées | `eng/regression` | **n'existe pas** ; `eng/e2e-scenarios` rejoue sur un vrai hôte Copilot, coûteux. Le lot 5 vit donc dans les tests d'intégration (vrais processus, vrais hooks git) |

## 3. Flux cible (V2)

```
Étape échoue (agent, gate, commit ou rejeu)
   │
   ▼
Signature NORMALISÉE de l'échec
   étape + cause + preuve, sans horodatage, PID, durée, SHA, GUID, port,
   ni partie variable des chemins (<repo>, <tmp>, <slug>, tentative <n>)
   comptée sur tout le run depuis events.jsonl (survit à la reprise)
   │
   ▼
Incident structuré, dans l'événement step.recorded existant
   catégorie · propriétaire · argv · code de sortie · fin de sortie · tentatives · signature
   │
   ▼
Table cause → propriétaire (codée en dur, domaine)
   ├─ l'agent peut corriger (sortie absente, test rouge, format de commit, hors périmètre)
   │     → retry existant avec le diagnostic (3 tentatives, aucun compteur en plus)
   ├─ environnement ou config (hook, Docker/Podman, commande de test, permissions)
   │     → escalate existant (RETRY/ABORT), jamais l'agent, aucune tentative consommée
   └─ inconnu
         → STOP + diagnostic (questions blocked / environment enrichies)
   │
   ▼
Même signature N fois dans le run → arrêt immédiat + rapport
```

Aucun agent, aucun nœud, aucun tour LLM en plus.

## 4. Décisions

Ce sont les réponses par défaut aux questions ouvertes. Chacune peut être changée avant le lot
qu'elle touche.

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| D1 | Seuil de la signature (**annulé**, voir D13) | **3 occurrences par nœud depuis son dernier passage réussi** ; 2 tentatives consécutives identiques d'un même nœud restent le disjoncteur, désormais normalisé | Un test instable qui échoue une fois puis passe n'atteint jamais 3. Compter sur tout le run arrêtait à tort une boucle qui progresse (mutation qui échoue, passe, puis rechute) : le compte repart à zéro quand le nœud passe, comme `mutation-stalled` |
| D2 | `logs/` et `.tmp/` | **Oui** : ignorés par git, hors contrôle des droits d'écriture | Ce sont des sorties du run, comme les rapports de test que #567 exclut déjà |
| D3 | Déclencheur du lot 6 | Les seuils de la section 7 | Décider sur des données, pas sur une intuition |
| D4 | Suivi | **Ce document**, sans issue séparée ; **une seule PR (#568)** pour les lots 1 à 5, un commit par lot | Demandé (« fais tout dans la même ») |
| D5 | Empreinte (**annulé**, voir D13) | Hash FNV-1a 32 bits de la preuve normalisée, en hexadécimal, calculé en JavaScript pur | Le domaine n'importe pas `node:crypto` ; l'empreinte reste courte dans le journal |
| D6 | `TMPDIR` des commandes du moteur | **Non redirigé** vers `.tmp/` ; seuls les agents sont orientés vers `logs/` et `.tmp/` | Une demande d'autorisation ne vient que d'un outil d'agent, jamais d'une commande lancée par le moteur. Un `TMPDIR` long dans la copie de travail casse les sockets Unix (104 caractères sous macOS) de MSBuild, Gradle ou Python : ce serait créer des imprévus |
| D7 | Fin de sortie d'une commande | **Écrite dans un log** sous `logs/` ; le journal et les questions nomment ce log, sans recopier la sortie | Règle du moteur : les messages sont fixés par le code, jamais de stderr dans le journal ni dans une question |
| D8 | Cause « config » d'un rouge sans rapport | Reconnue par la règle de `skraft doctor` (la commande lance un runner connu qui n'écrit pas de rapport là où `testReports` regarde), sans rejeu au parent | Déterministe et sans coût ; un rejeu au parent confond un composant neuf, sans test, avec une config fausse |
| D9 | « Inconnu » | Une commande arrêtée par un signal ou un plantage : code de sortie > 128 (POSIX) ou code de plantage Windows (≥ `0xC0000000`), hors interruption par une personne (D11) ; elle passe par la question `environment` avec la cause `unknown` | Ni un test rouge, ni une config : l'agent n'y peut rien, l'humain lit le log |
| D10 | Propriétaire sur `step.recorded` | **Pas de champ** : une tentative refusée ou une étape de gates en échec revient toujours à l'agent ; seule une escalade porte un `incident` (`owner`, `log`) | Un champ toujours égal à `agent` n'informe de rien |
| D11 | Interruption par une personne | Exit **130** (SIGINT) ou **`0xC000013A`** (Ctrl-C Windows) : classe `interrupted`, prioritaire sur `unknown` ; le run **s'arrête** (`run.stopped`, reprenable), sans question ni rejeu, aussi au parent | Le spike du lot 6 : un modèle rejoue 3 fois sur 3 un Ctrl-C Windows. Celui qui a interrompu sait pourquoi ; le relancer n'est pas une décision de la machine |
| D12 | `skraft decide` tapé dans le shell d'un agent | **Refusé** : sans TTY (déjà le cas), et aussi quand l'environnement marque le shell d'un agent (`AI_AGENT`, `COPILOT_AGENT_SESSION_ID`, `CLAUDECODE`) | Trou relevé par le spike du lot 6. Mesuré sous l'app Copilot (CLI 1.0.102) : le shell d'agent n'a pas de TTY, en sync comme en async ; la variable couvre un hôte dont le shell async serait un PTY (non mesuré) |
| D13 | Formats lus par le moteur | **Seulement des formats stables** : Conventional Commits, présence d'un fichier, dossier autorisé. **Aucune lecture de rapport de test** (JUnit, xUnit, TRX…) ni de sortie de runner : un LLM lit ce qu'il faut. Lots 1 et 1 bis annulés (signature et normalisation), avec la lecture JUnit étendue aux runners de chaque stack | Décision de l'auteur : mieux vaut payer des tokens que bloquer, ou deviner un format qui bougera ; chaque runner nouveau demandait une version de skraft |
| D14 | Qui juge un red ou un green | **Un agent `replay-judge`**, lancé par le pilote comme le refuteur (les deux hôtes savent le faire), **jamais l'agent qui code**. Le moteur rejoue le commit (et son parent pour un red en échec), garde les logs bruts, puis donne au juge des **pointeurs** (sha, commandes, fin de chaque commande, chemins des logs, scénario) ; le juge lit lui-même, avec RTK s'il est installé. Réponse : `decision` (`accept`, `send-back`, `retry`, `ask-human`) et `note` ; le moteur ne lit que `decision` et garde la réponse telle quelle dans `logs/judge-<sha7>-<red\|green>.md`. Un red dont tout passe est refusé sans juge ; un green est toujours jugé | L'agent qui code pourrait simuler son propre red. La lecture d'un rapport ou d'une sortie dépend du langage et du runner ; un LLM la fait mieux et ne demande aucune version de skraft |
| D15 | Gates en échec | **Renvoyées à l'agent** par l'arête `FAIL`, avec leur log de preuve, même arrêtées par un signal, un plantage ou un délai ; l'agent corrige ou s'arrête `blocked`. Restent à un humain : Ctrl-C (arrêt), un programme introuvable (non démarré, 127, 9009 : fait de l'OS, aucun agent ne l'installe), une gate sans commande (config), une mutation dont le rapport ne se lit pas ou qui s'est arrêtée avant la fin (son rapport peut être celui d'un run précédent). La classe et la cause `unknown` disparaissent | Le LLM essaie d'abord de corriger lui-même ; le code ne garde que des faits valables pour toutes les langues |

## 5. Lots V2

### Lot 1 — Signature normalisée

- [x] Module de domaine pur `engine/domain/pipeline/failure-signature.mjs` :
  - entrée : étape, cause (code d'échec), preuve brute (`missing` et `failures`, ou la sortie
    d'une gate) ;
  - normalisation :
    - horodatages ISO et locaux, dates ;
    - PID ;
    - durées (`12.3 s`, `00:00:04`, `4 ms`, `1m 2s`) ;
    - SHA (7 à 40 hexadécimaux), GUID ;
    - ports éphémères (`localhost:54321`) ;
    - racine de la copie de travail → `<repo>` (le dossier du run est dessous), dossiers
    temporaires → `<tmp>`, slug → `<slug>` ;
    - numéro de tentative → `<n>` ;
    - lignes vides et espaces de fin ; l'ordre des lignes est conservé ;
  - sortie : l'empreinte (D5).
- [x] Remplace `sameFailure` dans `next-step.mjs`.
- [x] S'applique aussi aux échecs de gate (`recordGate` / `gateRoute`). La signature d'une gate
  couvre le log de preuve de chaque gate en échec : la ligne `exited 1` seule confondrait deux
  tests rouges différents.
- [x] `step.recorded` porte `signature` ; le compteur par nœud est relu depuis `events.jsonl`,
  donc conservé à la reprise.
- [x] Même signature 3 fois (D1) :
  - **gate** → code `repeated-failure`, question `blocked` comme au plafond d'une boucle
    (instruction ou STOP) ;
  - **agent** → arrêt final, comme le disjoncteur (`<agent> failed the same way 3 times since
    it last passed`).
- [x] Tests :
  - fixtures de **sorties réelles** des quatre familles de stacks : `dotnet test` (VSTest et
    Microsoft.Testing.Platform), `mvn test` et `gradle test`, `pytest`, `vitest` et `jest`,
    ainsi que `git commit` avec un hook en échec, `docker` et `podman` ;
  - « deux échecs différents restent différents » ;
  - « même échec, horodatage différent → même signature ».

### Lot 2 — Incident structuré, propriétaire et dossier temporaire

Livré ainsi (D6, D7, D8, D10) :
- [x] une escalade (`question.asked` de type `environment`) porte `incident` : `{ owner, log }`,
  `owner` ∈ `environment`, `config`, `unknown` ;
- [x] la question `environment` dit la cause, le log (`Output:`) et ce que fait chaque réponse
  (RETRY relance là où l'étape s'est arrêtée, sans tentative ; ABORT termine le run) ;
- [x] la sortie de chaque rejeu va dans `logs/replay-<sha court>-<composant>-<commande>.log`
  (`-parent` pour le rejeu e2e au commit parent) ; un refus de rouge ou de green nomme ce log, et
  le rejeu journalisé (`commits.checked`) porte `log` ;
- [x] cause `config` : une commande de rejeu sans `test`, à syntaxe shell ou qui installe des
  dépendances ; un rejeu sans rapport dont la commande lance un runner connu qui n'écrit pas de
  JUnit là où `testReports` regarde (D8) ;
- [x] un commit du moteur refusé par Git (hook, identité, verrou) écrit la sortie de Git dans
  `logs/commit-<nœud>.log` et l'escalade la nomme (commit d'un agent sans shell, ratification des
  ADR) ;
- [x] chaque agent est dit d'envoyer la sortie de ses commandes sous `logs/` et ses fichiers
  temporaires sous `.tmp/` du run, jamais sous `/tmp` ni hors de la copie de travail ;
- [x] `logs/` et `.tmp/` ne sont pas des documents de la phase (ni lentilles, ni revue).

- [ ] Incident ajouté à `step.recorded` : `category`, `owner`, `argv`, `exitCode`, `tail` (fin
  de sortie bornée), `attempts`, `signature`.
- [ ] Table `cause → propriétaire` codée en dur dans le domaine :

  | Cause | Propriétaire | Traitement |
  |---|---|---|
  | sortie attendue absente, schéma invalide | agent | retry existant |
  | test rouge au green, format de commit, fichier hors périmètre | agent | retry existant |
  | rouge sans rapport alors que la commande n'en écrit pas non plus au commit parent | config | `escalate` + renvoi vers `skraft doctor` |
  | hook git en échec | environnement | `escalate` (RETRY/ABORT), avec le hook et la fin de sa sortie |
  | Docker / Podman absent ou injoignable | environnement | `escalate` (« start Docker or Podman, then retry ») |
  | programme de la commande de test introuvable | environnement | `escalate` (« could not start … » ; installer le programme ou changer la commande) |
  | commande de test absente, à syntaxe shell, qui installe des dépendances ; runner connu sans rapport JUnit (D8) | config | `escalate`, la raison dit quoi changer dans `skraft-config.json` |
  | permission refusée sur un chemin | environnement | `escalate` |
  | non classée | inconnu | STOP (lot 3) |

- [ ] Une cause « environnement » ou « config » ne consomme **aucune** tentative d'agent.
- [ ] **Dossier temporaire dans le dépôt**, pour éviter les demandes d'autorisation hors du
  dépôt :

  ```
  .copilot-tracking/skraft-plans/<slug>/
     ├─ logs/   sorties des commandes (agents et moteur)
     └─ .tmp/   fichiers temporaires, vidé au début de chaque étape
  ```

  - consigne à tous les agents : sorties sous `logs/`, jamais `/tmp` ni hors de la copie de
    travail ;
  - le moteur lance gates, rejeux et tests avec `TMPDIR`, `TEMP`, `TMP` pointés sur `.tmp/`, et
    `JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=…` pour Java ;
  - `logs/` et `.tmp/` ignorés par git et **exclus du contrôle des droits d'écriture** (D2) ;
  - nom court (`.tmp/`, sans sous-dossier par outil) pour la limite de 260 caractères sous
    Windows.

### Lot 3 — Inconnu : arrêt avec diagnostic

- [x] Un incident « inconnu » (D9 : signal ou plantage, gate ou rejeu) arrête l'étape **sans
  consommer de tentative d'agent** : classe d'échec `unknown`, question `environment`.
- [x] La question est enrichie de l'incident : quoi (la raison), où (l'étape), la commande et son
  code dans la raison, la cause, le log complet ; la fin de sortie reste dans le log (D7).
- [x] Le développeur choisit avec les options existantes ; rien de nouveau à ratifier.
- Un code 128 (Git sur une erreur fatale) reste un échec de vérification, renvoyé à l'agent.

### Lot 4 — Rapport d'arrêt et de fin

Livré ainsi : les questions `blocked`, `review-ceiling` et `environment` se terminent par le chemin
de `run-report.md` (réécrit après chaque étape) ; le rapport porte le reste, une question restant
lisible dans un dialogue d'hôte.

- [x] 1. étape en cours : la question la nomme ; `## Waiting on` nomme la question et son nœud
  (le numéro du scénario reste dans le tableau des étapes et le libellé de l'agent) ;
- [x] 2. SHAs des commits du run : `## Commits` (étape, sha court, sujet, sorte) ;
- [x] 3. verdicts : celui du dernier contrôle de chaque commit dans `## Commits`, l'issue de
  chaque étape dans le tableau des étapes ;
- [x] 4. refus et leur propriétaire : `## Refusals` (renvoyés à l'agent, D10), `## Incidents`
  (cause `environment`, `config` ou `unknown`) ;
- [x] 5. findings ouverts et leurs rounds : la question `review-ceiling` (inchangée) ;
- [x] 6. incidents : signature et nombre d'occurrences dans `## Refusals`, log dans
  `## Incidents` ;
- [x] 7. décision attendue : `## Waiting on` cite la question et la commande `skraft decide` ;
  chaque question dit ce que fait chaque réponse.
- `skraft report --json` porte `waiting`, `commits`, `refusals`, `incidents`.

### Lot 5 — Mesure

Les pannes sont injectées dans `tests/skraft-framework/integration/unforeseen-failures/` : vrais
processus, vrai dépôt Git, vrai hook `pre-commit`, une sortie Testcontainers qui ne trouve aucun
runtime. Ces tests tournent sur Linux, Windows et macOS par la CI existante
(`npm run test:engine`).

| Panne | Attendu |
|---|---|
| hook `pre-commit` qui échoue | `escalate`, 0 tentative d'agent consommée |
| Docker et Podman absents | `escalate`, message vers `skraft doctor` |
| commande de test fausse dans la config | `escalate` (config) |
| agent qui ne produit pas sa sortie | retry existant, puis arrêt au plafond |
| test instable (échoue une fois puis passe) | pas d'arrêt |
| même échec avec horodatage différent | arrêt au seuil (signature identique) |
| **imprévu non classé** (sortie inconnue d'un outil) | STOP avec diagnostic, 0 tentative d'agent consommée |

Mesuré (agents scriptés, donc durées du moteur seul, relevées dans les `at` du journal) :

| Panne | Résultat | Tours d'agent perdus | Panne → arrêt |
|---|---|---|---|
| hook `pre-commit` refusant le commit de ratification | question `environment`, cause machine, `Output` = `logs/commit-adr.log` (le message du hook y est, pas dans le journal) ; RETRY repart | 0 | 150–364 ms (le hook) |
| aucun runtime de conteneurs au rejeu du rouge | question `environment`, `Output` = log du rejeu ; RETRY repart | 0, aucune tentative journalisée | ≤ 1 ms |
| programme de la commande de test introuvable | question `environment` (« could not start ») ; RETRY repart | 0 | ≤ 1 ms |
| agent qui ne produit pas sa sortie | disjoncteur après la tentative 2 (`missing-outputs`) | 1 (la tentative 2) | ≈ 50 ms |
| test instable | pas d'arrêt, run terminé | 1 (passe 2 de l'engineer) | ≈ 80 ms pour repartir |
| même échec, sortie qui varie (heure, durée, dossier temporaire) | question `blocked`, code `repeated-failure`, trois signatures égales | 2 (passes 2 et 3), aucune après | ≈ 150–165 ms |
| commande arrêtée par un plantage (exit 139) | question `environment`, cause `unknown` ; RETRY repart | 0, aucune passe des gates journalisée | ≈ 1 ms |

Lisibilité : chaque arrêt nomme la cause, le log complet et ce que fait chaque réponse ; le
rapport du run (`run-report.md`) liste commits, refus par signature et incidents.

### Fini quand (V2)

- [x] Les scénarios sont écrits d'abord en tests d'acceptation au niveau du cas d'usage, puis
  couverts par les pilotes sur l'hôte simulé.
- [x] La mutation incrémentale est verte (100 % domaine et application) sur les fichiers modifiés.
- [x] Les 7 pannes du lot 5 donnent le résultat attendu (macOS en local ; Linux et Windows par la
  CI de la PR).
- [ ] Aucune demande d'autorisation pour un chemin hors du dépôt pendant un run réel : à
  vérifier sur un run réel (consigne `logs/`/`.tmp/` dans chaque brief ; D6).
- [x] Aucune régression : unitaires, intégration, outillage, CLI, scripts de skills, manuel.

## 6. Lots 2.1 (après mesure)

### Lot 6 — Jugement LLM sur une partie des imprévus

**Idée :** au lieu de s'arrêter sur un imprévu, laisser la session hôte (le LLM de la
conversation Copilot ou Claude Code, déjà présent) choisir une action **sûre** dans un menu
fermé.

**Pourquoi ce n'est pas en V2 :**
- **Provenance incomplète** : sous Copilot (`host-confirmed`) et en CLI (`cli-tty`), seul un
  humain répond. Sous le mod Claude Code (`host`), rien ne le prouve : un LLM pourrait répondre
  ACCEPT à `review-ceiling` ou écrire une instruction libre à `blocked`.
- **Agent déguisé** : ce serait un tour LLM sans brief, sans schéma de sortie et sans coût
  journalisé.
- **Hypothèse d'hôte non vérifiée** : rien ne prouve que la session hôte peut lire la question et
  répondre pendant une pause du workflow Copilot ou du mod Claude Code.
- **Gain inconnu** : on ne sait pas encore quelle part des imprévus un LLM saurait trancher.

**Conception, si les données le justifient :**
1. Un nouveau type de question, `unforeseen`, distinct des questions humaines, avec un menu
   fermé : `RETRY`, `RETRY_WITH_NOTE` (note bornée, passée par le filtre `inert`),
   `SEND_TO:<nœud du graphe>`, `STOP`.
2. La réponse est journalisée `by: host-llm`, avec son coût et son modèle.
3. `review-ceiling`, `adr-ratification` et `blocked` **refusent** toute réponse `by: host-llm`,
   et un test le prouve.
4. Une réponse hors menu → arrêt avec diagnostic, jamais d'attente silencieuse.
5. Au plus un `unforeseen` par signature ; à la deuxième occurrence, la question revient à
   l'humain.
6. Prérequis : une sonde (`eng/host-probe`) prouve, sur les deux hôtes, que la session peut lire
   l'incident et répondre.

### Lot 7 — Table de signatures connues

- Une table codée en dur, versionnée avec le plugin, associe une signature à une action du menu
  fermé.
- L'auteur l'alimente avec les incidents qu'il lit lui-même dans les rapports transmis par les
  développeurs.
- Aucune proposition automatique, aucune nouvelle action hors du menu.

## 7. Déclencheur du lot 6

Il faut décider sur des données, pas sur un nombre arbitraire d'incidents :

| Critère | Seuil | Pourquoi |
|---|---|---|
| Runs réels observés | ≥ 10 runs complets, d'au moins 2 développeurs, sur 2 hôtes | assez de variété d'environnements |
| Signatures **inconnues distinctes** | ≥ 5 | sinon une table codée en dur (lot 7) suffit |
| Part des inconnus qu'un humain a réglés par RETRY ou SEND_TO | ≥ 50 % | c'est la part qu'un LLM pourrait trancher ; en dessous, le gain ne vaut pas le risque |
| Temps humain perdu par arrêt | mesuré | justifie l'effort |

Lecture : si la plupart des arrêts se règlent par une action simple et sûre, le lot 6 vaut la
peine. S'ils demandent pour la plupart une vraie correction (config, code, environnement), un LLM
n'apportera rien de plus qu'un bon diagnostic, et on s'arrête au lot 7.

## 8. Journal des lots

| Lot | Branche / PR | État | Notes |
|---|---|---|---|
| 1 | `feat/unforeseen-failures` (#568) | annulé (D13) | mutation 100 % (domaine, application) ; un journal V2 écrit avant le lot 1 n'a pas de signature : deux échecs consécutifs y déclenchent le disjoncteur (V2 non publiée) |
| 2 | `feat/unforeseen-failures` (#568) | fait | mutation 100 % (domaine, application) |
| 3 | #568 | fait | livré avec le lot 2, même commit |
| 4 | #568 | fait | mutation 100 % |
| 5 | #568 | fait | 7 pannes, `tests/skraft-framework/integration/unforeseen-failures/` ; 3 OS par la CI |
| 1 bis | #567 | annulé (D13) | Le spike du lot 7 a mesuré une signature instable sur sorties réelles (Vitest 5 : jamais égale ; Jest : un essai trop tard ; .NET : `[1].trx`, avertissements du premier build). La normalisation retire désormais couleurs ANSI, parts de durée Vitest, durées et estimation Jest, nom du `.trx`, avertissements SDK, écho `JAVA_TOOL_OPTIONS`, largeur des séparateurs, dossier du plugin ; le motif `<sha>` coupe aussi sur `_`. Une escalade journalise sa `signature` (données du lot 7). Mutation 100 %. Non traité : langue de la sortie .NET, numéros de ligne du runtime JDK/Python (entre machines seulement) |
| 6, 7 | spikes | attendre | Critères de la section 7 non atteints (1 run complet réel, 0 inconnu D9). Lot 7 : table non justifiée (1 entrée possible, 0 arrêt évité sur 13) ; rapport `docs/v2/spike-lot7-known-signatures.md` sur la branche locale `spike/lot7-known-signatures`. Lot 6 : hôte possible sous Copilot CLI 1.0.107, impossible sous Claude Code 2.1.319 ; `standard` règle 60 % des inconnus contre 47 % pour une règle fixe, mais nuit dans 11 % (Ctrl-C rejoué) ; rapport `docs/v2/spike-lot6-llm-judgement.md` sur la branche locale `spike/lot6-llm-judgement`. Re-mesurer à 10 runs complets de 2 développeurs, avec les signatures journalisées des escalades |
| 3 bis | #567 | fait | D11 et D12. Mutation 100 % sur les lignes changées |
| 6 bis | #567 | fait | D13 à D15 : lecture JUnit, signature et normalisation retirées ; agent `replay-judge` (deux arbres) ; rejeu au parent de tout red en échec ; gates en échec renvoyées à l'agent. Données de mesure : chaque verdict du juge est journalisé (`commits.checked`, `replay.judge` : décision, modèle, coût) |
