---
title: "Configurer les composants de votre dépôt"
description: "Détecter les composants dans skraft-config.json, ajouter un dépôt voisin, remplacer une commande, ajouter une gate, choisir base et mocks, vérifier."
persona: software-engineer
---

# Configurer les composants de votre dépôt

Obtenez un `skraft-config.json` dont chaque commande tourne sur votre machine, avant de lancer un
run.

`skraft init` propose ce qu'il voit ; le fichier est le vôtre, et le rendre juste vous revient. Le
moteur le prend pour la vérité et n'a aucun moyen de savoir qu'un chemin que vous avez accepté
n'est pas celui que vos outils utilisent — et un chemin faux coûte du silence, pas un échec. Relisez
le résultat de chaque étape avant le run suivant.

## Prérequis

- Le plugin skraft installé ([Installer skraft sur un hôte](./install-on-a-host.mdx)).
- Node 22 ou plus, Git ; Docker ou Podman, sur lequel tournent par défaut Microcks et la base du walking skeleton.
- Un terminal ouvert à la racine de votre copie de travail. `skraft` est la commande que [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.

## 1. Détecter les composants

```console
$ skraft init
```

Le moteur cherche les projets jusqu'à trois niveaux sous la copie de travail, hors dossiers
cachés et `node_modules`, et écrit un composant par projet, avec les commandes par défaut de sa
stack :

```text
skraft-config.json: payment-api (dotnet, services/payment-api), web (react, web)
```

Ouvrez le fichier et relisez chaque commande. Renommez un composant si vous le voulez : la suite
de cette page a renommé `payment-api` en `api`. Relancer `skraft init` n'ajoute que les projets
nouveaux et laisse le reste du fichier tel quel.

## 2. Ajouter un dépôt voisin

```console
$ skraft init --add ../payment-web
```

`--add` prend un dossier relatif à la copie de travail et se répète. Le composant obtenu a pour
racine `../payment-web` ; sa base se calcule dans son propre dépôt.

## 3. Remplacer une commande qui ne marche pas chez vous

Une commande écrite dans `skraft-config.json` est toujours celle qui tourne. Modifiez la ligne :

```json
{ "name": "web", "root": "../payment-web", "stack": "react",
  "commands": { "build": "npm run build", "lint": "npm run lint", "test": "npm run test:ci" } }
```

Écrivez une commande pour un lancement **sans shell**, depuis la racine du composant :

- découpée sur les blancs ; `"…"` ou `'…'` gardent les blancs dans un argument ;
- sans `|`, `&`, `;`, `<`, `>` hors guillemets : pour enchaîner des étapes, appelez un script
  (`npm run test:ci`, `node scripts/ci-test.mjs`) ;
- `npm`, `npx`, `gradlew.bat` s'écrivent pareil sous Windows.

## 4. Ajouter une gate

Ajoutez la commande sous l'un des noms `build`, `format`, `lint`, `test`, `architecture`,
`coverage`, `mutation` (l'ordre d'exécution), ou `e2e`, que `skraft doctor` vérifie mais
qu'aucune gate ne lance :

```json
"commands": {
  "build": "dotnet build --nologo",
  "test": "dotnet test --nologo",
  "architecture": "dotnet test --nologo --filter Category=Architecture",
  "mutation": "dotnet stryker --since:{baseSha}"
}
```

`{baseSha}` est remplacé par la base du dépôt du composant. Les seuils qualité ne se règlent
pas.

## 5. Choisir la base

Écrivez `baseBranch`, global ou par composant :

```json
{
  "baseBranch": "main",
  "components": [
    { "name": "api", "root": "services/payment-api", "stack": "dotnet" },
    { "name": "web", "root": "../payment-web", "stack": "react", "baseBranch": "develop" }
  ]
}
```

`--base <ref>` passé à `skraft init <slug>` ou `/skraft <slug>` l'emporte, puis le
`baseBranch` du composant, puis le global, puis `main`
([règle de base](../reference/skraft-config.md#base)). La base est
journalisée au premier init d'un slug : pour en changer, démarrez un nouveau slug.

## 6. Passer un composant en mocks en mémoire

Sans Docker ni Podman sur votre poste, pour un composant .NET, Java, Python, TypeScript ou
JavaScript (React est déjà in-process par défaut) :

```json
{ "name": "api", "root": "services/payment-api", "stack": "dotnet",
  "mocking": { "strategy": "inprocess" } }
```

Ce que vous perdez : [Adapter skraft : ce que coûte chaque réglage](../explanation/customisation-trade-offs.md).

Les autres rangées de la [politique d'infrastructure](../reference/skraft-config.md#infrastructure)
— le point d'entrée, les gateways internes, l'horloge — gardent le défaut du plugin pour la
stack. Pour en faire tourner une sur autre chose, nommez-la sous `infrastructure`, dans
`skraft-config.json` seulement :

```json
{ "name": "api", "root": "services/payment-api", "stack": "dotnet",
  "infrastructure": { "internalGateway": { "walkingSkeleton": "in-memory" } } }
```

La rangée de la gateway externe suit `mocking.strategy` ; `infrastructure` la refuse.

## 7. Laisser la commande de test afficher ce qui a échoué

Le moteur rejoue chaque test d'acceptation en échec que DISTILL commite et le vert de chaque
scénario avec la commande `test` du composant (et `e2e`), et garde ce qu'affiche la commande dans
un log du run. Il ne lit aucun rapport de test, JUnit ou autre : le juge du rejeu lit ce log
([Commits et rejeux](../reference/gates.md#commits)). La commande `test` n'a donc besoin d'aucune
option de reporter pour skraft ; sa sortie par défaut, qui nomme chaque test en échec et pourquoi,
est ce que lit le juge.

Un rapport qu'une commande écrit dans la copie de travail (le fichier JUnit de votre propre CI, un
dossier TRX) est un changement comme un autre, tenu au périmètre d'écriture : listez-le dans
`.gitignore`. Une clé `testReports` restée d'une version précédente est refusée comme inconnue :
retirez-la.

## 8. Dire si un composant écrit du Gherkin

Chaque composant le dit, d'une façon ou de l'autre : ses tests s'écrivent en Gherkin ou non, et le
moteur ne suppose ni l'un ni l'autre. Pour celui dont l'équipe écrit des tests ordinaires — un
batch, un ordonnanceur — écrivez :

```json
{ "name": "batch", "root": "services/batch", "stack": "python", "bdd": false }
```

Pour celui qui écrit du Gherkin, nommez les dossiers que son runner lit :

```json
{ "name": "api", "root": "services/payment-api", "stack": "dotnet",
  "bdd": [{ "runner": "reqnroll", "features": "tests/Features", "steps": "tests/Steps" }] }
```

`false` ne demande aucun `.feature` à ce composant, et DISTILL prend ses scénarios dans la colonne
`Scenario` du plan de test ; le TDD de DELIVER tourne comme toujours. Une liste tient le composant à
ses scénarios en entier : c'est une pratique qui se déclare, pas une barre à baisser.

Les dossiers sont là où DISTILL écrit et là où le moteur lit : l'acceptance designer les reçoit dans
son brief, ne peut écrire que là, et le Gherkin qu'il écrit utilise des mots-clés anglais quelle que
soit la langue des phrases. Un dossier qui n'existe pas fait échouer `skraft doctor`, et un runner
dont le dossier `steps` manque refuse le run — il n'exécuterait rien.

Une clé absente, et un `true` nu, ne répondent rien : aucun dossier n'est inventé depuis le stack,
parce qu'un dossier que personne n'a choisi est un dossier que le runner peut ne jamais lire. Un run
s'arrête alors avant son premier agent avec
`skraft is not initialised: run /skraft-init (api: bdd is unanswered)`, et `skraft doctor` échoue sur
ce composant. `skraft init` écrit les paires qu'il détecte ; `/skraft-init` demande les autres, et
l'onglet Configuration du canvas skraft montre à la fois ce que dit le fichier et ce que porte la
copie de travail.

## 9. Régler les consentements de publication

Un run qui publie ne démarre qu'une fois qu'ils sont réglés, et `skraft init` vous les laisse :

```json
{ "publish": { "pullRequest": true, "visuals": false, "questionVersions": { "pullRequest": 2, "visuals": 1 } } }
```

`pullRequest` autorise un run à pousser sa branche, ouvrir sa pull request et tenir un commentaire
sur l'issue ; `visuals` à commiter les captures d'un front end. `questionVersions` note à quelle
version de chaque question la réponse a été donnée : une réponse gardée pour une version
antérieure n'est pas réglée. Sans elles, un run est refusé avant son premier agent, avec
`skraft is not initialised: run /skraft-init`.

## 10. Vérifier avec `skraft doctor`

```console
$ skraft doctor
```

Sans `--run`, aucune de vos commandes n'est lancée : le doctor vérifie Node, le fichier, la forge, la
racine de chaque composant, au moins une gate par composant et le programme de chaque commande.

```text
ok    node: Node v22.11.0
ok    config: 2 components: api, web
ok    forge: github, deduced from the Git remote
ok    api/build: dotnet → /usr/local/bin/dotnet
FAIL  web/test: command not found: npx (from ../payment-web); install it or change commands.test in skraft-config.json
skraft doctor: 1 checks failed
```

Corrigez chaque `FAIL`, puis lancez chaque commande une fois, avec la base calculée :

```console
$ skraft doctor --run
```

Résultat attendu : `skraft doctor: every check passed`, ou `no check failed, N with a warning`.
Code de sortie 0.

## Dépannage

Un fichier invalide est refusé en entier, préfixé par `skraft-config.json is invalid: `, toutes
ses erreurs séparées par `; ` :

| Message | Correction |
|---|---|
| `component web: unknown key comands (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting, bdd, mutationReport, infrastructure)` | Corriger la faute de frappe, ou retirer la clé. |
| `component web: root must be a path relative to the working copy` | Écrire `web` ou `../payment-web`, jamais `/srv/web` ni `C:\…`. |
| `components[1].name must be kebab-case, got "Api"` | Minuscules et tirets : `api`. |
| `component api: mocking must be { "strategy": "microcks" or "inprocess" }` | Un objet, pas une chaîne. |
| `component name api is used twice` | Un nom unique par composant. |
| `--add C:\work\payment-web is not relative to the working copy` | Passer un chemin relatif. |

Toutes les clés et tous les messages : [skraft-config.json](../reference/skraft-config.md#validation).

## Étapes suivantes <!-- #next-steps -->

- [skraft-config.json](../reference/skraft-config.md) — schéma, défauts
  par stack, détection.
- [Lancer les gates et lire leurs preuves](./run-gates.md)
- [Choisir les modèles des agents](./choose-models.md)
