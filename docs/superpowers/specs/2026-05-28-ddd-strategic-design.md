# Spec — DDD Strategic Design (Subdomain Classification + Bounded Context Canvas)

> **Statut spec :** v1 — design seulement. Aucun fichier d'agent, skill ou template n'est livré ici. Les artefacts d'implémentation suivront en phase `writing-plans` puis exécution, après gate utilisateur.

## Cycle de vie de cette spec

Document de design produit dans le prolongement de la révision genesis-architect du 28 mai 2026 (post Lots 1 + 2 sur `feat/hve-compatibility`). Cadence d'évolution : indépendante du tactique (voir [`2026-05-28-ddd-tactical-design.md`](./2026-05-28-ddd-tactical-design.md)).

Doctrine appliquée :

- [`2026-05-28-design-consistency-principles.md`](./2026-05-28-design-consistency-principles.md) — P1, P2, P3.

Sources externes :

- **Khononov, *Learning Domain-Driven Design*** — chap. 1-2 (subdomains), chap. 4 (context mapping, pour l'appendix optionnel).
- **ddd-crew** ([github.com/ddd-crew](https://github.com/ddd-crew)) — Bounded Context Canvas.

## Contexte

Post Lots 1 + 2, la persona `solution-architect` couvre :

- Phase 4 Event Modeling
- Phase 5 DDD stratégique léger (bounded contexts, context map)
- Phase 6 DDD tactique (aggregates, VOs, events)
- Phase 7 ADRs ratifiants + supersession bidirectionnelle (registre)
- Phase 9 Consistency matrix cross-artefact (13 gates côté reviewer)

Deux zones stratégiques restent en **prose libre** sans gate dur :

```
+------------------+   +------------------+
| Subdomain        |   | Bounded Context  |
| classification   |   | per-BC structure |
| (core/supporting |   | (purpose, lang,  |
|  /generic)       |   |  deps, model)    |
+------------------+   +------------------+
| free prose       |   | implicit in      |
| in event-model   |   | context-map      |
+------------------+   +------------------+
| no gate          |   | no gate          |
+------------------+   +------------------+
```

Chaque case « no gate » est une *foi imposée à DISTILL* au sens du principe P2 (voir spec de doctrine). La présente spec instaure les deux gates manquants.

## Objectifs

1. **Typer la classification stratégique** d'un BC comme premier intrant de PATTERN-NECESSITY (G11) au lieu d'une heuristique a-posteriori.
2. **Décomposer le context map** en un canvas par BC (PANEL pattern, Tier-3) pour briser la PANEL-IN-ONE-CONTEXT identifiée en revue.
3. **Réutiliser les conventions Lots 1-2** : append-only directories, `<!-- markdownlint-disable-file -->`, supersession bidirectionnelle, BLOCKER JSON `escalation_required: true`.
4. **Instancier P1 et P2 pour chaque nouvel artefact** (voir « Application des principes »).

## Hors périmètre

- **Aggregate Design Canvas et G16.** Voir [`2026-05-28-ddd-tactical-design.md`](./2026-05-28-ddd-tactical-design.md).
- **Sous-agent dédié à la recherche bibliographique** (truth #5 — citations DDD de mémoire). Note à conserver pour la version industrielle de skraft ; non bloquant pour cette itération.
- **Big Picture EventStorming** — appartient à DISCOVER, pas DESIGN.
- **Domain Storytelling** — doublon avec Event Modeling Phase 4. GOD MODULE à éviter.
- **R1 SPLIT** de `solution-architect` en `strategic` + `tactical`. À observer après livraison du tactique, pas décidé maintenant.
- **Migration des designs existants** vers les nouveaux canvases. Append-forward only.

## Contenu

### Inputs

- `plans/{date}/stories-{milestone}.md` (existant)
- `details/{date}/event-model-{story-id}.md` (Phase 4, existant)

### Nouveaux artefacts (append-only, sous `.copilot-tracking/skraft-plans/{project-slug}/`)

- `docs/adr/adr-{nnn}-subdomain-{bc-slug}.md` — 1 ADR par BC, ratifie la classification `{ core | supporting | generic }`. Section « Decision Forces » liste les critères Khononov (compétitivité, complexité, évolution). Rentre dans la séquence ADR numérique existante.
- `details/{date}/bc-canvas-{bc-slug}.md` — 1 canvas par BC, schéma ddd-crew adapté : `purpose`, `strategic_classification` (lien vers ADR-NNN-subdomain), `domain_roles`, `ubiquitous_language` (glossaire), `business_decisions`, `inbound_dependencies`, `outbound_dependencies`, `messaging` (events publiés/consommés).

### Nouvelles étapes du persona

- **Phase 2.5 SUBDOMAIN CLASSIFICATION** entre Phase 2 (RECEIVE inputs DISCUSS) et Phase 3 (EVENT MODELING). Une décision par BC identifié ; écriture des ADRs `ADR-NNN-subdomain-*`. Si pas encore de BC identifié, la décision est différée à Phase 5 et un BLOCKER est levé si Phase 5 termine sans classification.
- **Phase 5.5 BC CANVAS** entre Phase 5 (context map) et Phase 6 (aggregates). Un canvas par BC, lien obligatoire vers son ADR-subdomain.

### Nouveaux gates côté reviewer (`solution-architect-reviewer` + `architecture-review-criteria` SKILL)

- **G14 — Subdomain Classification Exists.** Lens : consistency. Sévérité : **BLOCKER** (P2 : information manquante). Check : pour chaque BC nommé dans le context map, un `ADR-NNN-subdomain-{bc-slug}.md` existe avec une classification dans `{ core | supporting | generic }`.
- **G15 — BC Canvas Coherent with Classification.** Lens : fitness. Sévérité : **HIGH** (P2 : forme, le canvas peut être enrichi sans bloquer la suite tant que l'ADR-subdomain existe). Check : pour chaque BC, le canvas existe ET le champ `strategic_classification` cite la même classification que l'ADR-subdomain correspondant.
- **G11 renforcé** — la liste des admissible forces de PATTERN-NECESSITY accepte désormais `"core domain — read/write asymmetry"`, `"core domain — audit trail"` etc. comme premier intrant ; le format devient `"<core|supporting|generic> domain — <force technique>"`. Une force technique sans classification préfixée est rejetée.

### Nouveau template asset

> **Note emplacement.** Templates et références vivent dans l'arbre **plugin** (`plugins/...`), pas sous `.copilot-tracking/`. Seules les **instances** générées par le persona vont sous `.copilot-tracking/skraft-plans/{project-slug}/details/{date}/` ou `adrs/`.


- `plugins/skraft-framework/assets/bc-canvas.template.md` — squelette du canvas, identique à ddd-crew mais avec en-tête `<!-- markdownlint-disable-file -->`, slots `{bc-slug}`, `{strategic_classification}`, `{adr-subdomain-path}`, et une section « Ubiquitous Language » dont les termes alimenteront le glossaire DELIVER (anti-LEAKY ABSTRACTION : le canvas ne nomme aucun type C# / aucun chemin Clean Architecture).

### Compteur de gates

13 → 15 (G1-G13 inchangés, +G14 BLOCKER, +G15 HIGH).

## Appendix optionnel — Context Mapping Pattern Catalog

À livrer séparément ou ne pas livrer. N'est PAS pré-requis pour les gates principaux.

**Source :** Khononov chap. 4 + `ContextMapper` patterns (Partnership, Customer-Supplier, Conformist, Anticorruption Layer, Open Host Service, Published Language, Separate Ways).

**Nouvel artefact :** `plugins/skraft-framework/skills/architecture-patterns/references/context-mapping.md` — catalogue des 7 patterns (when to use, when NOT to use, symétrie, exemple).

**Modification persona :** Phase 5 CONTEXT MAP étendu — chaque arête `BC-A → BC-B` doit citer un pattern nommé.

**Nouveau gate :** **G17 — Context Map Edges Are Pattern-Typed.** Lens : fitness. Sévérité : **MEDIUM** (P2 : ambiguïté, pas foi).

**Décision de livraison :** ne lancer que si l'usage des Lots 3 (cette spec) + 4 (tactique) révèle des ambiguïtés sur les arêtes.

## Application des principes

- **P1 — Registre typé.** Chaque nouvel `ADR-NNN-subdomain-*` rentre dans le registre via la convention générique `ADR-*` (rien à ajouter au schéma). Chaque `bc-canvas-{bc-slug}.md` ajoute une ligne avec `source_of_truth: this`, `consumers: [DISTILL, DELIVER]`, `owner: solution-architect`, `integration_risk: medium`, `validation: G15`.
- **P2 — Earned Consistency.** G14 = BLOCKER (information manquante), G15 = HIGH (forme), G17 = MEDIUM (ambiguïté). Aucun gate ne tolère un silent reconcile.
- **P3 — Escalade.** G14 émet le BLOCKER JSON standard avec `escalation_required: true`, résolution via fichier-frère `-resolution.md`.

## Compatibilité avec les conventions Lots 1-2

- **Append-only :** tous les nouveaux artefacts sont ajoutés sous `details/{date}/` ou `adrs/`. Aucun ADR existant n'est édité. Si la classification d'un BC change, une nouvelle ADR-subdomain est écrite et la précédente est superseded via le registre `docs/adr/supersessions.md` (mécanisme Lot 1).
- **Header markdown :** le nouveau template porte `<!-- markdownlint-disable-file -->`.

## Décisions à trancher avant phase plan

- **D1 — Numérotation des ADR-subdomain.** Insérées dans la séquence ADR existante (ADR-007, ADR-008, …) ou préfixe dédié `ADR-S-{NNN}` ? **Recommandation :** séquence existante, le slug `subdomain-{bc-slug}` suffit à les distinguer.
- **D2 — Glossaire DELIVER.** Le canvas BC contient un `ubiquitous_language`. DISTILL/DELIVER en consomment-ils déjà un ailleurs ? Risque de duplication avec une future Phase glossaire. **À investiguer avant phase plan.**
- **D3 — Appendix Context Mapping Pattern Catalog.** Livrer ensemble avec le canvas, ou différer ? **Recommandation :** différer ; lancer seulement si l'usage révèle l'ambiguïté.
- **D4 — Granularité `state.json::phaseArtifacts` pour les canvases.** Référencer chaque `bc-canvas-*.md` / `agg-canvas-*.md` / `coupling-matrix-*.md` individuellement, ou un seul rollup par phase ? Impact sur la procédure resume 4-étapes HVE. **Recommandation :** rollup par phase (`design.canvasesIndex: "details/{date}/INDEX.md"`), une feuille d'index regénérée par le persona à chaque ajout — évite l'explosion du state.json. **À valider avant phase plan.**

## Critères d'acceptation de la spec

- [ ] D1, D2, D3 ont une décision écrite.
- [ ] Une revue genesis-architect a confirmé : pas de PANEL-IN-ONE-CONTEXT résiduel, pas de LEAKY ABSTRACTION dans le template canvas, pas de GOD MODULE (l'appendix Context Mapping est bien séparable).
- [ ] Une revue rapide a confirmé qu'aucun gate G14/G15/G17 ne duplique fonctionnellement G1-G13.
- [ ] L'auteur a relu Khononov chap. 1-2 (cure truth #5 manuelle).
