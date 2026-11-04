---
title: "Pull request et commentaire de revue"
description: "Chaque section de la pull request qu'ouvre un run, son commentaire de détails, le tableau de revue et ses statuts, et le commentaire de skraft review --publish."
persona: software-engineer
---

# Pull request et commentaire de revue

La description de la pull request qu'ouvre un run est rendue section par section à partir du journal du run ; `skraft review --pr <n> --publish` garde un commentaire du même genre.

Pourquoi une revue passe avant la revue humaine : [La revue avant la revue — pourquoi et comment](../explanation/deep-dive/review-before-review.md).

## La description <!-- #description -->

La description est écrite dans la langue de la story. Ce qui décide s'affiche sous un titre ; le reste est replié dans un bloc `<details>` dont le résumé est le titre et ce qu'il compte.

| Section | Affichée | Rédigée par | Agir quand |
|---|---|---|---|
| Ce qui change | titre | pr-writer | le texte ne correspond pas au changement |
| Pourquoi | titre | pr-writer | le texte ne correspond pas à la story |
| Décisions appliquées | titre | moteur | une porte verrouillée a été sautée |
| Matrice de cohérence | repliée | moteur | jamais : information seule |
| Tests | repliée | moteur | jamais : information seule |
| Preuves RED | repliée, compte les commits red | moteur | un commit red n'a pas été rejoué |
| Portes de qualité | repliée, s'ouvre seule quand une porte a échoué | moteur | une porte a échoué |
| Revue | repliée, s'ouvre seule sur un constat à corriger ou à trancher | moteur | un constat est à corriger ou à trancher |
| Captures d'écran | repliée | moteur | jamais : information seule |
| Plus de tests Domain que de tests d'acceptation | titre, seulement quand les lignes Domain dépassent les lignes d'acceptation | moteur | vous voulez élaguer les tests |
| Hors périmètre et limites | titre | pr-writer | une limite change votre décision |
| Résumé du run | repliée | moteur | le statut n'est pas celui attendu |
| Mention de l'IA | repliée | moteur | jamais : information seule |

### Titre et première ligne <!-- #title-and-link -->

- **Contient** : le titre est le résumé du pr-writer, sinon le titre de la story, sinon le slug, coupé à 72 caractères avec `…` ; la première ligne est `Refs #<issue>`, `Closes #<issue>` quand la pull request vise la branche par défaut. Sur Azure DevOps, la ligne est `#<issue>`, `Fixes #<issue>` sur la branche par défaut.
- **Affichée** : première ligne du corps, au-dessus de toute section.
- **Rédigée par** : l'agent pr-writer pour le résumé ; le moteur pour la ligne.
- **À lire pour** : savoir à quelle story répond la pull request et si sa fusion la ferme.
- **Agir quand** : la pull request vise la branche par défaut et l'issue doit rester ouverte.

### Ce qui change <!-- #what-changes -->

- **Contient** : le texte du pr-writer ; sans étape pr-writer, `Non rédigé : le run n'a aucune étape pr-writer qui ait rédigé ce qui change.`
- **Affichée** : sous son titre.
- **Rédigée par** : l'agent pr-writer.
- **À lire pour** : connaître le changement avant de lire le diff.
- **Agir quand** : le texte ne correspond pas au diff.

### Pourquoi <!-- #why -->

- **Contient** : le texte du pr-writer ; sans étape pr-writer, `Non rédigé : le run n'a aucune étape pr-writer qui ait rédigé le pourquoi.`
- **Affichée** : sous son titre.
- **Rédigée par** : l'agent pr-writer.
- **À lire pour** : juger le changement au regard de la story.
- **Agir quand** : le texte ne correspond pas à la story.

### Décisions appliquées <!-- #decisions -->

- **Contient** : `- ADR-00N <titre> (<chemin>), ratifié dans ce run` ; `- Porte verrouillée <nœud> sautée, déverrouillée : <raison>` ; sinon `Aucune consignée : aucun ADR n'a été ratifié et aucune porte verrouillée n'a été déverrouillée dans ce run.`
- **Affichée** : sous son titre.
- **Rédigée par** : le moteur, à partir du journal du run.
- **À lire pour** : voir les décisions d'architecture que suit le code et les portes verrouillées que quelqu'un a sautées.
- **Agir quand** : une porte verrouillée a été sautée et vous n'acceptez pas la raison.

### Matrice de cohérence <!-- #consistency-matrix -->

