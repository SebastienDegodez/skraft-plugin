---
title: "Canvas du backlog et carte des stories"
description: "Chaque partie du canvas skraft backlog (en-tête, compteurs, stories, revue, handoff) et de story-map.md : ce qu'elle contient, comment la lire, quand agir."
persona: tech-lead
---

# Canvas du backlog et carte des stories

Le canvas *skraft backlog* montre un run de `skraft-prd-backlog` pendant qu'il écrit et relit les stories ; `story-map.md` est le découpage dont il part.

Pourquoi le run s'arrête pour un humain, et où se placent les lentilles de planification : [Le backlog](../explanation/backlog.md).

:::note[À propos des figures]
Le canvas suit la langue du PRD. Les figures viennent d'un run sur un PRD écrit en français : leurs libellés sont ceux du canvas français.
:::

## En-tête <!-- #header -->

**Contient** : le slug du backlog (un sélecteur quand l'espace de travail en compte plusieurs), les onglets **Suivi** et **Revue**, `n/n FR couvertes · n reportées`, le décompte des verdicts de toutes les stories (conformes, avec avertissement, en échec) et le dépôt cible.

**À lire pour** savoir quel backlog est ouvert, si chaque exigence fonctionnelle du PRD est portée par une story, et combien de stories passent.

**Agir quand** des exigences sont reportées (`n reportées`) ou que des stories échouent : ouvrez l'onglet **Revue**.

![En-tête du canvas : backlog « assistant-event-storming », onglets Suivi et Revue, « 16/16 FR couvertes · 0 reportées », verdicts 1 conforme, 13 avec avertissement, 2 en échec, dépôt SebastienDegodez/skraft-demo-event-storming](/img/screenshots/fr/backlog-canvas-header.png)

*Figure 1 — L'en-tête d'un vrai run ([dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-event-storming)).*

## Onglet Suivi <!-- #progress-tab -->

### Compteurs <!-- #counters -->

**Contient** : huit chiffres : épics, stories, fiches écrites (`écrites/stories`), refusées, retenues, prêtes, relues (`relues/prêtes`), publiées. En dessous, une barre avec un segment par étape et sa légende. Les chiffres refusées et retenues passent au rouge et à l'ambre quand ils ne sont pas nuls. Prêtes, relues et publiées restent estompées avec « après le plan de création » tant que le run n'a pas produit ce plan.

**À lire pour** voir la distance qui reste jusqu'à GitHub : *refusée* (la fiche du rédacteur échoue à ses contrôles), *retenue* (la fiche passe mais attend une story refusée ou laisse des questions ouvertes), *prête* (attend une relecture humaine), *relue*, *publiée*.

**Agir quand** *refusées* ou *retenues* n'est pas nul : corrigez-les (voir [Corrections et questions](#corrections)) avant le handoff.

![Compteurs : 3 épics, 16 stories, 16/16 fiches écrites, 0 refusée, 4 retenues, 12 prêtes, 0/12 relue, 0 publiée ; la barre : 12 prêtes à relire, 4 retenues](/img/screenshots/fr/backlog-canvas-counters.png)

*Figure 2 — Les compteurs et la barre des étapes d'un vrai run ([dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-event-storming)).*

### Agents au travail <!-- #agents -->

**Contient** : pendant ELABORATE, une ligne « n agents au travail » avec un `story-writer` par story, sa tentative et depuis quand il tourne.

**À lire pour** savoir que le run est vivant et quelles stories s'écrivent.

**Agir quand** jamais : attendez. La vue se remplit à mesure que le workflow écrit.

![Canvas skraft backlog, onglet Suivi, pendant ELABORATE : « 8 agents au travail », un story-writer par story avec sa tentative et depuis quand il tourne, puis 3 épics, 16 stories, 9/16 fiches écrites, aucune refusée pour l'instant](/img/screenshots/fr/backlog-canvas-elaborate.png)

*Figure 3 — ELABORATE sur un extrait d'un vrai PRD ([dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-event-storming)) : huit `story-writer` au travail.*

### Stories <!-- #story-list -->

**Contient** : des puces de filtre (Toutes, À relire, Refusées, Retenues, Prêtes, Publiées, Questions, chacune avec son compte) et une recherche par id ou titre. Puis une carte par épic : son verdict (`approuvée`, `à reprendre`, `rejetée`, `pas encore revue`) et la tentative de sa revue par les lentilles, son résultat, *Terminée quand*, les constats sur l'épic elle-même, et une bande d'une cellule par story. Par story : icône de verdict, id, titre, `TRACER` pour le tracer bullet de l'épic, ids FR, `après <story>` (ce qu'elle attend), jalon, une barre de six lettres INVEST puis huit repères de la Définition de prêt, statut, points, MoSCoW, et le nombre de questions ouvertes s'il y en a.

**À lire pour** trouver les stories à regarder : un repère rouge ou ambre désigne la lettre INVEST ou l'item DoR qui échoue.

**Agir quand** une story est refusée ou retenue : cliquez-la, l'onglet **Revue** s'ouvre dessus.

![Liste des stories : filtres Toutes 16, À relire 12, Refusées 0, Retenues 4, Prêtes 12, Publiées 0, Questions 15 ; épic EP-001 rejetée à la tentative 3 avec son résultat et son « Terminée quand » ; S01 prête avec avertissement et 3 questions, S02 prête, S03 retenue](/img/screenshots/fr/backlog-canvas-story-list.png)

*Figure 4 — Les stories de l'épic EP-001 d'un vrai run ([dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-event-storming)).*

## Onglet Revue <!-- #review-tab -->

### Raisons et INVEST <!-- #review-reasons -->

**Contient** : pour la story en focus : titre, id, épic, jalon, MoSCoW, points, l'énoncé (En tant que / je veux / afin de), un dock avec son état, l'index des repères, **Répondre n** et **Marquer relue**, les anti-patterns détectés (Persona vague, Sans exemples, Critère technique…), les raisons pour lesquelles une story retenue l'est, puis les checklists INVEST et Définition de prêt. Chaque ligne dit ce qui a été trouvé (une citation, un compte, une dépendance) et, quand elle échoue, s'ouvre sur *Pourquoi* et *Correction*. En dessous : les constats des lentilles et la fiche de la story.

**À lire pour** comprendre pourquoi une story ne passe pas et que changer.

**Agir quand** une ligne est rouge ou ambre : ouvrez-la, lisez *Correction*, puis *Voir dans la fiche* pour atterrir sur le passage.

![Revue de la story EP-001-S05 « Attribuer un rôle applicatif », retenue : énoncé, barre de repères, bouton Répondre 2, trois raisons de la retenue, Indépendante qui attend EP-001-S01 et EP-001-S02, Négociable conforme](/img/screenshots/fr/backlog-canvas-review-reasons.png)

*Figure 5 — La revue d'une story retenue d'un vrai run ([dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-event-storming)).*

### Corrections et questions <!-- #corrections -->

**Contient** : les corrections que la revue propose pour une story (la découper, déclarer une dépendance, préciser un critère), et ses questions ouvertes. Une question liste des réponses proposées et un champ libre ; **Enregistrer** garde la réponse en brouillon, **Retirer** l'efface.

**À lire pour** voir ce que le rédacteur ne peut pas trancher seul.

**Agir quand** une story retenue a des questions : choisissez ou écrivez les réponses (**Répondre n** dans le dock), puis relancez `skraft-prd-backlog` avec `corrections true`. Le rédacteur intègre les brouillons aux fiches ; seules les stories touchées sont réécrites et relues.

## Actions du handoff <!-- #handoff -->

**Contient** : un pied de page avec `n/n prêtes relues`, le nombre de questions ouvertes (un lien vers la première story qui en a), le dépôt cible (`vers owner/repo`) et trois boutons : **Marquer relue** (dans le dock de chaque story), **Aperçu à blanc** et **Créer les issues** (**Créer n issues** dès qu'une sélection existe).

**À lire pour** savoir ce que ferait une création : l'aperçu à blanc liste ce qui serait créé, lié ou existe déjà.

**Agir quand** le run s'arrête sur le handoff : relisez chaque story prête, lancez **Aperçu à blanc**, puis **Créer les issues**. La création fait exactement le dernier aperçu, qui expire après 15 minutes, et refuse une sélection modifiée depuis. Ces actions appartiennent à une personne : l'agent peut lire, expliquer et prévisualiser, jamais marquer une story relue ni créer.

![Pied de page : « 0/12 prêtes relues », « 30 questions ouvertes », « vers SebastienDegodez/skraft-demo-event-storming », boutons Aperçu à blanc et Créer les issues](/img/screenshots/fr/backlog-canvas-handoff-actions.png)

*Figure 6 — Le pied de page du handoff d'un vrai run ([dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-event-storming)).*

## story-map.md <!-- #story-map -->

Le découpage que le run écrit dans `.copilot-tracking/skraft-plans/<slug>/backlog/` avant les stories, et le second arrêt humain. Modifiez `story-map.json`, jamais le `.md` : le workflow le rend de nouveau à la reprise.

| Section | Contient |
|---|---|
| Milestones | `Milestone`, `Title`, `Due`, `Stories`, `Points` |
| Build order | une ligne par story, dans l'ordre de construction : `# \| Story \| Epic \| Milestone \| MoSCoW \| Points \| Waits on \| Covers` |
| Epics | par épic : son titre, son résultat et sa checklist *done when* |

`(tracer)` après l'id d'une story marque le tracer bullet de son épic. `Waits on` liste les stories à faire avant (`—` pour aucune) ; `Covers` liste les ids d'exigence qu'elle porte.

Extrait du PRD de démonstration :

```markdown
| # | Story | Epic | Milestone | MoSCoW | Points | Waits on | Covers |
|---|-------|------|-----------|--------|--------|----------|--------|
| 1 | EP-001-S01 (tracer) — Créer une séance depuis le modèle Big Picture | EP-001 | M1 | must | 3 | — | FR-004 |
| 2 | EP-001-S02 — Rejoindre une séance par code | EP-001 | M1 | must | 2 | EP-001-S01 | FR-002 |
| 3 | EP-001-S03 — S'authentifier via le fournisseur SSO de l'organisation | EP-001 | M1 | must | 3 | — | FR-001 |
```

## Voir aussi <!-- #see-also -->

- [Transformer un PRD en backlog GitHub](../how-to/prd-to-backlog.md)
- [Raffiner une issue du backlog](../how-to/refine-backlog.md)
- [Gates : DISCUSS](./gates.md#discuss)
