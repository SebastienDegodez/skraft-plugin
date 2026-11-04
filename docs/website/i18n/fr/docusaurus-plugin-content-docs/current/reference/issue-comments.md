---
title: "Commentaires d'issue"
description: "Les deux commentaires que skraft tient sur l'issue d'une story : la progression du run et la proposition de refinement, chaque partie et quand agir."
---

# Commentaires d'issue

skraft écrit deux commentaires sur l'issue d'une story, chacun dans le fil de l'issue : la progression d'un run et une proposition de refinement. Cette page liste chaque partie, ce qu'elle contient et quand agir dessus.

Pourquoi un commentaire et jamais une issue réécrite : [Le backlog : de l'idée à la story prête](../explanation/backlog.md).

## Commentaire de progression <!-- #progress -->

Un commentaire par run, sur l'issue de la story. Le run le retrouve par un marqueur caché, `<!-- skraft:issue-progress slug=<slug> -->`, et le réécrit à chaque phase qu'il termine, à chaque revue qui renvoie le travail, et à la fin du run. Seul son premier envoi notifie ; une réécriture ne notifie personne. Il est écrit dans la langue de la story, et son dernier corps est gardé dans `issue-progress.md` du dossier de suivi. Il n'est publié que si vous avez consenti à publier ([Publier la pull request d'un run](../how-to/publish-pull-request.md)).

### En-tête <!-- #progress-heading -->

- **Contient** : `### skraft · <slug> — <phase> terminée`, `— <étape> demande une reprise`, ou `— run <statut>`. Une fois le run terminé, une ligne de statut suit, avec le code d'arrêt entre parenthèses.
- **À lire pour** : savoir quelle transition le commentaire raconte, sans l'ouvrir.
- **Agir quand** : l'en-tête dit qu'une revue a demandé une reprise (le run continue seul) ou que le run s'est terminé avec un code d'arrêt (cherchez le code dans [Dossier de suivi et journal](./run-journal.md)).

### Phases <!-- #progress-phases -->

- **Contient** : une case par phase du workflow : `[x]` terminée, `— en cours` pour la phase qui tourne, `— arrêté ici` une fois le run terminé dessus. Tant que le run continue, `Suite : <phase>.` nomme la suivante.
- **À lire pour** : voir où en est le run.
- **Agir quand** : une phase indique `arrêté ici` : le run attend que vous le repreniez.

### Faits <!-- #progress-facts -->

- **Contient** : `Revues : <étape> <résultat> (N passes), …` ou `Revues : aucune pour l'instant.` ; `Portes de qualité :` avec une ligne par porte, `<composant>/<porte> <statut>[, N mutants survivants] · <preuve>` ; `Pull request : <url>[ (mise à jour)]` ; `Total : N tentatives, N reprises, <durée>, coût <coût>`, suivi d'une note disant que le coût est approximatif ; l'endroit du rapport du run et des preuves, dans la copie de travail sous le dossier de suivi du run.
- **À lire pour** : juger le run sans ouvrir la pull request : quelles revues sont passées et en combien de passes, quelles portes sont vertes, ce que le run a coûté.
- **Agir quand** : une porte n'est pas verte ou a des mutants survivants, ou une revue a pris plusieurs passes. La pull request est décrite dans [Pull request et commentaire de revue](./pull-request.md).

### Étapes <!-- #progress-steps -->

- **Contient** : un tableau `Étapes` replié, `Phase | Étape | Visites | Tentatives | Reprises | Durée | Coût | Résultat`, une ligne par étape.
- **À lire pour** : trouver l'étape qui a pris les reprises ou le temps.
- **Agir quand** : une étape montre beaucoup de reprises ou un résultat autre qu'une réussite.

## Proposition de refinement <!-- #refinement -->

Un commentaire, posté par `/skraft-refine` ou par le workflow gh-aw, sur l'issue qu'il raffine ([Raffiner une issue du backlog](../how-to/refine-backlog.md)). Les titres de section ci-dessous sont ceux du commentaire en français.

### En-tête <!-- #refinement-header -->

- **Contient** : la disponibilité dans le titre (prête ou à retravailler), `Taille` en points avec les jours d'équipe, `Type`, `Priorité` avec sa raison, `Definition of Ready` en n/8, et la justification de la taille en italique.
- **À lire pour** : décider d'un coup d'œil si l'issue peut entrer dans un sprint.
- **Agir quand** : le titre dit à retravailler, ou la taille dépasse ce que prend votre sprint.

