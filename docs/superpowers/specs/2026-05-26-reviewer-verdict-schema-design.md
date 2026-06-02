# Spec — Reviewer Verdict Schema (JSON unifié v1)

> **Statut spec :** v3 — corrigée après itération 2 de revue adversariale.

## Cycle de vie de cette spec

Document **de design** produit par le skill `brainstorming`. **Aucun artefact d'implémentation n'est livré ici** : ni `SKILL.md`, ni `render-verdict.mjs`, ni modifications de fichiers d'agents. Ils suivront en phase `writing-plans` puis exécution, après gate utilisateur. Toute remarque de type « le skill/script n'existe pas » est attendue à ce stade — la spec décrit ce qui sera créé.

## Contexte

Les 5 reviewers de `skraft-plugin` (`software-engineer-reviewer`, `solution-architect-reviewer`, `acceptance-designer-reviewer`, `backlog-planner-reviewer`, `backlog-discoverer-reviewer`) chargent tous le skill `adversarial-review-lenses` (4 lenses fixes + scoring pondéré + verdict APPROVED/NEEDS_REWORK/REJECTED) mais émettent ce verdict dans **5 formats divergents** :

- `software-engineer-reviewer` → JSON inline avec un vocabulaire ad-hoc.
- 4 autres → YAML inline, shapes de findings différentes, clés top-level qui varient.
- `backlog-discoverer-reviewer` mélange deux enums (`approved|changes_requested|rejected` minuscule vs `APPROVED|NEEDS_REWORK|REJECTED` majuscule) — bug.

L'orchestrateur lit ensuite `state.json::reviewerVerdicts[phase]` comme une **chaîne enum** : `"APPROVED" | "NEEDS_REWORK" | "REJECTED" | null`.

Cette spec définit un **schéma JSON v1 unifié** qui sert de **couche de persistance/transport** pour le process déjà défini par `adversarial-review-lenses`. Aucune des règles du skill (4 lenses, poids, scoring) ne change ; seule la sortie devient JSON et le rendu MD devient déterministe.

**Breaking change assumé.** Pas de couche de compat YAML→JSON. Les anciens fichiers sur disque restent en place mais les nouveaux verdicts utilisent exclusivement le schéma v1.

## Objectifs

1. **Format JSON unique** parseable, validé par le script de rendu (source de vérité unique — pas de schéma indépendant qui dérive).
2. **Réconcilier** avec `adversarial-review-lenses` (lens names, tags, scoring) au lieu de proposer un vocabulaire concurrent.
3. **Findings homogènes** avec shape stricte ET escape hatch `extras` pour les champs domaine spécifiques (`story`, `criterion`, `ac`, `dor_item`, `antipattern`, etc.).
4. **Gates explicites** : `pass | failed | skipped` — `skipped` **doit** porter une `reason`.
5. **Token-efficient** : reviewer émet **uniquement** le JSON ; **orchestrateur** rend le MD via le script (les reviewers n'ont pas `execute`).
6. **Distribuable** : packagé dans un skill `reviewer-verdict-schema` consommable.

## Hors périmètre

- Migration des verdicts historiques sur disque.
- Modification des lens names, poids, ou algorithme de scoring dans `adversarial-review-lenses` (seule sa §"Output format" est remplacée).
- Externalisation vers `hve-core` (rule of three non atteinte — cf. Genesis 3.5).
- Changement du **schéma** de `state.json::reviewerVerdicts` : reste une string enum. **En scope** en revanche : la **logique** de l'orchestrateur qui peuple ce slot (cf. § Changements requis dans l'orchestrateur).

## Capacité d'écriture des reviewers (clarification)

Les reviewers actuels écrivent déjà des fichiers `.md` sur disque aujourd'hui — c'est l'instruction explicite de `adversarial-review-lenses` (« Write the review under `reviews/{date}/{phase}-{slug}-review.md` »). **Le présent design ne change pas la capacité d'écriture, seulement le format du fichier écrit** (JSON au lieu de Markdown).