- **Contient** : `Depuis <chemin> dans le dossier de suivi :` puis la matrice de cohérence qu'a écrite DESIGN, telle quelle ; sinon `Aucune consignée : le dossier de suivi ne contient aucune matrice de cohérence de ce run (DESIGN l'écrit).`
- **Affichée** : repliée.
- **Rédigée par** : le moteur, qui copie le document de DESIGN.
- **À lire pour** : vérifier que les pièces du design s'accordent entre elles.
- **Agir quand** : jamais : information seule.

### Tests <!-- #tests -->

- **Contient** : `Depuis <chemin> dans le dossier de suivi :` puis le plan de test qu'a écrit DISTILL, tel quel ; sinon `Aucun consigné : le dossier de suivi ne contient aucun plan de test de ce run (DISTILL l'écrit).`
- **Affichée** : repliée.
- **Rédigée par** : le moteur, qui copie le document de DISTILL.
- **À lire pour** : comparer ce qui était prévu avec ce que le diff teste.
- **Agir quand** : jamais : information seule.

### Preuves RED <!-- #red-evidence -->

- **Contient** : un tableau `Commit | Sujet | Code de sortie du rejeu` (`non rejoué` sans rejeu), puis `Les extraits de sortie des rejeux ne sont pas encore consignés.` ; sans commit red, `Aucune consignée : aucun commit red n'a été accepté dans ce run.`
- **Affichée** : repliée ; le résumé dit `Preuves RED: N commits red`, jamais ouverte seule.
- **Rédigée par** : le moteur, à partir des commits red que le journal a acceptés.
- **À lire pour** : voir que chaque test a échoué avant le code qui le fait passer.
- **Agir quand** : un commit red affiche `non rejoué` et vous voulez une preuve.

### Portes de qualité <!-- #quality-gates -->

- **Contient** : un tableau `Composant | Porte | Commande | Résultat | Durée | Preuve` ; sans porte, `Aucune consignée : aucune porte n'a tourné dans ce run.`
- **Affichée** : repliée ; le résumé dit `Portes de qualité: [N en échec, ]M réussies` et le bloc s'ouvre seul quand une porte a échoué.
- **Rédigée par** : le moteur, à partir des portes que le journal a consignées.
- **À lire pour** : voir quelles vérifications ont tourné, avec quelle commande, et en combien de temps.
- **Agir quand** : une porte a échoué.

### Revue <!-- #review -->

- **Contient** : par étape de revue, son nom en gras et son tableau ([Tableau de revue](#review-table)) ; `Chaque lentille de la dernière passe de chaque revue est passée sans constat.` quand aucune lentille n'a rien trouvé.
- **Affichée** : repliée ; le résumé dit `Revue: <décomptes>` et le bloc s'ouvre seul tant qu'un constat est À corriger, À trancher ou Accepté.
- **Rédigée par** : le moteur, à partir de la dernière passe de chaque revue.
- **À lire pour** : voir ce que les lentilles ont trouvé et ce que le réfuteur a décidé.
- **Agir quand** : une ligne est À corriger ou À trancher ; lisez une ligne Accepté avant de fusionner.

### Captures d'écran <!-- #screenshots -->

- **Contient** : les captures claires et sombres d'un front end que le run a gardées ; voir [Joindre les captures d'un frontend](../how-to/attach-screenshots.md).
- **Affichée** : repliée ; les captures sombres sont repliées à leur tour.
- **Rédigée par** : le moteur, à partir de ce qu'a consigné la dernière étape visuals.
- **À lire pour** : juger les écrans sans lancer l'application.
- **Agir quand** : un écran ne correspond pas à ce que demandait la story.

### Plus de tests Domain que de tests d'acceptation <!-- #domain-heavy -->

- **Contient** : `Les plans de test comptent <n> lignes Domain contre <m> lignes d'acceptation (Application et E2E).` et la suggestion de lancer `/skraft:prune-tests`.
- **Affichée** : sous son titre, seulement quand les plans de test comptent plus de lignes Domain que de lignes d'acceptation ; sinon la suggestion est dans le Résumé du run.
- **Rédigée par** : le moteur, à partir des plans de test.
- **À lire pour** : repérer les tests qui ne tuent peut-être aucun mutant à eux seuls.
- **Agir quand** : vous voulez élaguer : le développeur lance la commande sur un composant et décide de chaque test.

### Hors périmètre et limites <!-- #out-of-scope -->

- **Contient** : le texte du pr-writer ; sans étape pr-writer, `Non rédigé : le run n'a aucune étape pr-writer qui ait rédigé ce qui est hors périmètre.`
- **Affichée** : sous son titre.
- **Rédigée par** : l'agent pr-writer.
- **À lire pour** : savoir ce que la pull request laisse volontairement de côté.
- **Agir quand** : une limite change votre décision de fusionner.

### Résumé du run <!-- #run-summary -->

- **Contient** : le statut du run, le tableau du rapport du run, et la ligne `/skraft:prune-tests` quand la section Domain trop nombreux ne l'affiche pas déjà.
- **Affichée** : repliée.
- **Rédigée par** : le moteur, à partir du journal.
- **À lire pour** : voir comment le run s'est terminé et ce qu'il a coûté.
- **Agir quand** : le statut n'est pas celui attendu.

### Mention de l'IA <!-- #ai-disclosure -->

- **Contient** : les familles de modèles et les modèles que l'hôte a nommés ; que Ce qui change, Pourquoi et Hors périmètre ont été rédigés par l'agent pr-writer et que toutes les autres sections sont rendues par le moteur à partir du journal du run ; qu'un humain la relit avant sa fusion.
- **Affichée** : repliée.
- **Rédigée par** : le moteur.
- **À lire pour** : savoir quels modèles ont préparé la pull request.
- **Agir quand** : jamais : information seule.

## Commentaire des détails du run <!-- #run-details -->

Au-delà de la limite de corps de la forge, le corps garde les sections affichées sous un titre et celles qui sont ouvertes, plus une ligne qui renvoie aux commentaires. Les sections repliées vont dans des commentaires intitulés `skraft · détails du run` (`skraft · run details` pour une story en anglais), numérotés `k/n` quand un seul ne suffit pas. Une section trop longue pour un commentaire est coupée avec le texte `cut` des mots de la description, qui renvoie à `pull-request.md` dans le dossier de suivi : il garde toute la description. `skraft publish` rétablit les commentaires.

## Tableau de revue <!-- #review-table -->

La ligne de décompte ressemble à `Revue : 2 à corriger, 1 note, 13 réfutés`. Chaque étape de revue a un tableau aux colonnes `Statut | Sévérité | Lentille | Emplacement | Constat | Pourquoi`. Les lignes sont groupées À corriger, À trancher, Accepté, puis Note ; les lignes Réfuté sont repliées sous leur nombre. La cellule Lentille dit `<lentille> <id> <porte>` pour chaque lentille qui a trouvé la même ligne avec la même sévérité et le même statut. Le constat et la raison sont coupés à 100 caractères avec `…` ; `verdict.yaml` les garde entiers.

### Statuts <!-- #statuses -->

| Statut | Compte pour le verdict | Ce que vous faites |
|---|---|---|
| À corriger | oui | le corriger, ou y répondre dans la pull request |
| À trancher | non | décider : une seule lentille l'a trouvé et le réfuteur l'a réfuté |
| Accepté | non | un humain l'a accepté tel quel quand la revue a atteint le plafond de sa boucle ; le lire avant de fusionner |
| Note | non | le corriger si c'est peu coûteux ; ne bloque jamais |
| Réfuté | non | lire la raison seulement si vous n'êtes pas d'accord |

### Du constat au statut <!-- #finding-to-status -->

Le réfuteur vérifie chaque constat blocker, high ou medium ; sa réponse et deux faits donnent le statut. Un constat qui serait À corriger et qu'un humain a accepté au plafond de la revue (`review-ceiling`, `ACCEPT`) est Accepté, sa colonne Pourquoi `un humain l'a accepté tel quel au plafond de la revue`.

| Sévérité | Ligne | Réponse du réfuteur | Une lentille seule, les autres passées | Statut | Colonne Pourquoi |
|---|---|---|---|---|---|
| low, d'une lentille qui a répondu `fail` | toute | non sollicité | — | À corriger | `faible, d'une lentille en échec : il compte sans réfutation` |
| low, d'une lentille qui n'a pas échoué | toute | non sollicité | — | Note | vide |
| blocker, high, medium | inchangée depuis la passe N | non sollicité | — | Note | `nouveau sur une ligne inchangée depuis la passe N` |
| blocker, high, medium | modifiée | `confirmed` | — | À corriger | `confirmé : <raison>` |
| blocker, high, medium | modifiée | `unverifiable`, ou sa vérification illisible deux fois | — | À corriger | `non vérifié : <raison>` |
| blocker, high, medium | modifiée | `refuted` | oui | À trancher | `une seule lentille, contre celles qui sont passées ; réfuté : <raison>` |
| blocker, high, medium | modifiée | `refuted` | non | Réfuté | `<raison>` |
| blocker, high, medium | même endroit qu'un constat réfuté à la passe N | non sollicité de nouveau | — | Réfuté | `<raison> (réfuté à la passe N)` |

Comment le réfuteur travaille et comment une passe suivante le réutilise : [Réfutation](./gates.md#refutation), [Re-revue incrémentale](./gates.md#incremental).

## Commentaire de revue <!-- #review-comment -->

`skraft review --pr <n> --publish` garde un commentaire sur la pull request, dans sa langue :

1. le titre `### skraft review · #<n> — <STATUT> (passe N)` ;
2. la ligne de décompte, ou le résumé du verdict quand le statut est BLOCKED ou qu'il n'y a aucun constat ;
3. les tableaux du [Tableau de revue](#review-table) ;
4. le marqueur visible `skraft-review pr=<n>`, qui retrouve le commentaire.

Le commentaire est réécrit à chaque passe ; sur Azure Repos, c'est un fil créé Closed. Étapes et consentement : [Revoir une pull request avec skraft](../how-to/review-a-pull-request.md).

## Voir aussi <!-- #see-also -->

- [Publier la pull request d'un run](../how-to/publish-pull-request.md)
- [Revoir une pull request avec skraft](../how-to/review-a-pull-request.md)
- [Portes : revue](./gates.md#review-run)
- [Dossier de suivi et journal](./run-journal.md)
- [Commentaires d'issue](./issue-comments.md)
