---
layout: doc
lang: fr
title: "Raffiner une issue du backlog"
description: "Obtenir la proposition de raffinement d'une issue GitHub en commentaire : depuis l'éditeur avec /skraft-refine, ou à chaque nouvelle issue avec le workflow GitHub Agentic skraft-refine."
persona: tech-lead
---

# Raffiner une issue du backlog

**But** : obtenir sur une issue un commentaire qui dit si elle est prête, sa taille, les défauts
de ses critères et la story proposée — à la demande, ou automatiquement à chaque nouvelle issue.

## Prérequis

- Le plugin `skraft-backlog` installé
  ([Installer skraft sur un hôte]({{ "/fr/how-to/install-on-a-host" | relative_url }})).
- L'accès en écriture aux issues du dépôt : `gh` connecté, ou le serveur MCP GitHub.
- Pour le workflow GitHub : l'extension `gh aw`
  (`gh extension install github/gh-aw`) et le droit d'écrire des secrets du dépôt ou de
  l'organisation.

## Raffiner une issue depuis l'éditeur

1. Ouvrez une session à la racine du dépôt, dans Claude Code, Copilot CLI ou VS Code.
2. Tapez la commande avec le numéro de l'issue :

   ```text
   /skraft-refine 42
   ```

   L'agent tourne sur votre modèle et vos identifiants. Il lit l'issue, les PRD ou BRD qu'elle
   lie sous `docs/`, fait relire sa proposition par trois lentilles de planification, puis poste
   **un** commentaire. Ses fichiers de travail sont sous `.copilot-tracking/skraft-refine/42/`.
3. Résultat attendu : une ligne avec la disponibilité (prête ou à affiner), la taille et le lien
   du commentaire. Le commentaire finit par un marqueur visible
   `skraft-refine v=<version> hash=<empreinte>`.

Une issue qu'une proposition couvre déjà, pour son titre, son corps et la version du plugin, est
sautée avec sa raison. Pour la raffiner quand même :

```text
/skraft-refine 42 --force
```

## Raffiner chaque nouvelle issue avec GitHub Actions

1. À la racine du dépôt, installez le workflow à la version du plugin :

   ```sh
   gh aw add SebastienDegodez/skraft-plugin/plugins/skraft-backlog@v2.0.0-alpha.19
   ```

   La commande installe `skraft-refine.md`, son import `shared/apm.md` et
   `.github/workflows/shared/skraft-refine-marker.mjs`, crée le label `skraft-refine` et compile
   le workflow.
2. Ajoutez le secret du moteur, `COPILOT_GITHUB_TOKEN`, au dépôt ou à l'organisation.
3. Commitez et poussez ce que la commande a écrit sous `.github/workflows/`.

Le workflow se déclenche ensuite ainsi :

| Déclencheur | Comment |
|---|---|
| Nouvelle issue | à l'ouverture |
| Label | ajouter `skraft-refine` ; pour redemander, le retirer puis le remettre |
| Commentaire | un commentaire dont le premier mot est `/skraft-refine`, ou `/skraft-refine --force` |
| À la main | Actions → skraft-refine → Run workflow, avec `issue_number` et `force` ; ou `gh workflow run skraft-refine.lock.yml -f issue_number=42 -f force=true` |

Résultat attendu : le run réagit 👀 sur l'issue ou le commentaire, puis poste la proposition ;
les propositions plus anciennes du workflow sont masquées.

Par défaut, seuls les utilisateurs ayant au moins l'accès en écriture déclenchent un workflow
gh-aw : l'issue d'un contributeur extérieur n'est raffinée qu'une fois qu'un mainteneur ajoute le
label ou commente la commande.

## Dépannage

| Situation | Action |
|---|---|
| Rien ne se passe sur un commentaire | Le premier mot doit être `/skraft-refine`, sur une issue (pas une pull request). |
| `proposal … already covers this issue text with version …` | L'issue n'a pas changé depuis la dernière proposition : ajouter `--force`. |
| `the issue is closed` | Rouvrir l'issue, ou ne pas la raffiner. |
| Le workflow ne poste pas après un label | Le label doit s'appeler exactement `skraft-refine`. |
| Une issue déjà raffinée depuis l'éditeur est sautée par le workflow | Normal : le commentaire porte le même marqueur. |

## Voir aussi

- [Transformer un PRD en backlog GitHub]({{ "/fr/how-to/prd-to-backlog" | relative_url }})
- [Le backlog : de l'idée à la story prête]({{ "/fr/explanation/backlog" | relative_url }}) —
  pourquoi un commentaire et jamais une issue réécrite.
- [Gates : DISCUSS]({{ "/fr/reference/gates" | relative_url }}#discuss) — critères INVEST,
  critères d'acceptation et Definition of Ready.