### Checklist d'audit tâche #0 (B2/M5)

Avant toute migration, exécuter pour chacun des 5 reviewers :

- [ ] **Inspecter la frontmatter `tools:`** — confirmer la présence du grant d'écriture utilisé (typiquement `edit` ; sinon documenter quel mécanisme permet l'écriture MD aujourd'hui).
- [ ] **Test fumée d'écriture** — dispatcher le reviewer avec un brief minimal lui demandant d'écrire un fichier JSON jouet dans `.copilot-tracking/skraft-plans/test/reviews/2026-05-26/discover-review-1.json`. Confirmer la création du fichier.
- [ ] **Test fumée de lecture orchestrateur** — depuis l'orchestrateur, lire ce même fichier avec `read` ; confirmer le succès.
- [ ] **Critère d'arrêt** — si un reviewer n'a ni le grant ni la capacité effective, **STOP migration** : c'est un bug pré-existant à corriger d'abord (ajouter `edit` à la frontmatter du reviewer concerné). Documenté dans le journal de migration.

Le résultat de l'audit est consigné dans `docs/superpowers/journal/` avec la liste des 5 reviewers et le statut OK/KO de chaque case.

## Réconciliation avec `adversarial-review-lenses` (B1 résolu)

Le skill `adversarial-review-lenses` reste la **source de vérité du process** :
- Les 4 lenses fixes (Completeness / Business Fit / Quality / Risk) et leurs poids `0.30 / 0.30 / 0.15 / 0.25`.
- Les tags de findings : `MISSING | THIN | MISALIGNED | AMBIGUOUS | BROKEN | INCONSISTENT | INVARIANT_VIOLATION | HIDDEN_COUPLING | AMBIGUOUS_ASSUMPTION | OK`.
- L'algorithme de calcul `score → status`.

Le présent skill `reviewer-verdict-schema` ajoute la **couche transport** : encodage JSON + rendu MD. Modification dans `adversarial-review-lenses/SKILL.md` :
- La section §"Output format" (template Markdown actuel) est remplacée par : *"Voir le skill `reviewer-verdict-schema` pour le format de sortie JSON v1 et le rendu MD."*
- Tout le reste du skill (process, lenses, scoring) reste intact.

## Changements requis dans l'orchestrateur

Les reviewers n'ont pas le tool `execute` (vérifié). L'orchestrateur l'a (`tools: agent, read, edit, execute`). C'est l'orchestrateur qui rend le MD et qui peuple `state.json`.

### Convention de chemin (B1 — path derivation)

Le chemin du verdict est **entièrement déterministe** — ni glob, ni scan, ni polling :

```
.copilot-tracking/skraft-plans/{project_slug}/reviews/{YYYY-MM-DD}/{phase}-review-{N}.json
```

où :
- `{project_slug}` = `state.json::projectSlug`.
- `{YYYY-MM-DD}` = date locale au moment du dispatch reviewer, stockée par l'orchestrateur dans `state.currentReviewDate` avant dispatch.
- `{phase}` = phase courante en MAJUSCULES (`DISCOVER`/`DISCUSS`/...).
- `{N}` = `state.json::retryCount[phase] + 1` (1-based).

L'orchestrateur **construit** ce chemin, le passe au reviewer dans le brief de dispatch (« écris ton verdict à ce chemin exact »), puis **lit** le même chemin pour les Steps 3.5/3.6. Le reviewer n'invente jamais le chemin.

### Workflow post-reviewer (à insérer dans `skraft-orchestrator.agent.md`)

1. Reviewer dispatché avec le chemin cible → émet et écrit `.../reviews/{date}/{phase}-review-{N}.json`.
2. **Step 3.5 — Render verdict** : orchestrateur exécute
   ```bash
   node plugins/skills/reviewer-verdict-schema/scripts/render-verdict.mjs \
        --input <verdict.json> --output <verdict.md>
   ```
   Si le fichier d'entrée est absent après le retour du reviewer → phase en erreur, pas de retry implicite.
