---
layout: doc
lang: fr
title: "Lancer les gates et lire leurs preuves"
description: "Lancer les gates des composants modifiés ou de tous les composants, lire la sortie, ouvrir le fichier de preuve et traiter un échec environment ou deterministic."
persona: software-engineer
---

# Lancer les gates et lire leurs preuves

**But** : lancer à la main les gates de vos composants, avant ou après un run, et savoir quoi
faire de chaque échec.

## Prérequis

- Un `skraft-config.json` avec au moins une gate par composant
  ([Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})).
- Un pipeline actif : `skraft init <slug>` ou `/skraft <slug>` (sinon refus
  `no-active-pipeline`).
- Un terminal à la racine de la copie de travail ; `skraft` est la commande que [`skraft install`]({{ "/fr/how-to/install-on-a-host" | relative_url }}#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.

## 1. Lancer les gates des composants modifiés

```text
skraft gate
```

Seuls les composants modifiés depuis leur base sont retenus (commits, index, fichiers modifiés
ou non suivis). Pour chacun, les gates tournent dans l'ordre `build`, `format`, `lint`, `test`,
`architecture`, `coverage`, `mutation` ; un composant s'arrête à sa première gate en échec, les
autres continuent. Si rien n'a changé :

```text
skraft checkout: gates passed — no component changed since its base; no gate to run
```

## 2. Lancer les gates de tous les composants

```text
skraft gate --all
```

## 3. Lire la sortie

```text
pass  web/build
pass  web/lint
fail (deterministic)  web/test: exited 1
pass  api/build
fail (environment)  api/mutation: command not found: dotnet; install it or change the command in skraft-config.json
skraft checkout: gates failed — web/test: exited 1; api/mutation: command not found: dotnet; …
```

Code de sortie : 0 si `passed`, 1 sinon. `--json` donne le même résultat pour un script, avec
le chemin de chaque preuve dans `evidence`.

## 4. Ouvrir le fichier de preuve

```text
.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log
```

`<n>` augmente à chaque lancement ; les preuves précédentes restent. Lisez la ligne `result:`,
puis `--- stderr` :

```text
$ npm test
cwd: ../payment-web
result: fail (deterministic): exited 1
--- stdout
…
--- stderr
…
```

## 5. Traiter l'échec selon sa classe

| Classe | Ce qui s'est passé | Quoi faire |
|---|---|---|
| `deterministic` | la commande a tourné et rendu un code non nul | corriger le code ou le test d'après `stderr`, puis relancer |
| `environment` | programme introuvable, syntaxe shell, composant sans gate, programme arrêté, rapport de mutation absent | réparer la machine ou la commande, puis relancer ; relancer sans rien changer redonne le même échec |

Pendant un run, un échec `environment` n'arrête pas le run : il pose la question
`<node> cannot run on this machine: <reason>. Fix it, then RETRY; or ABORT the run.` Réparez,
puis répondez `RETRY` ([Répondre à une question du run]({{ "/fr/how-to/answer-a-question" | relative_url }})).

## Dépannage

| Raison | Action |
|---|---|
| `command not found: dotnet; install it or change the command in skraft-config.json` | Installer le programme, ou écrire une commande qui marche chez vous. |
| `command "npm ci && npx vitest run" uses shell syntax (&&); put the steps in a script and call the script` | Mettre les étapes dans un script (`"test:ci": "npm ci && vitest run"` dans `package.json`) et écrire `"test": "npm run test:ci"`. |
| `no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json` | Ajouter au moins une gate au composant. |
| `npx was stopped by SIGKILL; run it again` | Relancer (mémoire, interruption). |
| `… the mutation report web/reports/mutation/mutation.json is missing; have the command write it there, or name the file it writes with mutationReport …` | Faire écrire le rapport à cet endroit, ou le nommer avec `mutationReport` sur le composant. |
| Un test qui a besoin de Microcks échoue faute de conteneur | Démarrer Docker ou Podman, puis `skraft gate` ; ou passer le composant en `"mocking": { "strategy": "inprocess" }` ([ce que vous perdez]({{ "/fr/explanation/customisation-trade-offs" | relative_url }})). |
| Windows : `npm.cmd` écrit dans la commande | Écrire `npm`, `npx` ou `gradlew.bat` : le moteur trouve le programme avec PATHEXT et lance `.cmd` et `.bat` par cmd.exe. |

Pour vérifier qu'un programme est trouvé sans lancer les gates : `skraft doctor`.

## Voir aussi

- [`skraft gate`]({{ "/fr/reference/cli" | relative_url }}) — options, sortie JSON, codes.
- [Gates]({{ "/fr/reference/gates" | relative_url }}) — les gates de commandes et les gates
  de revue.
- [Preuves des gates]({{ "/fr/reference/run-journal" | relative_url }}#gate-evidence) — format
  et événement `gate.ran`.
