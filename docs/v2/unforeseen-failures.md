# Le moteur skraft face à l'imprévu

> Branche : `feat/unforeseen-failures`, empilée sur `feat/564-deliver-per-scenario` (PR #567),
> vers `integration/v2-next` (lots 1 à 5). Lots 6 et 7 : 2.1.0, seulement si les données le
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
| D1 | Seuil de la signature | **3 occurrences par nœud depuis son dernier passage réussi** ; 2 tentatives consécutives identiques d'un même nœud restent le disjoncteur, désormais normalisé | Un test instable qui échoue une fois puis passe n'atteint jamais 3. Compter sur tout le run arrêtait à tort une boucle qui progresse (mutation qui échoue, passe, puis rechute) : le compte repart à zéro quand le nœud passe, comme `mutation-stalled` |
| D2 | `logs/` et `.tmp/` | **Oui** : ignorés par git, hors contrôle des droits d'écriture | Ce sont des sorties du run, comme les rapports de test que #567 exclut déjà |
| D3 | Déclencheur du lot 6 | Les seuils de la section 7 | Décider sur des données, pas sur une intuition |
| D4 | Suivi | **Ce document**, sans issue séparée ; **une PR par lot**, empilées | Demandé ; la revue reste lisible lot par lot |
| D5 | Empreinte | Hash FNV-1a 32 bits de la preuve normalisée, en hexadécimal, calculé en JavaScript pur | Le domaine n'importe pas `node:crypto` ; l'empreinte reste courte dans le journal |

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

- [ ] Incident ajouté à `step.recorded` : `category`, `owner`, `argv`, `exitCode`, `tail` (fin
  de sortie bornée), `attempts`, `signature`.
- [ ] Table `cause → propriétaire` codée en dur dans le domaine :

  | Cause | Propriétaire | Traitement |
  |---|---|---|
  | sortie attendue absente, schéma invalide | agent | retry existant |
  | test rouge au green, format de commit, fichier hors périmètre | agent | retry existant |
  | rouge sans rapport alors que la commande n'en écrit pas non plus au commit parent | config | `escalate` + renvoi vers `skraft doctor` |
  | hook git en échec | environnement | `escalate` (RETRY/ABORT), avec le hook et la fin de sa sortie |
  | Docker / Podman absent ou injoignable | environnement | `escalate` |
  | commande de test introuvable | config | `escalate` + renvoi vers `skraft doctor` |
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

- [ ] Un incident « inconnu » arrête l'étape **sans consommer de tentative d'agent**.
- [ ] La question existante (`blocked` ou `environment`) est enrichie de l'incident : quoi, où,
  commande, code, fin de sortie, ce qui a déjà été tenté, chemin du log complet.
- [ ] Le développeur choisit avec les options existantes ; rien de nouveau à ratifier.

### Lot 4 — Rapport d'arrêt et de fin

- [ ] `blockText`, `reviewCeilingText` et `environmentText` complétés, avec ces points imposés :
  1. étape et scénario en cours ;
  2. SHAs des commits du run ;
  3. verdicts par étape ;
  4. refus et leur propriétaire ;
  5. findings ouverts avec leur nombre de rounds ;
  6. incidents (signature, nombre d'occurrences, log) ;
  7. décisions attendues de l'humain, avec la conséquence de chaque option.

### Lot 5 — Mesure

Les pannes sont injectées dans `tests/skraft-framework/integration/unforeseen/` : vrais
processus, vrais hooks git et un `PATH` sans `docker` ni `podman`. Ces tests tournent sur Linux,
Windows et macOS par la CI existante.

| Panne | Attendu |
|---|---|
| hook `pre-commit` qui échoue | `escalate`, 0 tentative d'agent consommée |
| Docker et Podman absents | `escalate`, message vers `skraft doctor` |
| commande de test fausse dans la config | `escalate` (config) |
| agent qui ne produit pas sa sortie | retry existant, puis arrêt au plafond |
| test instable (échoue une fois puis passe) | pas d'arrêt |
| même échec avec horodatage différent | arrêt au seuil (signature identique) |
| **imprévu non classé** (sortie inconnue d'un outil) | STOP avec diagnostic, 0 tentative d'agent consommée |

Pour chaque panne, on relève dans le journal : le nombre de tours perdus, la durée jusqu'à
l'arrêt et la lisibilité du diagnostic.

### Fini quand (V2)

- [ ] Les scénarios sont écrits d'abord en tests d'acceptation au niveau du cas d'usage, puis
  couverts par les pilotes sur l'hôte simulé.
- [ ] La mutation incrémentale est verte (100 % domaine et application) sur les fichiers modifiés.
- [ ] Les 7 pannes du lot 5 donnent le résultat attendu sur les 3 OS.
- [ ] Aucune demande d'autorisation pour un chemin hors du dépôt pendant un run réel.
- [ ] Aucune régression : unitaires, intégration, outillage, CI locale.

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
| 1 | `feat/unforeseen-failures` | fait | mutation 100 % (domaine, application) ; un journal V2 écrit avant le lot 1 n'a pas de signature : deux échecs consécutifs y déclenchent le disjoncteur (V2 non publiée) |
| 2 | | à faire | |
| 3 | | à faire | |
| 4 | | à faire | |
| 5 | | à faire | |