3. **Step 3.6 — Validate status enum (portée réduite — B4)** :
   1. Parse `JSON.parse(content)` ; échec → phase en erreur.
   2. Extraire `payload.status` ; absent → phase en erreur.
   3. Comparer **strictement** (case-sensitive) à `{APPROVED, NEEDS_REWORK, REJECTED}`.
   4. Toute autre validation de schéma (champs requis, types, gates, lenses, weighted_score) est **déjà** assurée par `render-verdict.mjs` au Step 3.5. Si Step 3.5 a réussi (exit 0), Step 3.6 ne re-valide que `status`.
4. **Step 4 — Update state** : si Step 3.5 exit 0 ET Step 3.6 OK → écrit `state.json::reviewerVerdicts[phase] = payload.status`. Sinon → `reviewerVerdicts[phase] = null`, phase non avancée, message d'erreur clair.

Ce workflow est ajouté à `skraft-orchestrator.agent.md` en tâche #11 de migration. Les reminders Option C dans les reviewers décrivent **uniquement** l'émission JSON, jamais une commande shell.

## Décisions actées (11)

1. **Format** : JSON.
2. **Clé top-level** : `status` (enum `APPROVED|NEEDS_REWORK|REJECTED`).
3. **Findings** : shape stricte `{lens, tag, artefact, location?, description, extras?}` — `extras` libre pour champs domaine.
4. **Gates** : `{status: pass|failed|skipped, reason?}` — `skipped` **exige** `reason` (validé par le script).
5. **Lens names fixes** : `Completeness | Business Fit | Quality | Risk` — alignés sur `adversarial-review-lenses`.
6. **Tags** : enum aligné sur `adversarial-review-lenses` (cf. ci-dessus).
7. **Rendu** : reviewer émet JSON ; orchestrateur rend le MD post-écriture.
8. **Runtime** : Node ESM natif `*.mjs`, template literals, **zéro dépendance npm**.
9. **Source de vérité** : le **script** est l'autorité de validation. La référence MD dans `SKILL.md` documente le schéma humainement ; **aucun fichier JSON Schema séparé** (élimine la dérive — B4 résolu).
10. **Persistance dual** : `{phase}-review-{N}.json` (canonique) + `{phase}-review-{N}.md` (rendu).
11. **Ordre de migration** : `backlog-discoverer-reviewer` en premier (corrige enum), puis les 3 YAML, puis `software-engineer-reviewer`.

## Schéma JSON v1 — référence

Décrit en Markdown ; **validation effective dans `scripts/render-verdict.mjs`**.

### Racine

| Champ | Type | Requis | Notes |
|---|---|---|---|
| `$schema` | string const `"verdict-v1"` | ✅ | Versionnage explicite. |
| `phase` | enum `DISCOVER\|DISCUSS\|DESIGN\|DISTILL\|DELIVER` | ✅ | |
| `reviewer` | string | ✅ | Nom de l'agent. |
| `iteration` | integer ≥ 1 | ✅ | `= state.retryCount[phase] + 1` (n3 résolu). |
| `timestamp` | string ISO-8601 | ✅ | Validé manuellement par regex dans le script (n1). |
| `project_slug` | string | ✅ | |
| `depth_tier` | enum `basic\|standard\|comprehensive\|custom` | ✅ | Issu de `userPreferences.depthTier`. |
| `lenses_executed` | integer 1..4 | ✅ | **Requis** (B3 — 0 dérivation tacite sur du persisté). Doit `== lens_results.length`. Le script vérifie l'égalité et refuse la divergence. |
| `weighted_score` | number 0..1 | ✅ | Calculé selon les poids du skill. |
| `status` | enum `APPROVED\|NEEDS_REWORK\|REJECTED` | ✅ | |
| `artefacts_reviewed` | string[] | ✅ | Chemins relatifs. |
| `gates` | object `{ G1: GateEntry, G2: ..., ... }` | ✅ | Clés `^G[0-9]+$`. Peut être `{}` si la phase n'a pas de gates explicites. |
| `lens_results` | LensResult[] | ✅ | `length == lenses_executed`. |
| `synthesis` | Synthesis | ✅ | |
| `dissent` | string | ✅ | **String pour v1**. **Règle** : non-vide ⇔ au moins une lens diverge de la conclusion globale (analyse minoritaire à enregistrer) ; chaîne vide `""` ⇔ unanime. Objet structuré réservé pour v2. |

