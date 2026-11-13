---
layout: doc
lang: fr
title: "Configurer son poste pour SKRAFT"
description: "Configurer GitHub Copilot CLI sur son poste pour qu'un run SKRAFT cesse de demander des validations répétitives : mode de permission Assisted, consignes du relecteur, sites autorisés et règles d'outils au lancement."
persona: software-engineer
---

# Configurer son poste pour SKRAFT

Cessez de valider des dizaines de fois les mêmes demandes pendant un run SKRAFT : lecture de
documentation, `curl`/`sed` du researcher qui vérifie ses citations, `git`/`gh` en lecture,
commandes de build et de test. Rien de cela ne se règle dans le plugin : c'est la configuration
de GitHub Copilot CLI sur votre poste.

Chaque réglage ci-dessous a été lu dans **GitHub Copilot CLI 1.0.107** avec `copilot help config`,
`copilot help permissions` et `copilot config --help`. Revérifiez-les avec ces commandes après
une mise à jour de la CLI.

## Prérequis

- GitHub Copilot CLI 1.0.107 ou plus récent (`copilot --version`).
- SKRAFT installé ([Démarrage rapide]({{ "/fr/tutorials/getting-started" | relative_url }})).
- Des identifiants à moindre privilège : un jeton `gh` limité aux dépôts sur lesquels vous travaillez.

## Où vit chaque réglage

| Portée | Où | Ce qu'il contient |
| --- | --- | --- |
| Machine | `~/.copilot/settings.json` (ou `$COPILOT_HOME/settings.json`), écrit par `copilot config <clé> <valeur>` | `defaultPermissionMode`, `assistedApprovalInstructions`, `allowedUrls`, `deniedUrls` |
| Dépôt | `.github/copilot/settings.json`, écrit par `copilot config --repo <clé> <valeur>` | seulement les réglages qu'un dépôt peut surcharger, dont `deniedUrls`, `enabledPlugins`, `extraKnownMarketplaces` ; **pas** `allowedUrls`, `assistedApprovalInstructions` ni `defaultPermissionMode` |
| Lancement | `copilot --allow-tool … --deny-tool …` | règles d'outils et de commandes pour cette session |
| Dossier | `~/.copilot/permissions-config.json`, rempli par les réponses « ne plus demander » | approbations enregistrées pour un seul emplacement ; `/reset-allowed-tools` les efface |

`copilot config --repo allowedUrls github.com` échoue avec
`Setting "allowedUrls" cannot be set in .github/copilot/settings.json` : un dépôt ne peut pas
élargir vos permissions, seulement les restreindre.

## 1. Passer en mode de permission Assisted

```bash
copilot config defaultPermissionMode assisted
```

En mode Assisted, un modèle relecteur approuve seul les demandes qu'il juge sûres et vous
demande pour les autres. La CLI précise que ce n'est **pas une barrière de sécurité** et qu'il
peut approuver des actions dangereuses ou non voulues : gardez des identifiants à moindre
privilège, un bac à sable et un contrôle des sorties réseau.

Le réglage est ignoré pour une session reprise, hors run interactif (`-p`, SDK, `--acp`), et
quand `--allow-all`/`--yolo` a déjà élevé la session. Pour une seule session, lancez
`copilot --assisted-approval`.

## 2. Donner ses consignes au relecteur

`assistedApprovalInstructions` s'adresse au seul relecteur Assisted, jamais à l'agent.
Rédigez-les en anglais, en listes courtes. Enregistrez ceci dans `assisted-approval-instructions.md` :

```text
Approve without asking:
- read: any file in the repository
- git: status, diff, log, show, blame, rev-parse, branch, ls-files, ls-remote, fetch
- gh: issue view/list, pr view/list/diff/checks, repo view, api GET
- build/test .NET: dotnet restore/build/test/format, dotnet tool restore, dotnet tool run dotnet-stryker
- build/test JS/TS: npm ci, npm test, npm run lint/build/e2e, npx playwright test, npx stryker, npx tsc, npx eslint
- build/test Java: mvn/./mvnw compile/test/verify, gradle/./gradlew build/test/check, pitest
- build/test Python: pytest, python -m pytest, ruff, mypy, mutmut, uv sync/run, pip install inside a venv
- node: scripts under the skraft plugin folder
- curl/wget: GET to allowedUrls domains
- mcp skraft: doctor, init, status, report, journal, gate, workflow_check, workflow_diff
- write/delete: files inside the repository's .copilot-tracking/
- write: files inside the repository

Always ask:
- git: push, commit --amend, rebase, reset --hard, clean, checkout/switch/restore discarding changes, branch -D, tag
- gh: anything that creates, edits, closes, merges or deletes; api POST/PATCH/PUT/DELETE
- publish: npm publish, dotnet nuget push, docker push
- install: global or system (npm i -g, brew, dotnet tool install -g, pip install outside a venv)
- delete: any path outside the repository
- write: any path outside the repository
- network: domains not in allowedUrls; any upload
- secrets: .env*, ~/.ssh, ~/.config/gh, ~/.aws, ~/.azure, tokens, keychains
- mcp skraft: migrate without dry-run, workflow_eject
```

Les lignes `mcp skraft` valent pour les versions de SKRAFT qui livrent le serveur MCP `skraft` ;
sinon le relecteur les ignore.

Enregistrez le contenu du fichier dans vos réglages machine :

```bash
copilot config assistedApprovalInstructions "$(cat assisted-approval-instructions.md)"
```

```powershell
copilot config assistedApprovalInstructions (Get-Content -Raw assisted-approval-instructions.md)
```

Changer cette valeur n'active pas le mode Assisted à lui seul. Une valeur vide l'efface.

