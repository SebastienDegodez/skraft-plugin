---
layout: doc
lang: fr
title: "Configurer les composants de votre dépôt"
description: "Détecter les composants dans skraft-config.json, ajouter un dépôt voisin, remplacer une commande, ajouter une gate, choisir la base, passer en mocks en mémoire et vérifier le tout avec skraft doctor."
persona: software-engineer
---

# Configurer les composants de votre dépôt

**But** : obtenir un `skraft-config.json` dont chaque commande tourne sur votre machine, avant de lancer un run.

Un **composant** est un projet que le moteur sait construire et tester : un nom, une racine, une stack et des commandes. Le fichier `skraft-config.json` vit à la racine de la copie de travail qui lance le run.

## Prérequis

- Le plugin skraft installé (voir [Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }})).
- Node 22 ou plus, Git.
- Docker si un composant garde le mocking par défaut (Microcks).
- Un terminal ouvert à la racine de votre copie de travail.

La ligne de commande se lance ainsi, sous sh comme sous PowerShell :

```
node "<dossier du plugin>/engine/drivers/cli/skraft.mjs" <commande>
```

`<dossier du plugin>` est le dossier où l'hôte (Claude Code ou Copilot CLI) a installé le plugin skraft. La suite de cette page écrit `skraft <commande>` pour cette forme.

## 1. Détecter les composants

```
skraft init
```

Le moteur cherche les projets jusqu'à trois niveaux sous la copie de travail. Il ignore les dossiers cachés et `node_modules`. Il écrit un composant par projet trouvé, avec des commandes par défaut selon la stack.

Sortie possible :

```
skraft-config.json: payment-api (dotnet, services/payment-api), web (react, web)
```

Le nom d'un composant vient du nom de son dossier, en kebab-case. Vous pouvez le changer dans le fichier : la suite de cette page a renommé `payment-api` en `api`.

Relancer `skraft init` ne touche ni aux composants déjà listés ni aux autres clés du fichier. Il n'ajoute que les projets nouveaux :

```
skraft-config.json already lists every project found (2 components)
```

Si rien n'est trouvé et que le fichier n'a pas encore de clé `components`, il est écrit avec une liste vide :

```
no project found; skraft-config.json lists no component
```

Si le fichier a déjà `"components": []`, la sortie est `skraft-config.json already lists every project found (0 components)`.

Ouvrez le fichier et relisez-le. Les commandes détectées sont un point de départ, pas une promesse.

## 2. Ajouter un dépôt voisin

Votre front vit dans un autre dépôt, à côté du vôtre ? Ajoutez son dossier :

```
skraft init --add ../payment-web
```

`--add` se répète pour plusieurs dossiers. Le chemin doit être relatif à la copie de travail. Deux refus possibles (code 1) :

```
--add C:\work\payment-web is not relative to the working copy
--add ../payment-wbe is not a folder
```

Le composant obtenu a une racine `../payment-web`. Sa base se calcule dans son propre dépôt.

## 3. Remplacer une commande qui ne marche pas chez vous

Une commande écrite dans `skraft-config.json` est **toujours** celle qui tourne. Le moteur ne la remplace jamais par un défaut. Modifiez la ligne :

```json
{ "name": "web", "root": "../payment-web", "stack": "react",
  "commands": { "build": "npm run build", "lint": "npm run lint", "test": "npm run test:ci" } }
```

Règles d'écriture d'une commande :

- Elle est lancée **sans shell**, depuis la racine du composant.
- Elle est découpée sur les blancs. `"…"` ou `'…'` gardent les blancs dans un argument.
- Pas de `|`, `&`, `;`, `<`, `>` hors guillemets. Pour enchaîner des étapes, écrivez un script et appelez-le (par exemple un script npm ou `node scripts/ci-test.mjs`).
- Sous Windows, écrivez `npm`, `npx` ou `gradlew.bat` comme ailleurs : le moteur passe par cmd.exe pour les `.cmd` et `.bat`.

## 4. Ajouter une gate

Une **gate** est une commande nommée que le moteur lance pour prouver la qualité. Les noms de gate, dans leur ordre d'exécution : `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`. Le seul autre nom accepté, `e2e`, n'est pas une gate, mais `skraft doctor` le vérifie quand même ; tout autre nom rend la configuration invalide.

Ajoutez la commande sous son nom :