`additionalProperties: false` **au niveau racine**.

### `GateEntry`

| Champ | Type | Requis | Notes |
|---|---|---|---|
| `status` | enum `pass\|failed\|skipped` | ✅ | |
| `reason` | string | conditionnel | **Requis** si `status == "skipped"`. **Autorisé** si `status == "failed"`. **Autorisé mais ignoré** si `status == "pass"` (n6 — rule assouplie). |

### `LensResult`

| Champ | Type | Requis | Notes |
|---|---|---|---|
| `lens` | enum `Completeness\|Business Fit\|Quality\|Risk` | ✅ | |
| `score` | enum number `0 \| 0.5 \| 1` | ✅ | Per-lens score du skill. |
| `findings` | Finding[] | ✅ | Vide `[]` si lens 100% OK. |

### `Finding`

| Champ | Type | Requis | Notes |
|---|---|---|---|
| `tag` | enum `MISSING\|THIN\|MISALIGNED\|AMBIGUOUS\|BROKEN\|INCONSISTENT\|INVARIANT_VIOLATION\|HIDDEN_COUPLING\|AMBIGUOUS_ASSUMPTION\|OK` | ✅ | Aligné sur `adversarial-review-lenses`. |
| `artefact` | string | ✅ | Chemin ou identifiant. |
| `location` | string | ❌ | Ligne, ancre, ID. |
| `description` | string | ✅ | Échappée par le rendu (cf. § Escaping). |
| `extras` | object | ❌ | **Escape hatch** (B2 résolu) : `{ story?, criterion?, ac?, dor_item?, antipattern?, ... }`. Le script ignore le contenu pour le rendu mais le préserve dans le JSON. |

### `Synthesis`

| Champ | Type | Requis | Notes |
|---|---|---|---|
| `headline` | string | ✅ | 1 phrase. |
| `blocking_findings` | string[] | ✅ | IDs ou descriptions des findings bloquantes. |
| `next_actions` | string[] | ✅ | Vide si `APPROVED`. |
| `dominant_lens` | enum lens | ❌ | Lens qui a le plus pesé. |

### Règles de cohérence inter-champs (validées par le script)

- `status == "APPROVED"` ⇒ aucune finding `INVARIANT_VIOLATION` et toutes `gates[*].status ∈ {pass, skipped}`.
- `status == "REJECTED"` ⇒ ≥1 finding `INVARIANT_VIOLATION` **ou** ≥1 lens avec `score == 0`.
- `weighted_score` recalculé par le script à partir des `lens_results[*].score` et comparé à la valeur émise (tolérance `±0.01`).
- `lenses_executed == lens_results.length` (strict).
- `dissent != ""` ssi la lens minoritaire **aurait suffi à inverser le verdict** dans un scénario de re-pondération raisonnable (M1) — typiquement : un `score == 0` sur une lens à poids ≥ 0.25 que l'analyse minoritaire conteste, ou un écart de classe de status (APPROVED vs NEEDS_REWORK) si la lens divergente avait pesé davantage. Une divergence bénigne (e.g. lens à 0.5 quand les 3 autres sont à 1.0 et le status reste APPROVED) n'est **pas** un dissent : laisser `""`. La règle est appliquée par le reviewer, pas validée par le script (jugement humain).

