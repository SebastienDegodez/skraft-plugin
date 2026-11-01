---
title: "Configurer les composants de votre dépôt"
description: "Détecter les composants dans skraft-config.json, ajouter un dépôt voisin, remplacer une commande, ajouter une gate, choisir base et mocks, vérifier."
persona: software-engineer
---

# Configurer les composants de votre dépôt

Obtenez un `skraft-config.json` dont chaque commande tourne sur votre machine, avant de lancer un
run.

## Prérequis

- Le plugin skraft installé ([Installer skraft sur un hôte](./install-on-a-host.mdx)).
- Node 22 ou plus, Git ; Docker ou Podman si un composant garde le mocking Microcks.
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

Sans Docker ni Podman sur votre poste, pour un composant .NET, Java ou Python (TypeScript,
JavaScript et React sont déjà en mémoire par défaut) :

```json
{ "name": "api", "root": "services/payment-api", "stack": "dotnet",
  "mocking": { "strategy": "inprocess" } }
```

Ce que vous perdez : [Adapter skraft : ce que coûte chaque réglage](../explanation/customisation-trade-offs.md).

## 7. Vérifier avec `skraft doctor`

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
| `component web: unknown key comands (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting, mutationReport)` | Corriger la faute de frappe. |
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
