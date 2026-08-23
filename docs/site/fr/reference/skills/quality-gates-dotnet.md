---
layout: doc
lang: fr
title: "quality-gates-dotnet"
description: "Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must populat..."
persona: tech-lead
---

# quality-gates-dotnet

> Adaptateur .NET qui lie les portes qualité du contrat `quality-gates-evidence-contract` aux commandes concrètes `dotnet` et `dotnet stryker`, et qui embarque les deux scripts de mutation qui ferment la porte de mutation.

## Quand l'utiliser

- Lorsque le dépôt actif est une solution .NET (`*.sln`, `*.slnx`, `*.csproj`, `Directory.Packages.props`)
- En phase COMMIT, pour produire les preuves falsifiables des portes G1 à G10
- Au RED, pour capturer le run qui prouve que le test échoue — la seule preuve acceptée par G10, et elle ne peut pas être reconstituée après coup
- Chargé par le `software-engineer` après détection de la pile .NET via `resolving-stack-commands`
- Si plusieurs piles coexistent, exécuté en parallèle des autres adaptateurs

## Contrat d'entrée

- Dépôt .NET détecté (marqueur `*.sln` ou `*.csproj` présent à la racine)
- Variable `$EV` pointant vers `.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/`
- `dotnet` sur le `PATH` avec Stryker disponible — sinon les scripts de mutation sortent en `3`
- Pour G6, les chemins des `.csproj` de production et de test de chaque périmètre, passés aux scripts de mutation embarqués. Aucun seuil n'est lu nulle part : `skraft-quality-bar` en est propriétaire

## Contrat de sortie

- Fichiers de preuves dans `$EV/` : stdout redirigé sur disque, code de sortie, sha256, snapshots RED/GREEN
- Deux jeux de preuves de mutation — `qg-mutation.*` (core) et `qg-mutation-boundary.*` (boundary), chacun avec `.stdout`, `.exit`, `.stdout.sha256` et le rapport Stryker `.json` recopié
- Entrées `gates[G1..G10]` du contrat `quality-gates-evidence-contract` renseignées
- `qg-{story}.json` complet et vérifiable par le `quality-gates-lens`

## Invariants

- **Commandes verbatim** — `command_executed` contient la commande shell exacte, jamais paraphrasée
- **Stdout capturé par le shell** — jamais transcrit à la main ; `sha256` calculé par `shasum`
- **G7 inversion** — `grep` exit `1` (aucune correspondance) est le cas succès pour G7
- **Barre G6 fixée par `skraft-quality-bar`** — 100 % sur Domain et Application, 90 % sur API et Infrastructure. Une seule barre permanente : aucun tier, aucun réglage de dépôt, aucune rationale ne l'abaisse
- **Verdict G6 = code de sortie** — les scripts embarqués passent la barre au `--break-at` de Stryker, si bien que le runner lui-même échoue en dessous. Un score lu dans un rapport et jugé en prose est un avis sur une porte, pas une porte
- **Outil absent = `fail`**, jamais `not_applicable` si l'outil n'est pas installé
- **G5 marqué `not_applicable`** uniquement si aucun projet `*.ArchitectureTests` n'existe, avec `rationale`

## Scripts de mutation embarqués

Deux scripts sont livrés dans cet adaptateur, sous `scripts/`. Ils s'exécutent en séquence, et l'ordre fait partie du contrat : il n'y a rien à apprendre en mutant les adaptateurs tant que le domaine n'est pas prouvé, donc le core s'exécute en premier et court-circuite le run boundary lorsqu'il échoue.

| Ordre | Script | Périmètre | Barre | Préfixe de preuve |
| --- | --- | --- | --- | --- |
| 1 | `scripts/mutation-core.sh` | Domain, Application | `--break-at 100` | `qg-mutation` |
| 2 | `scripts/mutation-boundary.sh` | API, Infrastructure | `--break-at 90` | `qg-mutation-boundary` |

Les deux prennent les trois mêmes arguments, et aucun ne prend de seuil :

```bash
scripts/mutation-core.sh \
  --prod "src/MonAssurance.Domain/MonAssurance.Domain.csproj" \
  --test "tests/MonAssurance.UnitTests/MonAssurance.UnitTests.csproj" \
  --evidence "$EV"
```

Chaque script lance `dotnet stryker` avec les exclusions communes (`!**/*Marker.cs`, `!**/DependencyInjection.cs`, `!**/obj/**`), écrit `{prefix}.stdout`, `{prefix}.exit` et `{prefix}.stdout.sha256` dans `$EV`, recopie le rapport JSON de Stryker vers `{prefix}.json`, et imprime un unique objet JSON de verdict sur stdout.

**Le code de sortie est le verdict** — `0` porte passée, `1` porte échouée, `2` erreur d'usage, `3` chaîne d'outils absente. Chaque script porte la valeur de son périmètre en littéral et la passe à `--break-at`, si bien que Stryker sort en non-zéro sous la barre ; un test de garde vérifie que ces littéraux restent égaux à la table de `skraft-quality-bar`. Passer `--expected` est refusé net : la barre n'est pas un argument d'exécution. Le score `measured` de l'objet JSON imprimé n'est consigné que pour le journal — ne jamais le lire pour le juger en prose.

Les deux runs ont lieu à chaque passage. Le dial de profondeur supprimé était aussi le gouverneur de coût du framework : chaque run paie désormais la forme complète de la mutation, et non une forme réduite. Le compromis a été accepté délibérément — la barre n'est pas négociable.

## Pourquoi cette forme

La falsifiabilité est non négociable : un agent ne peut pas prouver qu'un test est passé en le disant. Chaque porte dépose des artefacts sur disque, référençables par sha256 et chemin Git, que le lens peut vérifier sans ré-exécution.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

Les preuves sur disque rendent l'attestation vérifiable de façon reproductible — même des semaines après la livraison. La porte de mutation va un cran plus loin : sa preuve est un code de sortie produit par le runner, qu'aucun lecteur n'a à interpréter.

## Customisation autorisée

- Chemins de projets `--prod` / `--test` passés à chaque script de mutation, par périmètre (L1)
- G5 optionnel selon présence du projet `*.ArchitectureTests` (L1)
- G4 mutualisé avec G3 si les analyseurs Roslyn sont câblés dans le build (L1)
- **Non customisable** — la barre de mutation elle-même ; elle vit dans `skraft-quality-bar` et les scripts refusent `--expected`

## Voir aussi

- [quality-gates-evidence-contract]({{ "/fr/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Schéma tech-agnostique
- [skraft-quality-bar]({{ "/fr/reference/skills/skraft-quality-bar" | relative_url }}) — L'unique endroit où la barre est écrite
- [mutation-testing]({{ "/fr/reference/skills/mutation-testing" | relative_url }}) — Périmètre de mutation, exclusions et triage des survivants
- [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }}) — Détection de pile et sélection d'adaptateur
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent producteur des preuves
