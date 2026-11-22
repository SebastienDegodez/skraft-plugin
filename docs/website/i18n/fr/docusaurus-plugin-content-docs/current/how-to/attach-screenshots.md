---
title: "Joindre les preuves QA"
description: "Les preuves QA d'une pull request (plan de test, résultats des scénarios, captures) et comment les captures d'un frontend sont jointes (GitHub, Azure DevOps)."
persona: software-engineer
---

# Joindre les preuves QA

Faites que la pull request d'un run porte ses preuves QA : le plan de test, le résultat de chaque
scénario et les captures d'un frontend. Le moteur rend les trois à partir du journal du run et de
la trace signée des runs du software engineer ; aucun agent n'écrit de rapport QA.

## Ce que porte la pull request

- **QA**, sous son titre : `QA : 14/14 scénarios réussis sur <sha> (run r12, 45 s).`, le chemin
  du plan de test, et *Livré n'est pas déployé*.
- **Résultats des scénarios**, repliés : une ligne par scénario, `| # | Scénario | AC | Composant | RED | Green | Run final | Nommé dans le log | Capture |`.
  Un scénario est `passed` seulement quand son test d'acceptation est toujours celui de son commit
  red, qu'un commit green a livré son groupe, et que toute la suite de tests de son composant (le
  dernier run `test` tracé sous lui) est passée sur le commit final. Tout autre cas est
  `non prouvé`, avec la raison : ce qui manque n'est jamais réussi. *Nommé dans le log* dit si le
  log de ce run nomme le test du scénario (`S3_…`, `test_S3_…`) ; *Capture* liste les thèmes des
  captures titrées d'après lui (`S3 …`, ou son titre).
- **Tests**, repliés : le plan de test, en entier.
- **Captures d'écran**, repliées : voir la suite.

Sur Azure DevOps, dont la description prend 4 000 caractères, la ligne QA reste dans la
description et le tableau replié va dans un fil `skraft · détails du run`. `qa-report.md`, dans
le dossier de suivi, montre la même ligne QA et le même tableau après chaque étape.

## Captures d'écran

### Prérequis

