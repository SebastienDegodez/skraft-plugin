---
layout: doc
lang: fr
title: "Premiers pas"
description: "Installer SKRAFT V2, décrire un petit dépôt, lancer la phase RESEARCH d'une story et passer ses gates."
persona: software-engineer
---

# Premiers pas

> Dans ce tutoriel, vous installez SKRAFT, décrivez un petit dépôt dans `skraft-config.json`,
> lancez la phase RESEARCH de la story « #42 Pay by card » et passez les gates du dépôt.

Vous suivez un seul parcours, du début à la fin. Chaque étape montre ce que vous devez voir.

## Ce dont vous avez besoin

- **Node 22** ou plus ;
- **Git** ;
- **Claude Code** (pour GitHub Copilot CLI, voir [Avec GitHub Copilot CLI](#avec-github-copilot-cli) après le parcours).

## 1. Créer le petit dépôt

Créez un dossier `shop`, ouvrez un terminal dedans et créez le dépôt :

```text
git init -b main
```

Créez le fichier `web/package.json` avec ce contenu :

```json
{
  "name": "web",
  "private": true,
  "scripts": {
    "build": "node --version",
    "test": "node --version"
  }
}
```

Puis enregistrez un premier commit :

```text
git add web/package.json
git commit -m "Start the shop"
```

Vous voyez une ligne `[main (root-commit) …] Start the shop`.

## 2. Installer le plugin

Ouvrez Claude Code dans le dossier `shop`. Saisissez ces deux commandes **dans la conversation**,
pas dans un terminal :

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

Ouvrez `/plugin` : `skraft` apparaît dans les plugins installés.

**Sous Windows**, si `/plugin marketplace add` échoue à cause d'un chemin trop long, clonez le
dépôt dans un chemin court, puis ajoutez ce clone :

```powershell
git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft
```

```text
/plugin marketplace add C:\s\skraft
/plugin install skraft
```

## 3. Écrire `skraft-config.json`

La ligne de commande `skraft` est un script Node livré avec le plugin. Lancez-la depuis la racine
de votre dépôt, sous sh comme sous PowerShell :

```text
node "<dossier du plugin skraft>/engine/drivers/cli/skraft.mjs" init
```

Remplacez `<dossier du plugin skraft>` par le dossier où l'hôte a installé le plugin skraft. Dans
la suite, `skraft …` veut dire cette commande complète.

`skraft init` cherche les projets du dépôt et écrit un **composant** par projet — une partie du
dépôt avec sa racine, sa stack et ses commandes. Vous voyez :

```text
skraft-config.json: web (javascript, web)
```

Ouvrez `skraft-config.json` à la racine de `shop` :

```json
{
  "components": [
    {
      "name": "web",
      "root": "web",
      "stack": "javascript",
      "paths": {
        "src": ["./"],
        "tests": ["./"]
      },
      "commands": {
        "build": "npm run build",
        "test": "npm test"
      }
    }
  ]
}
```

`build` et `test` viennent des scripts de `web/package.json`.

## 4. Vérifier avec `skraft doctor`

`skraft doctor` vérifie que chaque commande de la configuration peut tourner sur votre machine :

```text
skraft doctor
```

Si Docker ne tourne pas, une ligne `FAIL` apparaît :

```text
ok    node: Node v22.22.0
ok    config: 1 components: web
ok    web/build: npm → /opt/node22/bin/npm
ok    web/test: npm → /opt/node22/bin/npm
FAIL  docker: Docker does not answer, and Microcks, the mocking of web, needs it; start Docker, or set "mocking": { "strategy": "inprocess" } on the component
skraft doctor: 1 checks failed
```

Les chemins de `npm` et la version de Node sont ceux de votre machine. Si Docker tourne, la ligne
`docker` est `ok`. Dans les deux cas, le composant `web` n'a pas besoin de Microcks : ajoutez la
ligne `mocking` au composant dans `skraft-config.json` :

```json
      "name": "web",
      "root": "web",
      "stack": "javascript",
      "mocking": { "strategy": "inprocess" },
```

Relancez `skraft doctor` :

```text
ok    node: Node v22.22.0
ok    config: 1 components: web
ok    web/build: npm → /opt/node22/bin/npm
ok    web/test: npm → /opt/node22/bin/npm
skraft doctor: every check passed
```

Une autre ligne `FAIL` (programme introuvable, racine absente, composant sans commande) se corrige
dans la configuration : suivez le guide
[Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}).

## 5. Lancer la story dans Claude Code

Dans la conversation Claude Code, saisissez :

```text
/skraft checkout #42 Pay by card
```

`checkout` est le **slug** : le nom du pipeline, en kebab-case. `#42` est le numéro de l'issue,
`Pay by card` son titre. Claude Code répond :

```text
skraft checkout started — progress in the Skraft pane.
```

Le panneau **Skraft** s'ouvre. Il montre la phase RESEARCH, l'agent en cours
(`solution-researcher`) et le journal de progression. Attendez la notification de fin :

```text
skraft checkout: done — RESEARCH closed
```

## 6. Regarder `skraft status`

Dans le terminal, à la racine de `shop` :

```text
skraft status
```

Vous voyez :

```text
skraft checkout: done
RESEARCH  closed
RESEARCH closed
```

Une ligne `cost: … USD` peut s'ajouter quand l'hôte rapporte le coût. Le même état vit dans
`.copilot-tracking/skraft-plans/checkout/events.jsonl`, un événement par ligne, et
`.copilot-tracking/skraft-plans/.active-slug` contient `checkout`.

## 7. Ouvrir le document de recherche

L'agent a rempli le document que le moteur avait pré-créé depuis son template :

```text
.copilot-tracking/skraft-plans/checkout/research/<AAAA-MM-JJ>/checkout-research.md
```

`<AAAA-MM-JJ>` est la date du run. Ouvrez-le : c'est la recherche sur « Pay by card ». Le moteur a
vérifié qu'il n'est ni vide, ni identique au template, ni porteur d'un {% raw %}`{{…}}`{% endraw %} restant.

## 8. Passer les gates avec `skraft gate`

Les **gates** sont les commandes nommées des composants (`build`, `test`…) lancées comme contrôle
qualité. Lancez celles de tous les composants :

```text
skraft gate --all
```

Vous voyez :

```text
pass  web/build
pass  web/test
skraft checkout: gates passed — 2 gates passed on web
```

La preuve de chaque gate est écrite dans `.copilot-tracking/skraft-plans/checkout/gates/web/`, par
exemple `build-1.log` : la commande, le dossier, le résultat, la sortie standard et la sortie
d'erreur.

## Ce que vous avez appris

- `skraft init` décrit votre dépôt en composants dans `skraft-config.json` ;
- `skraft doctor` vous dit ce qui manque sur votre machine avant un run ;
- `/skraft <slug> #<issue> <titre>` lance la story ; le moteur conduit RESEARCH et journalise tout ;
- `skraft status` lit l'état depuis le journal ;
- `skraft gate` lance les commandes des composants et garde une preuve de chaque gate.

## Avec GitHub Copilot CLI

À l'étape 5, lancez le workflow dynamique `skraft-pipeline` avec les arguments
`{ "slug": "checkout", "issue": 42, "title": "Pay by card" }`. Le moteur fait le même travail ;
la progression s'affiche dans le journal du workflow. Les autres étapes ne changent pas.

## Ce qui arrive

Ce tutoriel s'arrête après RESEARCH. Dans un run complet, le moteur continue en DESIGN, DISTILL
et DELIVER, vous demande de ratifier les ADR, lance lui-même les gates pendant DELIVER et se
termine par une pull request en brouillon : voir [Personnaliser SKRAFT]({{ "/fr/how-to/customisation" | relative_url }}).

## Pages suivantes

- [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})
- [Lancer les gates et lire leurs preuves]({{ "/fr/how-to/run-gates" | relative_url }})
- [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }})
- [La ligne de commande `skraft`]({{ "/fr/reference/cli" | relative_url }})
- [Moteur, pilotes, profondeur 1]({{ "/fr/explanation/architecture" | relative_url }})
