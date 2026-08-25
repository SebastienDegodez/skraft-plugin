# Spec — Design Consistency Principles (P1, P2, P3)

> **Statut spec :** v1 — doctrine. Aucun artefact d'implémentation n'est livré ici. La spec nomme et fige trois principes posés par les Lots 1-2 sur `feat/hve-compatibility`, pour qu'ils soient citables par toute spec DESIGN ultérieure sans être ré-inventés.

## Cycle de vie de cette spec

Document de **doctrine**. Cadence d'évolution : change quand une 4ème leçon transversale émerge des cycles DESIGN/DISTILL/DELIVER. Les specs consommatrices citent un principe par son identifiant (P1, P2, P3) sans en recopier le contenu.

Consumers identifiés à la date :

- [`2026-05-28-ddd-strategic-design.md`](./2026-05-28-ddd-strategic-design.md)
- [`2026-05-28-ddd-tactical-design.md`](./2026-05-28-ddd-tactical-design.md)

Toute spec qui pose un nouveau gate de cohérence cross-artefact, un nouveau BLOCKER, ou un nouveau type d'artefact référencé par le reviewer doit citer les principes applicables.

## Contexte

Les Lots 1 et 2 (commits `ce76acd` et `71daa77` sur `feat/hve-compatibility`) ont posé trois mécanismes qui se sont avérés **load-bearing** :

1. Un registre typé des artefacts dans `consistency-matrix.template.md`.
2. Une règle de comportement face à l'incohérence (Earned Consistency).
3. Un canal d'escalade humain explicite dans le BLOCKER JSON.

Sans nom, ces mécanismes risquent d'être ré-inventés (ou pire, contredits) par chaque nouvelle spec DESIGN. La présente doctrine leur donne des identifiants stables.

## Les trois principes

### P1 — Registre typé des artefacts (Shared Artifact Registry)

**Énoncé.** Chaque artefact d'une story est typé dans `plugins/skraft-framework/assets/consistency-matrix.template.md` par cinq attributs : `source_of_truth`, `consumers`, `owner`, `integration_risk`, `validation`. Les gates de cohérence cross-artefact (G10, G12, et tout gate équivalent ajouté ultérieurement) lisent ce registre comme un système de coordonnées au lieu de re-dériver la propriété depuis la prose.

**Implication pour les specs consommatrices.** Toute spec qui introduit un nouveau type d'artefact destiné à être consommé par DISTILL/DELIVER doit ajouter une ligne au registre dans la même livraison. Une spec qui produit un nouvel artefact sans entrée registre crée une **PHANTOM DEPENDENCY** (visible aux humains, invisible aux gates).

**Mode d'échec qu'il prévient.** TOOLLESS ASSERTION : le reviewer affirmerait sinon la cohérence par regex sur de la prose libre, ce qui retombe sous truths #3 (output probabiliste) et #4 (hallucination).

### P2 — Earned Consistency

**Énoncé.** Toute incohérence non rattrapée par un gate est une *foi imposée à DISTILL*. La règle est de **HALT explicitement** (BLOCKER) plutôt que de réconcilier silencieusement. Phase 9 RECONCILE existe pour refuser cette foi, pas pour la masquer.

**Implication pour les specs consommatrices.** Une nouvelle spec qui détecte une classe d'incohérence doit choisir la sévérité du gate selon la règle suivante :

- L'incohérence porte sur une **information manquante** que DISTILL ne peut pas inférer → **BLOCKER**.
- L'incohérence porte sur une **forme** que DISTILL peut tolérer (label drift, casse, synonyme) → **HIGH** avec budget de retry (Lot 1 : 1 retry).
- L'incohérence porte sur une **ambiguïté** (plusieurs interprétations valides) → **MEDIUM**, signalée sans bloquer.

**Mode d'échec qu'il prévient.** SILENT RECONCILE : Phase 9 paraphrase pour masquer un trou plutôt que d'arrêter. C'est la classe d'erreur la plus coûteuse car invisible en aval.

### P3 — Signal d'escalade explicite

**Énoncé.** Le BLOCKER JSON porte un flag top-level `escalation_required: true` (séparé de `status: blocked`). Le canal humain est ainsi signalé indépendamment de l'état logique du flux.

**Implication pour les specs consommatrices.** Tous les nouveaux BLOCKER émettent le même JSON shape (forme définie dans `consistency-matrix.template.md`) et leur résolution suit le pattern fichier-frère `-resolution.md` posé Lot 1. Aucune spec ne réinvente le canal humain — ni via un fichier de queue séparé, ni via un champ frontmatter parallèle.

**Mode d'échec qu'il prévient.** HARNESS-LLM CONFLATION : sans flag explicite, le BLOCKER est traité comme un état purement logique du flux, et l'opérateur humain n'est pas notifié.

## Hors périmètre

- Les principes opérationnels propres à un domaine (DDD, sécurité, performance, …). Ils vivent dans leurs specs respectives et citent P1/P2/P3 si pertinent.
- Le mécanisme de supersession des ADR (Lot 1). C'est une convention d'artefact, pas un principe transversal — il reste documenté dans `plugins/skraft-framework/instructions/skraft-artifacts.instructions.md`.
- Les budgets de retry pour les drifts de label/classification/structure (Lot 1). Idem : convention d'artefact, dans `consistency-matrix.template.md`.

## Décisions à trancher

Aucune. Les trois principes sont en vigueur depuis les Lots 1-2 ; cette spec les nomme et les fige sans rien décider de nouveau.

## Critères d'acceptation

- [ ] Une revue genesis-architect a confirmé que chaque principe est cohérent avec les truths du mental model (P1↔#3+#4, P2↔#3+#4, P3↔#2+#6).
- [ ] Un grep dans les specs DESIGN existantes confirme qu'aucune ne re-définit l'un des trois mécanismes sous un autre nom.
- [ ] Chaque spec consommatrice à venir cite P1/P2/P3 par identifiant, sans en recopier le contenu.