### Ce qui l'empêche d'être prête <!-- #refinement-blockers -->

- **Contient** : `Ce qui l'empêche d'être prête`, les points du Definition of Ready qui échouent, chacun avec sa note ; `Problèmes des critères d'acceptation actuels`, chaque critère actuel cité avec son défaut (vague, technique, non testable).
- **À lire pour** : savoir quoi corriger dans l'issue elle-même.
- **Agir quand** : toujours quand l'issue n'est pas prête : répondez aux questions ouvertes ou modifiez les critères, puis commentez `/skraft-refine`.

![Commentaire de refinement sur l'issue n° 1 du dépôt de démonstration : « Ce qui l'empêche d'être prête » : les points de la Definition of Ready en échec, chacun avec sa note](/img/screenshots/fr/github-refine-blockers.png)

### Story proposée <!-- #refinement-story -->

- **Contient** : la story sous la forme `En tant que… je veux… afin que…` ; les `Exemples métier`, numérotés ; les `Critères d'acceptation proposés`, chacun `AC<n> — <titre> (issu de l'exemple n)` avec son Étant donné / Quand / Alors.
- **À lire pour** : relire la story proposée et voir de quel exemple vient chaque critère.
- **Agir quand** : vous l'acceptez (copiez-la dans l'issue) ou le persona, un exemple ou un critère est faux.

![Commentaire de refinement sur l'issue n° 1 du dépôt de démonstration : La story proposée, ses exemples métier et ses premiers critères d'acceptation en Étant donné / Quand / Alors](/img/screenshots/fr/github-refine-story.png)

### Definition of Ready et INVEST <!-- #refinement-dor -->

- **Contient** : un tableau replié des 8 points du Definition of Ready et un des 6 critères INVEST, chacun avec son état et sa note.
- **À lire pour** : voir tous les points en échec, pas seulement les premiers listés dans les blocages.
- **Agir quand** : un point échoue sans que la section des blocages vous ait fait agir dessus.

![Commentaire de refinement sur l'issue n° 1 du dépôt de démonstration : Le tableau déplié des 8 points de la Definition of Ready, chacun avec son état et sa note](/img/screenshots/fr/github-refine-dor.png)

### Références <!-- #refinement-references -->

- **Contient** : `Documents de référence`, le PRD ou BRD contre lequel la proposition a été vérifiée, ou un candidat à lier ; `Écarts avec le document`, là où l'issue et le document divergent ; `Issues proches`, avec le type de lien (doublon, proche).
- **À lire pour** : repérer un document que l'issue contredit, et un doublon avant de commencer.
- **Agir quand** : un écart est listé, un document candidat attend d'être lié, ou une issue est marquée comme doublon.

![Commentaire de refinement sur l'issue n° 1 du dépôt de démonstration : Les documents de référence, les écarts avec le PRD et les issues proches](/img/screenshots/fr/github-refine-references.png)

### Revue <!-- #refinement-review -->

- **Contient** : une section `Revue` repliée avec le verdict des trois lentilles de planification et le nombre de tentatives ; quand le verdict n'est pas approuvé, les points de revue non résolus.
- **À lire pour** : savoir jusqu'où se fier à la proposition.
- **Agir quand** : le verdict est rejeté : ses points sont des décisions que seul le métier peut prendre.

### Pied de page et marqueur <!-- #refinement-marker -->

- **Contient** : la version du plugin, comment la redemander (`/skraft-refine`, ou `--force` pour la refaire à l'identique), et le marqueur `skraft-refine v=<version> hash=<empreinte>`.
- **À lire pour** : savoir quelle version a produit le commentaire. Le marqueur fait qu'un run saute une issue dont le titre, le corps et la version du plugin n'ont pas changé.
- **Agir quand** : vous avez modifié l'issue : commentez `/skraft-refine` pour obtenir une nouvelle proposition.

## Voir aussi <!-- #see-also -->

- [Raffiner une issue du backlog](../how-to/refine-backlog.md)
- [Publier la pull request d'un run](../how-to/publish-pull-request.md)
- [Pull request et commentaire de revue](./pull-request.md)
- [Les gates DISCUSS](./gates.md#discuss)