### Gates vs Findings — clarification

Les **gates** (`G1..GN`, bloc top-level `gates`) sont les **critères de phase** définis par les skills `*-review-criteria` (ex. : DoR à 8 points pour `backlog-planner`, lenses à 9 points pour `solution-architect`). Ils ont un `status` binaire et un éventuel `reason`.

Les **findings** (à l'intérieur de `lens_results[*].findings[]`) sont les **observations individuelles** issues du process `adversarial-review-lenses`, taguées (MISSING, THIN, …) et reliées à un artefact précis.

Un même problème peut alimenter les deux : un gate `G2: failed` peut être expliqué par une finding `MISSING` dans la lens Completeness. Le mapping (gate ↔ finding) est conservé dans `synthesis.blocking_findings` (références croisées par description ou ID).

## Script `render-verdict.mjs`

### Contrat CLI

```
node render-verdict.mjs --input <path.json|-> [--output <path.md>] [--validate-only] [--help]
```

- `--input` : chemin ou `-` (stdin).
- `--output` : si omis, MD sur stdout.
- `--validate-only` : pas de rendu, exit 0 si valide, exit 1 sinon.
- `--help` : usage.
- **Exit codes** (simplifié n6+anti-overengineering) : `0` ok / `1` erreur (type sur stderr).
- **Shebang** : `#!/usr/bin/env node` ; check `process.versions.node >= 20`.

### Validation (le script EST le schéma — B4 résolu)

1. Présence des champs `required`.
2. Enums (`status`, `tag`, `lens`, `phase`, `depth_tier`, gate.status).
3. ISO-8601 regex sur `timestamp` (M2). Pattern :
   ```
   ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$
   ```
   Refuse les fractions de secondes et les timezones abrégées — force un format canonique unique.
4. `gates[*]`: `skipped ⇒ reason` ; pattern de clé `^G[0-9]+$`.
5. `lens_results.length == lenses_executed`.
6. Recalcul de `weighted_score`.
7. Règles de cohérence inter-champs.

Aucune lib externe. La complexité est bornée : ~150–250 LoC. Source de vérité unique.

### Rendu MD (template literals)

Structure produite (réplique le template historique de `adversarial-review-lenses` pour minimiser le diff utilisateur) :

```markdown
<!-- markdownlint-disable-file -->

# {Phase} Review — {project_slug}

**Verdict:** APPROVED | NEEDS_REWORK | REJECTED
**Depth tier:** ...
**Lenses executed:** N
**Weighted score:** 0.XX
**Iteration:** N
**Reviewed artifacts:** ...

## Gates
| Gate | Status | Reason |
| --- | --- | --- |
| G1 | pass | — |
| G2 | skipped | not applicable to tier `basic` |

## Lens 1 — Completeness (score: 1.0)
- [MISSING] {artefact} — {description}
- ...

(idem Lens 2/3/4)

## Synthesis
{headline}

### Blocking findings
- ...

### Required actions before next attempt
- ... (omis si APPROVED)

## Dissent
{dissent string ou "Unanimous."}

---
*Generated from* `{phase}-review-{N}.json` *at* `{timestamp}`.
```

### Escaping — pipeline en deux étages

**Étage 1 — JSON (responsabilité du reviewer)** : émettre du JSON valide selon RFC 8259. Quotes, backslashes, control chars échappés normalement. Le script échoue la validation si `JSON.parse()` lève.

**Étage 2 — Markdown (responsabilité du script, lors du rendu)** : pour toute valeur insérée dans une table Markdown ou un bullet :
- Remplacer `|` → `\|`.
- Remplacer `\n` ou `\r\n` → `<br>`.
- Strip whitespace de début/fin.
- Refuser triple-backtick dans `description` (validation KO avec message clair, **avant** le rendu).
- Hard cap `description` à 500 chars, suffixe `…` si tronqué.

Les deux étages sont indépendants : JSON valide n'implique pas MD safe, et inversement. C'est pour ça que le script valide les deux.

## Skill `reviewer-verdict-schema`

### Layout (canonique Genesis — M6 résolu)

```
plugins/skills/reviewer-verdict-schema/
├── SKILL.md                              # ≤500 lignes, ≤5000 tokens
├── scripts/
│   └── render-verdict.mjs                # Node ESM, --help, validation + rendu
├── assets/
│   ├── examples/
│   │   ├── verdict-approved.json
│   │   ├── verdict-needs-rework.json
│   │   ├── verdict-rejected.json
│   │   ├── verdict-with-dissent.json     # ajouté (Missing concerns)
│   │   └── verdict-with-escaping-edge-cases.json  # M3 — description avec |, \n, triple-backtick refusé
│   └── reference/
│       └── schema-v1.md                  # référence humaine du schéma (extrait condensé de cette spec)
└── references/
    └── render-internals.md               # load-on-demand : structure du template MD
```

Pas de dossier `schemas/` séparé — la référence vit dans `assets/reference/` et l'autorité de validation est `scripts/render-verdict.mjs`.

### SKILL.md (contenu attendu)

- **name** : `reviewer-verdict-schema`
- **description** (impératif, indirect-triggers) :
  > Use when authoring or persisting a reviewer verdict for any skraft phase. Defines the JSON v1 schema, the gates/findings shape, and the deterministic Node renderer that turns the JSON into the canonical `.md` artefact. The reviewer emits the JSON; the orchestrator runs the renderer.
- Contrat d'invocation (cf. § Script).
- Lien vers `assets/reference/schema-v1.md` (référence humaine).
- Mapping explicite **tag historique → champ JSON** pour les 5 reviewers (cf. § Migration).

## Modification des agents reviewers — Option C (FIABLE)

Pour chaque reviewer, **deux changements** :

1. **Bloc skill-loading** : ajouter `[reviewer-verdict-schema](../skills/reviewer-verdict-schema/SKILL.md)` à la liste MANDATORY.
2. **Bloc Output format** : remplacer l'intégralité par :

```markdown
## Output Format

Voir [`reviewer-verdict-schema`](../skills/reviewer-verdict-schema/SKILL.md) — JSON v1, shape, persistance.

**Rappel — verdict JSON v1** :
- Top-level : `$schema`, `phase`, `reviewer`, `iteration`, `timestamp`, `project_slug`, `depth_tier`, `lenses_executed`, `weighted_score`, `status`, `artefacts_reviewed`, `gates`, `lens_results`, `synthesis`, `dissent`.
- `status` : `APPROVED` | `NEEDS_REWORK` | `REJECTED` (MAJUSCULES).
- `gates[GN]` : `{status: pass|failed|skipped, reason?}` — `skipped` **exige** `reason`.
- `lens_results[*]` : `{lens, score, findings[]}` ; lenses fixes `Completeness | Business Fit | Quality | Risk`.
- `findings[*]` : `{tag, artefact, location?, description, extras?}` ; `extras` libre pour champs domaine.
- **N'écrire QUE le JSON.** Le rendu `.md` est produit par l'orchestrateur via `render-verdict.mjs`.
```

Aucune commande shell dans le reminder (les reviewers n'ont pas `execute`).

### Cas particulier `backlog-discoverer-reviewer` (M4)

Profite du passage pour **supprimer le bug d'enum**. Note pour le migrateur : `changes_requested` (ancien) ≠ `NEEDS_REWORK` (nouveau) — ce n'est pas qu'une question de casse, c'est un vrai changement de vocabulaire. Documenté dans le PR de migration.

### Exemple concret BEFORE/AFTER (backlog-discoverer-reviewer)

**Avant** (YAML inline, casse incohérente, gates et findings mélangés) :
```yaml
verdict: changes_requested  # bug: casse + vocabulaire
confidence: medium
gates:
  G1: pass
  G2: fail  # P0 issue non triée
findings:
  - story: 'P0-issue-123'
    detail: 'Issue critique absente du triage'
```

**Après** (JSON v1) :
```json
{
  "$schema": "verdict-v1",
  "phase": "DISCOVER",
  "reviewer": "backlog-discoverer-reviewer",
  "iteration": 1,
  "timestamp": "2026-05-26T10:30:00Z",
  "project_slug": "meetup-coding-with-ai",
  "depth_tier": "standard",
  "weighted_score": 0.65,
  "status": "NEEDS_REWORK",
  "artefacts_reviewed": ["docs/triage/triage-report.md"],
  "gates": {
    "G1": { "status": "pass" },
    "G2": { "status": "failed", "reason": "P0 issue #123 absente du triage" }
  },
  "lens_results": [
    {
      "lens": "Completeness",
      "score": 0.5,
      "findings": [
        {
          "tag": "MISSING",
          "artefact": "docs/triage/triage-report.md",
          "description": "Issue P0-123 critique absente du rapport de triage",
          "extras": { "story_id": "P0-issue-123", "priority": "P0" }
        }
      ]
    }
  ],
  "synthesis": {
    "headline": "Triage incomplet : P0 manquante",
    "blocking_findings": ["Issue P0-123 absente"],
    "next_actions": ["Inclure P0-123 et requalifier les priorités"],
    "dominant_lens": "Completeness"
  },
  "dissent": ""
}
```

Un mapping équivalent (gate fail → finding `MISSING` + champs domaine dans `extras`) sera produit pour chacun des 4 autres reviewers en phase `writing-plans`.

## Différenciation vs nWave-o (axe 5 corrigé — n4)

| Axe | skraft v1 | nWave-o (référence externe, non audité) |
|---|---|---|
| 1. Format de transport | JSON | YAML |
| 2. Persistance | `.json` + `.md` jumeaux | Fichier MD unique |
| 3. Structure lenses | `lens_results[]` (array, ordre fixe) | `lenses:` (dict) |
| 4. Gates | Bloc `gates: {GN: {status, reason?}}` explicite | Pas de bloc gates dédié |
| 5. Tags de findings | Vocabulaire fixe partagé avec `adversarial-review-lenses` | Vocabulaire différent (cf. nWave-o) |
| 6. Process scoring | `score ∈ {0, 0.5, 1}` per-lens, somme pondérée, mapping `>=0.85/>=0.55/<0.55` | Algorithme distinct (cf. nWave-o) |
| 7. Dissent | Champ `dissent` first-class | Non documenté |

Différenciation structurelle confirmée.

## Plan de migration

| # | Action | Effort |
|---|---|---|
| 0 | **Audit préalable** : (a) confirmer que les 5 reviewers ont la capacité d'écrire des fichiers (puisqu'ils écrivent déjà du MD aujourd'hui via `adversarial-review-lenses`) ; (b) marquer explicitement le bug enum `backlog-discoverer-reviewer` comme à corriger en tâche 4 | XS |
| 1 | Créer le skill `reviewer-verdict-schema` (SKILL.md, script, 4 examples dont `verdict-with-dissent.json`, référence) | M |
| 2 | Modifier `adversarial-review-lenses/SKILL.md` : §"Output format" → cross-réf au nouveau skill | XS |
| 3 | Tests scripts : `--validate-only` sur 4 fixtures (3 OK + 1 malformée par fixture cassée volontaire) | S |
| 4 | Migrer `backlog-discoverer-reviewer` (corrige enum lowercase→uppercase + `changes_requested`→`NEEDS_REWORK`) | S |
| 5 | Migrer `backlog-planner-reviewer` (mapping `story/criterion/ac/dor_item/antipattern` → `extras`) | S |
| 6 | Migrer `acceptance-designer-reviewer` (mapping `finding` → `description`) | S |
| 7 | Migrer `solution-architect-reviewer` (mapping `confidence` top-level → `synthesis.headline` ou drop) | S |
| 8 | Migrer `software-engineer-reviewer` (alignement de surface, drop `lens_results.verdict: pass/fail` au profit du `score` numérique) | S |
| 9 | Auditer les 4 skills `*-review-criteria` (acceptance, planning, discovery, architecture) — pas de modification fonctionnelle attendue, juste vérifier qu'ils ne référencent pas l'ancien format en exemple (M3) | XS |
| 10 | Mettre à jour `plugins/collections/*.yml` (ou équivalent skraft) si présent — ajouter le nouveau skill (Missing concerns) | XS |
| 11 | Mettre à jour la doc `skraft-orchestrator.agent.md` : décrire le post-step `render-verdict.mjs` et l'extraction `payload.status` (M2) | S |
| 12 | Mettre à jour `docs/agents/*.md` et `docs/architecture.md` si décrivent l'ancien format | XS |

## Plan d'évaluation

- **E1 — Validation script** : sur chacun des 4 examples, `--validate-only` → exit 0. Sur 4 fixtures cassées (1 par règle critique : `skipped` sans `reason`, tag inconnu, lens inconnue, `lenses_executed` ≠ `lens_results.length`) → exit 1 avec message clair.
- **E2 — Rendu déterministe** : même JSON → même MD (sha256 identique entre 2 runs).
- **E3 — Round-trip par reviewer** : pour chaque reviewer migré, un fixture artefact en entrée → JSON émis → script rend MD → relecture humaine conforme.
- **E4 — Bug enum** : un payload mélangeant `approved` minuscule + `APPROVED` majuscule → rejeté à la validation.
- **E5 — Recalcul** : payload avec `weighted_score` faux → rejeté (tolérance `±0.01`).
- **E6 — Escaping** : description contenant `|`, `\n`, triple-backtick → soit échappée correctement, soit rejetée avec message (selon la règle).
- **E7 — Intégration orchestrateur** *(out of skill scope, integration test)* : orchestrateur lit `payload.status` et écrit `state.json::reviewerVerdicts[phase]` correctement.

## Champs abandonnés dans la transition (M4)

- `confidence: high|medium|low` (présent dans `backlog-discoverer-reviewer` aujourd'hui) : **drop volontaire** en v1. Le signal est déjà capté par `weighted_score` (numérique, plus fin) et le mapping `status`. Si un besoin d'audit dur ressort après rollout, réintroduire en v1.x comme `confidence: 0..1` optionnel sans breaking.

## Questions ouvertes

- **Confidence numérique** : réintroduction ? Voir § ci-dessus.
- **Dissent objet** : aujourd'hui string. Upgrade vers objet `{minority_findings, weight_rationale, override_applied}` quand le signal montre que la dissidence est fréquente. **v2 envisageable, pas v1**.
- **Commentaire GitHub formaté** : un second renderer `render-verdict-github.mjs` consommant le même JSON ? **Hors v1**, mais le découplage JSON↔renderer le permet sans refonte.

## Critères de réussite

- Les 5 reviewers émettent du JSON conforme au schéma v1, validé par le script.
- Le bug d'enum `backlog-discoverer-reviewer` disparaît.
- `adversarial-review-lenses/SKILL.md` n'a plus de template d'output Markdown — uniquement une cross-réf.
- Le rendu MD est produit par l'orchestrateur, jamais par les reviewers (pas d'`execute` requis pour eux).
- L'orchestrateur copie `payload.status` dans `state.json::reviewerVerdicts[phase]` sans changement de code (le mapping est trivial).
- Zéro dépendance npm dans le skill.