- Un run qui publie sa pull request ([Publier la pull request d'un run](./publish-pull-request.md)).
- Un frontend avec des tests Playwright : un composant `react`, ou tout composant avec `commands.e2e`.

### Étapes

skraft ne lance jamais la commande e2e. Le software engineer la lance par `skraft_repl` avec
`gate('e2e', …)` sur son dernier commit, comme les autres gates du composant ; après la revue
DELIVER, le nœud `visuals` lit ce run tracé et le seul manifeste qu'il laisse,
`skraft-visuals/manifest.json`.

1. Déclarez la commande e2e du frontend :

   ```json
   { "name": "web", "root": "web", "stack": "react",
     "commands": { "test": "npm test", "e2e": "npx playwright test" } }
   ```

2. Ajoutez deux projets et un reporter à la configuration Playwright du frontend :

   ```ts
   // playwright.config.ts
   import { defineConfig } from '@playwright/test'

   export default defineConfig({
     projects: [
       { name: 'light', use: { colorScheme: 'light' } },
       { name: 'dark', use: { colorScheme: 'dark' } },
     ],
     reporter: [['list'], ['./skraft-visuals-reporter.ts']],
   })
   ```

   ```ts
   // skraft-visuals-reporter.ts
   import { mkdirSync, writeFileSync } from 'node:fs'
   import { relative } from 'node:path'
   import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

   export default class SkraftVisuals implements Reporter {
     private screenshots: Array<{ title: string, theme: string, path: string }> = []

     onTestEnd(test: TestCase, result: TestResult) {
       const theme = test.parent.project()?.name ?? ''
       for (const { name, path, contentType } of result.attachments) {
         if (contentType === 'image/png' && path) this.screenshots.push({ title: name, theme, path: relative(process.cwd(), path).split('\\').join('/') })
       }
     }

     onEnd() {
       mkdirSync('skraft-visuals', { recursive: true })
       writeFileSync('skraft-visuals/manifest.json', JSON.stringify({ screenshots: this.screenshots }))
     }
   }
   ```

3. Dans un test, prenez la capture sous `skraft-visuals/` et joignez-la avec son titre :

   ```ts
   const path = `skraft-visuals/checkout-${testInfo.project.name}.png`
   await page.screenshot({ path, fullPage: true })
   await testInfo.attach('Checkout, card paid', { path, contentType: 'image/png' })
   ```

4. Ajoutez `skraft-visuals/` au `.gitignore` du frontend.
5. Écrivez `"visuals": true` sous `publish`, avec `"questionVersions": { "visuals": 2 }`, ou
   laissez `/skraft-init` vous le demander. Tant que ce n'est pas réglé, un run qui publierait des
   captures est refusé.

Résultat : la section Screenshots de la pull request montre les six premières captures de chaque
thème, les sombres repliées. Le chemin dépend de la forge :

- **GitHub** : elles restent là où Playwright les a écrites, rien n'est commité. Le corps renvoie
  à chacune par son chemin depuis le dossier du fichier du corps
  (`../../../web/skraft-visuals/checkout.png`), et `gh pr create` ou `gh pr edit`, lancé depuis ce
  dossier, la téléverse avec `--attach`, en réécrivant la référence. Une capture dont le chemin
  contient un `#` est refusée à la lecture du manifeste : gh prend ce qui suit `#` pour le texte
  alternatif. Quand la description dépasse ce qu'une pull request accepte (60 000 caractères), la
  section Screenshots part dans un commentaire des détails du run : `gh pr comment --attach` publie
  ce commentaire avec ses captures, et celui qu'il remplace est vidé, jamais supprimé ; skraft relit
  le commentaire et dit quelles captures ne sont pas jointes, et le `skraft publish` suivant le
  publie à nouveau. skraft relit le corps et dit quelles captures ne sont pas jointes.
  `skraft doctor` prévient quand votre gh n'a pas `--attach` (gh 2.103.3 l'a).
- **Azure DevOps** : `az` n'envoie aucun fichier en corps binaire, les pièces jointes de la pull
  request sont donc hors d'atteinte. skraft commite les captures seules sur la branche
  (`docs(evidence): screenshots of <composants>`), sous le dossier `evidence/` de la story, et lie
  chacune par la route Items du dépôt à ce commit. `skraft doctor` prévient quand l'extension
  `azure-devops` du CLI Azure manque. Qu'Azure Repos affiche ces images n'est pas encore mesuré sur
  une vraie organisation.

skraft contrôle chaque fichier avec Git seul avant de le joindre ou de le commiter : un lien
symbolique, un chemin qui passe par l'un d'eux ou un fichier qui n'est pas un PNG est refusé. Avant
cela, un front end dont la racine est elle-même un lien symbolique n'a aucun de ses fichiers lu,
manifeste compris. Les
captures sont une preuve, pas une gate : un e2e en échec n'arrête pas le run.

## Dépannage

### `not published (consent): skraft-config.json sets publish.visuals to false`

Écrivez `"visuals": true` sous `publish` si les captures ne montrent aucune donnée privée.

### `skraft-visuals/manifest.json is missing or is not an object with a screenshots list`

Vérifiez que le reporter est déclaré et que `commands.e2e` lance Playwright depuis la racine du composant.

### `no traced e2e run`

Le software engineer n'a pas lancé `gate('e2e', …)` pour ce frontend : vérifiez que le composant
déclare `commands.e2e`, ce qui le met dans le brief de l'engineer.

### `2 screenshots did not attach: …`

gh a ouvert ou mis à jour la pull request sans pouvoir téléverser ces fichiers. Relancez
`skraft publish` une fois que gh atteint GitHub ; le corps y renvoie toujours par leur chemin.

## Étapes suivantes <!-- #next-steps -->

- [Publier la pull request d'un run](./publish-pull-request.md)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
