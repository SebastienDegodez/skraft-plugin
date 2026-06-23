# Spec — Balanced Coupling Evaluation (Phase 5.7 + G18)

> **Statut spec :** v1 — design seulement. Aucun fichier d'agent, skill ou template n'est livré ici. Les artefacts d'implémentation suivront en phase `writing-plans` puis exécution, après gate utilisateur.

## Cycle de vie de cette spec

Document de design produit dans le prolongement des trois specs sœurs du 28 mai 2026. Cadence d'évolution : indépendante des trois autres ; le modèle Balanced Coupling évolue avec sa source externe (Khononov / coupling.dev), pas avec le rythme DDD canvases.

**Pré-requis (présupposés livrés) :**

- [`2026-05-28-design-consistency-principles.md`](./2026-05-28-design-consistency-principles.md) — doctrine P1, P2, P3.
- [`2026-05-28-ddd-strategic-design.md`](./2026-05-28-ddd-strategic-design.md) — ADR-subdomain, bc-canvas, G14, G15.
- [`2026-05-28-ddd-tactical-design.md`](./2026-05-28-ddd-tactical-design.md) — agg-canvas, G16.

Doctrine appliquée :

- [`2026-05-28-design-consistency-principles.md`](./2026-05-28-design-consistency-principles.md) — P1, P2, P3.

Sources externes :