## 3. Autoriser les sites de documentation

`allowedUrls` est une liste : chaque `copilot config allowedUrls <valeur>` ajoute un élément s'il
n'y est pas déjà. Un domaine nu (`microsoft.com`) et un joker (`*.microsoft.com`) sont deux motifs
distincts ; ajoutez les deux.

```bash
for u in github.com '*.github.com' '*.githubusercontent.com' '*.github.io' \
         microsoft.com '*.microsoft.com' playwright.dev '*.playwright.dev' \
         microcks.io '*.microcks.io' nuget.org '*.nuget.org' npmjs.com '*.npmjs.com' \
         nodejs.org developer.mozilla.org react.dev vite.dev vitest.dev \
         typescriptlang.org eslint.org stryker-mutator.io testcontainers.com \
         dotnet.testcontainers.org cucumber.io reqnroll.net; do
  copilot config allowedUrls "$u"
done
```

```powershell
foreach ($u in 'github.com', '*.github.com', '*.githubusercontent.com', '*.github.io',
               'microsoft.com', '*.microsoft.com', 'playwright.dev', '*.playwright.dev',
               'microcks.io', '*.microcks.io', 'nuget.org', '*.nuget.org', 'npmjs.com', '*.npmjs.com',
               'nodejs.org', 'developer.mozilla.org', 'react.dev', 'vite.dev', 'vitest.dev',
               'typescriptlang.org', 'eslint.org', 'stryker-mutator.io', 'testcontainers.com',
               'dotnet.testcontainers.org', 'cucumber.io', 'reqnroll.net') {
  copilot config allowedUrls $u
}
```

Ajoutez de la même façon les sites de votre stack :

| Stack | Domaines supplémentaires |
| --- | --- |
| .NET | couverts par la liste ci-dessus (`learn.microsoft.com`, `nuget.org`, `dotnet.testcontainers.org`, `reqnroll.net`, `stryker-mutator.io`) |
| React / TypeScript | couverts par la liste ci-dessus (`react.dev`, `vite.dev`, `vitest.dev`, `typescriptlang.org`, `eslint.org`, `npmjs.com`) |
| Python | `python.org`, `*.python.org`, `pypi.org`, `docs.pytest.org`, `docs.astral.sh`, `*.readthedocs.io` |
| Java | `maven.apache.org`, `central.sonatype.com`, `gradle.org`, `*.gradle.org`, `junit.org`, `pitest.org`, `java.testcontainers.org` |

`deniedUrls` prime sur `allowedUrls`. Les motifs tiennent compte du protocole : sans protocole, ils
valent `https://`. Listez ce qu'un dépôt ne doit jamais atteindre avec
`copilot config --repo deniedUrls <domaine>`.

## 4. Autoriser commandes et outils au lancement (sans Assisted)

Les approbations « ne plus demander » sont enregistrées par dossier dans
`~/.copilot/permissions-config.json`. Pour toute la machine, il ne reste que les options de
lancement. Définissez un alias :

```bash
alias copilot-skraft="copilot --allow-tool 'skraft' --allow-tool 'shell(git:*)' --deny-tool 'shell(git push)' --allow-tool 'shell(gh issue view)' --allow-tool 'shell(gh pr view)' --allow-tool 'shell(dotnet)' --allow-tool 'shell(npm)' --allow-tool 'shell(npx)' --allow-tool 'shell(curl)' --allow-tool 'shell(sed)'"
```

```powershell
function copilot-skraft {
  copilot --allow-tool 'skraft' --allow-tool 'shell(git:*)' --deny-tool 'shell(git push)' `
    --allow-tool 'shell(gh issue view)' --allow-tool 'shell(gh pr view)' `
    --allow-tool 'shell(dotnet)' --allow-tool 'shell(npm)' --allow-tool 'shell(npx)' `
    --allow-tool 'shell(curl)' --allow-tool 'shell(sed)' @args
}
```

Placez l'alias dans `~/.bashrc` ou `~/.zshrc`, la fonction dans votre `$PROFILE` PowerShell.

- `--deny-tool` prime toujours, même sur `--allow-all-tools`.
- `shell(git:*)` couvre toutes les sous-commandes `git` ; `shell(git push)` retire ensuite `push`.
- `skraft` est un nom de serveur MCP : la règle autorise tous les outils de ce serveur.

## 5. Laisser les décisions humaines dans le run

Ne mettez jamais ceci dans une allow-list, une règle `--allow-tool` ni dans
`assistedApprovalInstructions` :

- les consentements de publication ;
- la ratification d'un ADR ;
- `skraft decide` et `skraft publish`.

Le run les pose par le dialogue de l'hôte. Répondez-y là.

## Dépannage

| Symptôme | Correction |
| --- | --- |
| Le mode Assisted ne démarre pas | Session reprise, run `-p` ou lancement `--yolo` : le réglage y est ignoré. Ouvrez une nouvelle session interactive, ou passez `--assisted-approval`. |
| Les demandes Assisted retombent en validation manuelle | Une politique gérée pose `permissions.disableAssistedPermissionsMode`. Utilisez les règles de lancement de l'étape 4. |
| `cannot be set in .github/copilot/settings.json` | La clé est réservée à la machine. Retirez `--repo`. |
| Un site de documentation demande encore | Ajoutez `domaine` et `*.domaine` ; vérifiez que `deniedUrls` ne le liste pas ; `http://` exige un motif `http://` explicite. |
| Une approbation donnée « pour de bon » revient dans un autre dépôt | Les approbations enregistrées sont par dossier. Utilisez l'alias de lancement de l'étape 4. |
| Voir ce qui est réglé | `copilot config --list` (machine), `copilot config --repo --list` (dépôt). |
