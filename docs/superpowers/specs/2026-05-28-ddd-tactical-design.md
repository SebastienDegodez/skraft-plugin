# Spec — DDD Tactical Design (Aggregate Design Canvas)

> **Statut spec :** v1 — design seulement. Aucun fichier d'agent, skill ou template n'est livré ici. Les artefacts d'implémentation suivront en phase `writing-plans` puis exécution, après gate utilisateur.

## Cycle de vie de cette spec

Document de design produit dans le prolongement de la révision genesis-architect du 28 mai 2026 (post Lots 1 + 2 sur `feat/hve-compatibility`).

**Pré-requis :** la spec stratégique [`2026-05-28-ddd-strategic-design.md`](./2026-05-28-ddd-strategic-design.md) doit être livrée ET observée sur ≥ 1 cycle DESIGN réel avant d'attaquer celle-ci. La raison : G16 lit le champ `bc_owner` du canvas, qui pointe vers les `bc-canvas-{bc-slug}.md` introduits par la spec stratégique.

Doctrine appliquée :

- [`2026-05-28-design-consistency-principles.md`](./2026-05-28-design-consistency-principles.md) — P1, P2, P3.

Sources externes :

- **ddd-crew** ([github.com/ddd-crew](https://github.com/ddd-crew)) — Aggregate Design Canvas.
- **Khononov, *Learning Domain-Driven Design*** — chap. 6 (aggregates, invariants).

## Contexte

Post Lots 1 + 2 et post-spec stratégique, la couche tactique reste en **prose libre** sans gate dur :

```
+------------------+
| Aggregate        |
| per-agg          |
| invariants       |
| (state, commands,|
|  events emitted) |
+------------------+
| implicit in      |
| event-model      |
+------------------+
| no gate          |
+------------------+
```

C'est la classe d'incohérence la plus coûteuse à propager en aval : un invariant nommé en event-model mais absent du code DELIVER ne sera jamais détecté par les acceptance tests si DISTILL ne le voit pas.

## Objectifs

1. **Décomposer la couche aggregate** en un canvas par aggregate, source de vérité requêtable par G10/G12.
2. **Faire de l'invariant business la source de vérité unique**, lue par le reviewer plutôt que devinée dans la prose.
3. **Réutiliser les conventions Lots 1-2** et la doctrine P1/P2/P3.

## Hors périmètre

- **Subdomain classification + BC canvas.** Voir [`2026-05-28-ddd-strategic-design.md`](./2026-05-28-ddd-strategic-design.md).
- **Mapping aggregate → microservice boundaries** (Khononov chap. 10-11). Appartient à DEVOPS phase.
- **Sous-agent dédié à la recherche bibliographique** (truth #5). Hors scope ; à rouvrir pour la version industrielle de skraft.
- **R1 SPLIT** de `solution-architect`. À évaluer après livraison de cette spec, métrique : taille body > 800 lignes OU temps de chargement perçu trop long.
- **Migration des designs existants** vers les canvases. Append-forward only.

## Contenu

### Inputs

- Tous les outputs de la spec stratégique (notamment `bc-canvas-{bc-slug}.md`).
- `details/{date}/event-model-{story-id}.md` (existant).
- `details/{date}/diagrams-{story-id}.md` (Phase 8, existant).

### Nouveaux artefacts (append-only, sous `.copilot-tracking/skraft-plans/{project-slug}/`)

- `details/{date}/agg-canvas-{aggregate-slug}.md` — 1 canvas par aggregate ratifié. Champs ddd-crew : `name`, `description`, `state_transitions` (table machine à états), `enforced_invariants` (1 ligne par invariant, formulation business), `corrective_policies`, `handled_commands`, `created_events`, `throughput_estimate`, `bc_owner` (lien vers `bc-canvas-{bc-slug}.md`).

### Modifications du persona

- **Phase 6 EVENT MODELING tactique** étendu : après identification d'un aggregate, écriture immédiate du canvas. Plus de spec d'invariants en prose libre — la prose d'event-model cite désormais le canvas (`voir agg-canvas-{slug}.md§enforced_invariants`).
- **Phase 9 RECONCILE & VERIFY** étendu : le grep des invariants se fait contre `agg-canvas-*.md§enforced_invariants` au lieu de chercher dans la prose. La consistency-matrix gagne une colonne `agg-canvas-{slug}.md` à côté de `event-model` / `diagrams` / `contracts`.

### Nouveau gate

- **G16 — Aggregate Invariants Exhaustively Canvased.** Lens : consistency. Sévérité : **BLOCKER** (P2 : information manquante — un invariant nommé ailleurs mais absent du canvas est exactement la classe d'incohérence que P2 refuse). Check : pour chaque aggregate cité dans un ADR (Status: Accepted) ou dans `event-model-*.md`, le canvas existe ET tout invariant mentionné dans une autre source (event-model, diagrams, ADR Context) figure dans la colonne `enforced_invariants` du canvas. Inverse : un invariant présent dans le canvas mais cité nulle part ailleurs n'est PAS un fail — c'est le canvas qui est source de vérité.

### Nouveau template asset

- `plugins/skraft-framework/assets/agg-canvas.template.md`.

> **Note emplacement.** Le template vit dans l'arbre **plugin** (`plugins/...`), pas sous `.copilot-tracking/`. Seules les **instances** générées par le persona vont sous `.copilot-tracking/skraft-plans/{project-slug}/details/{date}/`.

### Consistency-matrix template enrichi

- Ajout d'une ligne dans `shared_artifact_registry` pour `agg-canvas` (`source_of_truth`, `consumers: [DISTILL, DELIVER]`, `owner: solution-architect`, `integration_risk: high`, `validation: G16`).
- Ajout de la colonne `agg-canvas-{slug}.md` dans le tableau de matrice.

### Compteur de gates

Pré-spec (post-stratégique) : 15. Post-spec : 16 (+G16 BLOCKER).

## Application des principes

- **P1 — Registre typé.** `agg-canvas-{aggregate-slug}.md` ajoute une ligne au registre (`integration_risk: high` car un invariant raté propage jusqu'à DELIVER). G16 lit le registre, ne re-dérive pas la propriété.
- **P2 — Earned Consistency.** G16 = BLOCKER. Phase 9 RECONCILE doit HALT si un invariant est cité quelque part sans être dans le canvas — pas paraphraser.
- **P3 — Escalade.** G16 émet le BLOCKER JSON standard avec `escalation_required: true`, résolution via fichier-frère `-resolution.md`.

## Capacité d'écriture des reviewers

Inchangée par rapport au design `2026-05-26-reviewer-verdict-schema-design.md`. G16 ne demande que de la **lecture** (grep, file presence, frontmatter parsing) — aucune écriture supplémentaire requise du reviewer.

## Compatibilité avec les conventions Lots 1-2

- **Append-only :** les canvases sont ajoutés sous `details/{date}/`. Si un invariant change, un nouveau canvas est écrit avec date plus récente ; l'ancien reste consultable.
- **Header markdown :** le nouveau template porte `<!-- markdownlint-disable-file -->`.
- **BLOCKER JSON :** G16 émet le même JSON shape que G14 (Lot 2), avec `escalation_required: true` et résolution par fichier-frère `-resolution.md`.

## Décisions à trancher avant phase plan

- **D4 — R1 SPLIT du persona.** À évaluer **après** cette spec si la taille body dépasse 800 lignes ou si le temps de chargement perçu devient gênant. Si SPLIT, candidate names : `solution-architect-strategic` (Phases 2.5, 5, 5.5, 7) + `solution-architect-tactical` (Phases 3, 4, 6, 8, 9).
- **D5 — Throughput estimate.** Le champ `throughput_estimate` du canvas est-il consommé par DEVOPS ? Si oui, registre P1 doit refléter ce consumer. **À investiguer avant phase plan.**

## Critères d'acceptation de la spec

- [ ] D4, D5 ont une décision écrite.
- [ ] Une revue genesis-architect a confirmé : pas de GOD MODULE résiduel sur `solution-architect`, pas de LEAKY ABSTRACTION dans le template agg-canvas.
- [ ] Une revue rapide a confirmé que G16 ne duplique pas G10/G12 (G10/G12 portent sur les contrats inter-artefacts ; G16 porte sur la complétude d'un type d'artefact).
- [ ] L'auteur a relu Khononov chap. 6 (cure truth #5 manuelle).
- [ ] La spec stratégique a été livrée ET observée sur ≥ 1 cycle DESIGN réel.
