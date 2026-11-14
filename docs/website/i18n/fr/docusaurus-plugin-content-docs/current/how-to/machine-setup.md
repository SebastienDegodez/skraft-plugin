---
title: "Configurer son poste pour SKRAFT"
description: "Configurer les permissions de Copilot CLI, les consignes Assisted et les sites de documentation sans préapprouver les décisions humaines du pipeline."
persona: software-engineer
---

# Configurer son poste pour SKRAFT

Réduisez les demandes de permission répétitives pendant un run SKRAFT en configurant GitHub
Copilot CLI sur votre poste, pas dans le plugin. Ces réglages ont été lus dans **Copilot CLI
1.0.107** ; revérifiez `copilot help config`, `copilot help permissions` et
`copilot config --help` après une mise à jour.

## Prérequis <!-- #prerequisites -->

- Copilot CLI 1.0.107 ou plus récent, connecté.
- [SKRAFT installé](./install-on-a-host.mdx).
- Des identifiants à moindre privilège, limités aux dépôts sur lesquels vous travaillez.

## 1. Choisir la portée des permissions <!-- #permission-scope -->

| Portée | Fichier ou commande | Réglages |
| --- | --- | --- |
| Machine | `~/.copilot/settings.json`, ou `$COPILOT_HOME/settings.json` ; `copilot config` | `defaultPermissionMode`, `assistedApprovalInstructions`, `allowedUrls`, `deniedUrls` |
| Dépôt | `.github/copilot/settings.json` ; `copilot config --repo` | Réglages autorisés au dépôt, dont `deniedUrls` ; pas les trois réglages machine ci-dessus |
| Lancement | `copilot --allow-tool … --deny-tool …` | Règles d'outils de la session |
| Dossier | `~/.copilot/permissions-config.json` | Approbations « ne plus demander » ; `/reset-allowed-tools` les efface |

Un dépôt ne peut pas élargir vos permissions. `copilot config --repo allowedUrls github.com`
échoue avec `Setting "allowedUrls" cannot be set in .github/copilot/settings.json`.

## 2. Activer le mode Assisted <!-- #assisted-mode -->

```console
$ copilot config defaultPermissionMode assisted
```

:::warning[Assisted n'est pas une barrière de sécurité]

Un modèle relecteur peut approuver des actions dangereuses ou non voulues. Gardez des identifiants
à moindre privilège, un bac à sable et un contrôle des sorties réseau ; les consignes de
permission ne constituent pas une isolation.

:::

Ce réglage est ignoré pour les sessions reprises, les runs non interactifs (`-p`, SDK, `--acp`)
et les lancements élevés par `--allow-all` ou `--yolo`. Pour une session, utilisez
`copilot --assisted-approval`.

## 3. Donner des consignes bornées au relecteur <!-- #reviewer-instructions -->

`assistedApprovalInstructions` s'adresse au relecteur Assisted, pas à l'agent au travail.
Enregistrez cette liste anglaise dans `assisted-approval-instructions.md` dans votre dossier
courant. Adaptez les commandes de build au dépôt ; n'approuvez pas toutes les commandes d'un
programme par son seul nom.

```text
Approve without asking:
- ordinary source and documentation reads inside the repository, excluding secrets
- git: status, diff, log, show, blame, rev-parse, ls-files, ls-remote, fetch
- gh: issue view/list, pr view/list/diff/checks, repo view, api GET
- configured build, lint and test commands inside the repository
- GET requests to allowed documentation domains, without uploads or credentials
- source edits and tracking files inside the repository, excluding secrets

Always ask:
- git push, history rewrites, destructive checkout/restore, clean, branch deletion, tags
- forge writes, publication, uploads, global or system installation
- reads of secrets, tokens, keychains, .env*, ~/.ssh, ~/.config/gh, ~/.aws, ~/.azure
- writes or deletions outside the repository
- pipeline answers, ADR ratification and publication consent
```

Enregistrez son contenu avec la commande de votre shell :

```console title="POSIX"
$ copilot config assistedApprovalInstructions "$(cat assisted-approval-instructions.md)"
```

```console title="PowerShell"
PS> copilot config assistedApprovalInstructions (Get-Content -Raw assisted-approval-instructions.md)
```

Changer les consignes n'active pas Assisted. Une valeur vide les efface.

## 4. Autoriser les seuls sites utiles <!-- #documentation-sites -->

Chaque appel ajoute un motif distinct. Le domaine nu et son joker diffèrent :

```console
$ copilot config allowedUrls microsoft.com
$ copilot config allowedUrls '*.microsoft.com'
$ copilot config allowedUrls github.com
$ copilot config allowedUrls nodejs.org
```

Ajoutez les sites de votre stack, par exemple `react.dev`, `docs.pytest.org`, `maven.apache.org`
ou `nuget.org`. `deniedUrls` prime ; sans protocole explicite, les motifs valent `https://`.
Utilisez `copilot config --repo deniedUrls <domain>` pour restreindre l'accès d'un dépôt.

## 5. Utiliser plutôt des règles de lancement étroites <!-- #launch-rules -->

Sans Assisted, enregistrez une commande dédiée dans votre profil shell. Par exemple :

```console
$ copilot --allow-tool 'shell(git status)' --allow-tool 'shell(git diff)' --allow-tool 'shell(gh issue view)' --deny-tool 'shell(git push)'
```

Ces arguments fonctionnent dans les shells POSIX et PowerShell. `--deny-tool` prime, même sur
`--allow-all-tools`. N'autorisez pas `shell(git:*)` ni tout le serveur MCP `skraft` : ils
permettent aussi des écritures ou des décisions, pas seulement des lectures.

Gardez les réponses du pipeline, la ratification des ADR et la publication hors des approbations
automatiques. Répondez à la question exacte du run dans le chat natif ; le consentement de
publication utilise la confirmation de l'hôte
([Répondre à une question](./answer-a-question.mdx)).

## Dépannage <!-- #troubleshooting -->

### Assisted ne démarre pas <!-- #assisted-does-not-start -->

Ouvrez une nouvelle session interactive. Une politique gérée
`permissions.disableAssistedPermissionsMode` désactive Assisted ; utilisez plutôt des règles
de lancement étroites.

### Un site ou un dépôt demande encore <!-- #still-prompts -->

Vérifiez domaines nus et jokers, protocole et `deniedUrls`. Les approbations enregistrées sont
par dossier. Consultez `copilot config --list` et `copilot config --repo --list`.

## Prochaines étapes <!-- #next-steps -->

- [Premier run sous Copilot CLI](../tutorials/first-run-copilot.md)
- [Répondre à une question](./answer-a-question.mdx)
- [Référence des hôtes](../reference/hosts.md)