- **Khononov, *Balancing Coupling in Software Design*** — modèle à trois dimensions (Integration Strength, Distance, Volatility) et balance rule.
- **[coupling.dev](https://coupling.dev)** — site de référence de l'auteur.
- **[github.com/vladikk/modularity](https://github.com/vladikk/modularity)** — plugin Claude Code de Khononov implémentant le modèle. *Licence CC BY-NC-SA 4.0 : citation OK, copie verbatim interdite.* Toute référence interne est une **reformulation** avec attribution explicite.

## Contexte

Après livraison des trois specs sœurs, `solution-architect` produit :

```
+-----------------+   +-----------------+   +-----------------+
| ADR-subdomain   |   | bc-canvas       |   | agg-canvas      |
| (Phase 2.5)     |-->| (Phase 5.5)     |-->| (Phase 6)       |
| core/supp/gen   |   | deps in/out     |   | invariants      |
+-----------------+   +-----------------+   +-----------------+
        |                     |                     |
        v                     v                     v
     classifie            structure              encapsule
```

Trois faits architecturaux restent **non typés** :

1. La *force d'intégration* entre deux BC (Intrusive / Functional / Model / Contract) — visible implicitement dans `bc-canvas.outbound_dependencies` mais jamais qualifiée.
2. La *distance* socio-technique entre les unités couplées (même équipe, même lifecycle, même runtime ?) — totalement absente du registre.
3. La *volatilité* dérivée de la classification subdomain (core = haute, supporting = basse, generic = mixte) — connue (ADR-subdomain) mais jamais croisée avec les deux autres dimensions.

Sans croisement explicite, la **balance rule** de Khononov reste implicite :

```
BALANCE = (STRENGTH XOR DISTANCE) OR NOT VOLATILITY
```

Une paire d'intégration *unbalanced* (forte distance + forte strength + forte volatilité) est une dette d'architecture invisible au reviewer actuel. C'est exactement le pattern P2 *Earned Consistency* : une *foi imposée à DISTILL* sur l'absence de couplage toxique.

## Objectifs

1. **Typer chaque paire d'intégration** d'une story par le tuple `(strength, distance, volatility, balanced?)` au moment de DESIGN, pas en post-mortem.
2. **Réutiliser** le bc-canvas et l'ADR-subdomain comme sources de vérité ; ne dupliquer aucune information existante.
3. **Loger l'évaluation** dans un artefact unique par milestone (PANEL pattern Tier-3 sur l'axe paires-d'intégration), pas un slot par bc-canvas qui forcerait la duplication.
4. **Instancier P1 et P2** pour le nouvel artefact.

## Hors périmètre

- **Persona dédié `coupling-architect`.** Évalué et rejeté : marge D4 confortable (`solution-architect` à 372 lignes, projection ~552 après tous les empilements, seuil 800), SoC faible (Khononov est l'auteur des deux corpus DDD strategic et Balanced Coupling — un seul modèle théorique), PREMATURE SPLIT sans données d'usage. La logique vit dans `solution-architect` Phase 5.7 ; la lentille critique vit dans `solution-architect-reviewer` G18.
- **Application post-DELIVER sur le code livré** (analogue à la skill `/modularity:review` de vladikk). Trigger différent (code existant vs spec en cours), output différent (rapport vs canvas). Hors scope DDD canvases ; éventuelle spec future.
- **Refactor automatique des paires *unbalanced*.** Le gate signale, n'impose pas une solution. Le choix (séparer, conformer, ACL, …) reste au designer et passe par la Phase 5 CONTEXT MAP.
- **Migration des designs existants.** Append-forward only.
- **Reformulation exhaustive du modèle Khononov.** La référence asset livre un résumé opératoire (3 dimensions, 4 niveaux de strength, balance rule, severity rubric) ; la lecture complète reste un renvoi à `coupling.dev` et au livre.

## Contenu

### Inputs

- `details/{date}/bc-canvas-{bc-slug}.md` (Phase 5.5, pré-requis spec stratégique) — fournit `outbound_dependencies` et `inbound_dependencies`.
- `docs/adr/adr-{nnn}-subdomain-{bc-slug}.md` (Phase 2.5, pré-requis spec stratégique) — fournit la classification d'où dérive la volatilité.
- `plugins/skills/architecture-patterns/references/balanced-coupling.md` (nouveau, ci-dessous) — fournit le modèle.

### Nouvel artefact (append-only)

- `details/{date}/coupling-matrix-{milestone}.md` — **un seul fichier par milestone**, pas un par BC. Chaque ligne décrit une paire d'intégration `(BC-A, BC-B)` avec :
  - `strength` ∈ `{ intrusive, functional, model, contract }`
  - `distance` ∈ `{ same-aggregate, same-bc, same-service, same-team, cross-team, cross-org }` (échelle socio-technique fractale, voir asset référence)
  - `volatility` ∈ `{ high, low, mixed }` — dérivée mécaniquement de la classification des deux BC (core → high, supporting → low, generic → mixed, mixte → max des deux)
  - `balanced` ∈ `{ true, false }` — calculé via la balance rule
  - `rationale` — phrase courte si `balanced: false`, vide sinon
  - `mitigation_ref` — pointeur vers l'ADR ou l'arête context-map qui modifie la strength si `balanced: false` ; vide sinon

Format YAML frontmatter + tableau markdown ; voir template ci-dessous.

### Nouvelle étape du persona

- **Phase 5.7 BALANCE EVALUATION** entre Phase 5.5 BC CANVAS et Phase 6 EVENT MODELING tactique. Le persona :
  1. Énumère les paires `(BC-A, BC-B)` depuis les `outbound_dependencies` de chaque bc-canvas.
  2. Pour chaque paire, charge lazy `plugins/skills/architecture-patterns/references/balanced-coupling.md` au premier appel.
  3. Renseigne le tuple, applique la balance rule, écrit `coupling-matrix-{milestone}.md`.
  4. Si `balanced: false`, le persona DOIT soit ajouter une arête context-map (Phase 5) avec un pattern de modulation (Conformist, ACL, OHS, Separate Ways …), soit produire une nouvelle ADR qui ratifie l'écart, soit reclasser le subdomain (nouvelle ADR-subdomain). Pas de troisième voie silencieuse.

### Nouveau gate côté reviewer

- **G18 — Balanced Coupling Assessment.** Lens : consistency + fitness. Sévérité : **HIGH** par défaut (P2 : forme, la matrice peut être enrichie sans bloquer la suite). Promu en **BLOCKER** uniquement si le tuple est absent pour une paire d'intégration listée dans un bc-canvas (P2 : information manquante). Check :
  1. Pour chaque paire d'intégration listée dans `outbound_dependencies` des bc-canvas, une ligne existe dans `coupling-matrix-{milestone}.md`.
  2. Pour chaque ligne, les 4 champs `strength`, `distance`, `volatility`, `balanced` sont renseignés.
  3. `balanced` est calculé correctement selon la balance rule (le reviewer recalcule).
  4. Si `balanced: false`, `mitigation_ref` pointe vers une ADR ou une arête context-map existante.

### Nouveau template asset

> **Note emplacement.** Template et référence vivent dans l'arbre **plugin** (`plugins/...`), pas sous `.copilot-tracking/`. Les instances `coupling-matrix-{milestone}.md` sont écrites sous `.copilot-tracking/skraft-plans/{project-slug}/details/{date}/`.
>
> **Slug par milestone (et non par story ou bc).** La matrice est agrégée par milestone (PANEL pattern : un seul reviewer-readable artefact par cycle DESIGN au lieu d'un par paire). Conforme HVE car le fichier reste sous `details/{date}/` ; seule la convention de slug change.

- `plugins/agents/assets/coupling-matrix.template.md` — squelette avec en-tête `<!-- markdownlint-disable-file -->`, frontmatter YAML (`milestone`, `date`, `consistency_matrix_ref`), tableau markdown avec colonnes `(bc_a, bc_b, strength, distance, volatility, balanced, rationale, mitigation_ref)`, et en pied une note rappelant que la lecture complète du modèle est dans la référence balanced-coupling, pas dans le template (anti-LEAKY ABSTRACTION).

### Nouvelle référence asset

- `plugins/skills/architecture-patterns/references/balanced-coupling.md` — **reformulation** du modèle Khononov, ~150 lignes maximum :
  - Les 3 dimensions (définitions courtes + exemple).
  - Les 4 niveaux de strength (Intrusive > Functional > Model > Contract), mappés au coupling classique (Content > Common > External > Control > Stamp > Data).
  - L'échelle de distance (fractale, socio-technique).
  - La dérivation `volatility ← subdomain_classification` (renvoi explicite à la spec stratégique).
  - La balance rule.
  - La severity rubric (Critical / Significant / Minor).
  - Attribution en tête : « Modèle dû à V. Khononov ; ce document est une reformulation opératoire pour usage interne. Source authoritative : *Balancing Coupling in Software Design* + [coupling.dev](https://coupling.dev). Plugin de référence (CC BY-NC-SA 4.0) : [github.com/vladikk/modularity](https://github.com/vladikk/modularity). »

### Compteur de gates

16 → 17 (G1-G16 inchangés, +G18 HIGH/BLOCKER conditionnel). G17 reste réservé à l'appendix optionnel Context Mapping Pattern Catalog (spec stratégique).

## Application des principes

- **P1 — Registre typé.** Une ligne par milestone dans `consistency-matrix.template.md` :
  - `artifact: coupling-matrix-{milestone}.md`
  - `source_of_truth: this`
  - `consumers: [DISTILL, DELIVER]` (DELIVER lit les paires *unbalanced* pour ses choix de packaging / module boundary)
  - `owner: solution-architect`
  - `integration_risk: high` (le tuple résume une dette architecturale ; en cas d'incohérence, le coût est élevé)
  - `validation: G18`
- **P2 — Earned Consistency.** G18 par défaut HIGH (forme : tuple incomplet), promu BLOCKER si paire absente (information manquante). Aucune *silent reconcile* tolérée : Phase 5.7 force soit la mitigation, soit la ratification ADR, soit la reclassification subdomain.
- **P3 — Escalade.** Si G18 émet un BLOCKER, le JSON standard porte `escalation_required: true` ; résolution via fichier-frère `coupling-matrix-{milestone}-resolution.md`.

## Compatibilité avec les conventions Lots 1-2 et specs sœurs

- **Append-only :** `coupling-matrix-{milestone}.md` est écrit une fois par milestone. Si une paire change de tuple en cours de milestone, le persona édite la ligne ; si elle change après clôture du milestone, un nouveau fichier `coupling-matrix-{milestone+1}.md` est écrit. Pas de supersession dédiée (analogue au mécanisme bc-canvas).
- **Header markdown :** le template porte `<!-- markdownlint-disable-file -->`.
- **Pas de duplication :** la classification subdomain reste dans l'ADR-subdomain ; la matrice cite, ne recopie pas. Idem pour les dépendances (lues depuis bc-canvas).

## Décisions à trancher avant phase plan

- **D1 — Échelle de distance.** Six niveaux proposés (`same-aggregate` → `cross-org`). Suffisant pour un projet skraft typique, ou trop fin ? **Recommandation :** garder les six, marquer les deux derniers (`cross-team`, `cross-org`) comme *flag rouge* dans le template (ils déclenchent presque toujours `balanced: false` si strength > contract).
- **D2 — Dérivation volatility ↔ subdomain.** Mécanique (core → high) ou laissée au designer ? **Recommandation :** mécanique au départ pour ancrer la cohérence avec ADR-subdomain ; le designer peut surcharger via un champ `volatility_override` justifié dans `rationale`. Sinon on rouvre la porte à la *silent reconcile* (P2).
- **D3 — Consumer DELIVER.** Quelles décisions DELIVER prend-il sur la base de `coupling-matrix` ? Packaging (projet partagé vs séparé) ? Ports/adapters supplémentaires ? **À investiguer avant phase plan** — sinon `consumers: [DELIVER]` est une *foi imposée* (P2 inversé).
- **D4 — Granularité de la matrice.** Une matrice par milestone (proposé) ou une matrice cumulative par projet ? **Recommandation :** par milestone, alignée avec la cadence DESIGN existante ; une vue cumulative peut être dérivée en lecture seule par un script si besoin.

## Critères d'acceptation de la spec

- [ ] D1, D2, D3, D4 ont une décision écrite.
- [ ] Une revue genesis-architect a confirmé : pas de GOD MODULE (la référence balanced-coupling reste un asset chargé lazy, pas inliné), pas de HIDDEN COUPLING avec bc-canvas (la matrice cite, ne duplique pas), pas de PHANTOM DEPENDENCY (la ligne registry P1 est livrée avec la spec).
- [ ] Une revue licence a confirmé que `balanced-coupling.md` est une reformulation et non une copie verbatim de `github.com/vladikk/modularity` (CC BY-NC-SA 4.0 respectée).
- [ ] Une revue rapide a confirmé qu'aucun gate G18 ne duplique fonctionnellement G14/G15/G16 (subdomain classification, canvas coherence, aggregate invariants).
- [ ] L'auteur a relu Khononov *Balancing Coupling in Software Design* (cure truth #5 manuelle).