```json
"commands": {
  "build": "dotnet build --nologo",
  "test": "dotnet test --nologo",
  "architecture": "dotnet test --nologo --filter Category=Architecture",
  "coverage": "dotnet test --nologo --collect \"XPlat Code Coverage\"",
  "mutation": "dotnet stryker --since:{baseSha}"
}
```

`{baseSha}` est remplacé par la base du dépôt du composant. Une mutation limitée au code modifié depuis la base reste rapide.

Les seuils qualité ne se règlent pas dans ce fichier.

## 5. Choisir la base

La **base** est le commit à partir duquel le moteur compare votre travail : `git merge-base HEAD <ref>`, dans le dépôt de chaque composant. La ref est choisie dans cet ordre :

| Priorité | Où | Exemple |
|---|---|---|
| 1 | `--base` sur `skraft init <slug>` ou `/skraft <slug> --base <ref>` | `--base release/2.3` |
| 2 | `baseBranch` du composant | `"baseBranch": "develop"` |
| 3 | `baseBranch` global | `"baseBranch": "main"` |
| 4 | défaut | `main` |

Si la branche locale n'existe pas, le moteur essaie `origin/<ref>`.

```json
{
  "baseBranch": "main",
  "components": [
    { "name": "api", "root": "services/payment-api", "stack": "dotnet" },
    { "name": "web", "root": "../payment-web", "stack": "react", "baseBranch": "develop" }
  ]
}
```

La base est journalisée au premier init d'un slug. Une reprise garde la base journalisée : pour changer de base, démarrez un nouveau slug.

## 6. Passer un composant en mocks en mémoire

Par défaut, un composant mocke ses dépendances avec Microcks, qui tourne dans un conteneur (Docker ou Podman) pendant les tests qui l'utilisent.

Sans Docker sur votre poste, passez le composant en `inprocess` :

```json
{ "name": "web", "root": "../payment-web", "stack": "react",
  "mocking": { "strategy": "inprocess" } }
```

Lisez d'abord les risques dans [Personnaliser SKRAFT]({{ "/fr/how-to/customisation" | relative_url }}).

## 7. Vérifier avec `skraft doctor`

```
skraft doctor
```

Sans `--run`, le doctor ne lance aucune de vos commandes. Il contrôle : Node, le fichier de config, la racine de chaque composant, au moins une gate par composant, le programme de chaque commande (dans le PATH, avec PATHEXT sous Windows). Il ne cherche ni Docker ni Podman : un test qui en a besoin échoue quand il tourne.

```
ok    node: Node v22.11.0
ok    config: 2 components: api, web
ok    api/build: dotnet → /usr/local/bin/dotnet
FAIL  web/test: command not found: npx (from ../payment-web); install it or change commands.test in skraft-config.json
skraft doctor: 1 checks failed
```

Pour lancer réellement chaque commande une fois, avec la base calculée :

```
skraft doctor --run
skraft doctor --run --base develop
```

Code de sortie : 0 si tout passe, 1 sinon. `--json` donne le même rapport en JSON.

## 8. Corriger les erreurs de validation courantes

Un fichier invalide est refusé en entier, avec la liste de toutes ses erreurs, séparées par `; `. Messages réels :

| Message | Correction |
|---|---|
| `component web: unknown key comands (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting)` | Corriger la faute de frappe ; un composant n'accepte que ces clés. |
| `component web: root must be a path relative to the working copy` | Remplacer `/srv/web` ou `C:\…` par un chemin relatif (`web`, `../payment-web`). |
| `components[1].name must be kebab-case, got "Api"` | Nom en minuscules et tirets : `api`, `payment-api`. |
| `component api: unknown command Test (allowed: build, format, lint, test, architecture, coverage, mutation, e2e)` | Écrire `test`. |
| `component api: mocking must be { "strategy": "microcks" or "inprocess" }` | Écrire un objet, pas une chaîne : `"mocking": { "strategy": "inprocess" }`. |
| `component name api is used twice` | Donner un nom unique à chaque composant. |

Ces erreurs remontent préfixées par `skraft-config.json is invalid: ` dans `skraft init`, `skraft doctor` et `skraft gate`. Au démarrage d'un run, le refus porte le code `config-invalid`.

## Voir aussi

- [Référence skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }}) — toutes les clés et tous les défauts par stack.
- [Référence de la ligne de commande]({{ "/fr/reference/cli" | relative_url }})
- [Lancer les gates et lire leurs preuves]({{ "/fr/how-to/run-gates" | relative_url }})
