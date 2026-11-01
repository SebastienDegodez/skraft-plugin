---
title: "Joindre les captures d'un frontend"
description: "Déclarer la commande e2e, ajouter un reporter Playwright et laisser le run joindre des captures claires et sombres à sa pull request."
persona: software-engineer
---

# Joindre les captures d'un frontend

Faites qu'un run joigne à sa pull request les captures des tests e2e d'un frontend.

## Prérequis

- Un run qui publie sa pull request ([Publier la pull request d'un run](./publish-pull-request.md)).
- Un frontend avec des tests Playwright : un composant `react`, ou tout composant avec `commands.e2e`.

## Étapes

Pour un tel composant, le nœud `visuals` lance `commands.e2e` après la revue DELIVER.

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
5. Répondez `ACCEPTED` à la question `reporting-consent` (en-tête `Reporting`), ou écrivez
   `"visuals": true` sous `publish`.

Résultat : les captures sont commitées seules sur la branche
(`docs(evidence): screenshots of <composants>`) et la section Screenshots de la pull request les
montre, les sombres repliées. Les captures sont une preuve, pas une gate : un e2e en échec
n'arrête pas le run.

## Dépannage

### `not published (consent): skraft-config.json sets publish.visuals to false`

Écrivez `"visuals": true` sous `publish` si les captures ne montrent aucune donnée privée.

### `skraft-visuals/manifest.json is missing or is not an object with a screenshots list`

Vérifiez que le reporter est déclaré et que `commands.e2e` lance Playwright depuis la racine du composant.

## Étapes suivantes <!-- #next-steps -->

- [Publier la pull request d'un run](./publish-pull-request.md)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
