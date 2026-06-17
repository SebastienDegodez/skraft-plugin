# Spec — Économie de tokens SKRAFT (cadre cost-economics genesis)

> **Statut spec :** v1 — design figé (handoff packet genesis, layer coût).

## Cycle de vie de cette spec

Document **de design** produit sous la discipline cost-economics du skill `genesis` (`assets/token-economics.md`, `references/cost-economics-process.md`, `assets/runtime-affordances/model-catalog.md`). **Aucun artefact d'implémentation livré ici.** Le plan associé ([.specs/plans/2026-06-17-skraft-token-economy-plan.md](../plans/2026-06-17-skraft-token-economy-plan.md)) porte les tâches d'audit et d'édition des agents.

## Contexte

Le coût d'un workflow agentique est une **forme décidée au design**, pas un réglage runtime. Six leviers, tous fixés avant exécution : (1) tokens du *prefix* par tour, (2) tokens d'*output* par tour (facturé 3–5× l'input), (3) nombre de tours, (4) fréquence de changement du prefix (cache hit), (5) classe de modèle par rôle, (6) nombre d'outils visibles par tour.

SKRAFT exécute, par story, un pipeline à **5 phases × (agent spécialiste + reviewer adversarial)** + workers DELIVER, piloté par un orchestrateur qui **recharge `state.json` à chaque tour**. C'est un workflow à fan-out (4 lenses par reviewer en `comprehensive`) et multi-étapes : sa **forme de coût** mérite d'être nommée et tenue au design, comme une enveloppe de latence ou de mémoire.

Un effort de réduction est **déjà en cours** : `reviewer-prefilter` (cf. [docs/superpowers/plans/2026-06-04-reviewer-determinism-token-reduction.md](../../docs/superpowers/plans/2026-06-04-reviewer-determinism-token-reduction.md) et le skill `reviewer-prefilter`) sort du LLM les gates mécanisables et ne lui passe que les sections suspectes. **Cette spec ne le duplique pas** : elle l'inscrit comme un levier parmi sept et couvre les primitives non traitées (orchestrateur, agents spécialistes, workers).

## Objectifs

1. Déclarer une **posture de coût** (*stance*) explicite pour le plugin SKRAFT.
2. Attribuer une **classe de rôle** cible à chaque primitive (réduit le sur-provisionnement modèle).
3. Garantir la **discipline de cache** (B13) sur le prefix de chaque agent — c'est le plus gros levier sans compromis qualité.
4. Réduire l'**output tax** : émissions terses, production lourde déléguée à des outils.
5. Maîtriser le **fan-out** et l'**effort** via le `depthTier` existant (B16 / B11).
6. Produire une **projection de coût** qualitative (bands) servant de contrat de validation.

## Hors périmètre

- La logique des reviewers déjà couverte par `reviewer-prefilter` (gates mécanisables).
- Les chiffres $/Mtok absolus : ils vivent en footnote d'un adaptateur per-harness daté, pas ici. La projection reste en **bands** qualitatives.
- Tout changement de la qualité de revue (lenses, poids, scoring d'`adversarial-review-lenses`).

## Posture de coût (stance)

| Stance | Posture | Mandats |
|---|---|---|
| `frugal` | minimiser la dépense, ~15–20 % de risque qualité hors blast-radius | B12 + B15 + B16 déclarés ; GRADIENT préféré aux panels plats dès fan-out ≥ 3 ; classe la moins chère par slot ; switch de modèle en session interdit |
| **`balanced` (retenu par défaut)** | meilleur $/qualité par primitive | **B13 toujours** (plus gros levier, zéro compromis) ; classe par slot ; B14 PROMPT THRIFT en validation |
| `quality` | plafond de capacité, payé | planner-class pour planner/critic ; B14 maintenu |

**Décision : `balanced` par défaut** pour SKRAFT (pipeline de production critique). Bascule `frugal` possible par story via `state.json` si l'opérateur l'exige.

## Inventaire des primitives → classe de rôle cible

| Primitive | Classe de rôle | Justification |
|---|---|---|
| `skraft-orchestrator` | reviewer/trivial (routing) | ne produit **aucun** contenu métier : dispatch, verdicts, état. Jamais planner. |
| `backlog-discoverer` | implementer | triage/recherche structurée, output borné |
| `backlog-planner` | implementer | réécriture en stories, output borné |
| `solution-architect` | planner | raisonnement cross-cutting (Event Modeling, DDD), plans qui survivent à l'exécution |
| `acceptance-designer` | implementer | Gherkin + plan d'impl, gabarit-dirigé |
| `software-engineer` | implementer | TDD outside-in, suit un plan, output borné par l'édit |
| 5× `*-reviewer` | **reviewer** | rubric = prefix cacheable, artefact = suffixe variable ; **jamais promu planner** |
| `mock-integration-worker`, `contract-testing-worker` | implementer/trivial | wiring déterministe |

## Les 7 leviers appliqués à SKRAFT

### 1. CACHEABLE PREFIX / CACHE-AWARE PREFIX (B13) — plus gros levier

Le prefix stable d'un agent = persona/body + skills chargés + instructions + catalogue d'outils. Le **variable** = le tour utilisateur + le dernier résultat d'outil + `state.json`. Règle : tout le stable **avant** le variable.

**Invalidateurs de cache à bannir** (un seul miss/tour ≈ pas de cache du tout) :
- ❌ timestamps / « Current date » dans un body d'agent ou une instruction chargée en prefix ;
- ❌ mutation du catalogue d'outils en cours de session ;
- ❌ switch de modèle en session ;
- ❌ changement d'effort/thinking en session ;
- ❌ édition d'un fichier de règles projet en cours de session.

**Point d'attention orchestrateur :** `state.json` est **variable** et rechargé chaque tour (`// B4: reload state`) — bon pour le grounding, mais il **doit** rester en suffixe, après le prefix stable (instructions `skraft-state`/`skraft-artifacts`, dispatch table). À auditer : qu'aucun body/instruction chargé en prefix ne contienne de date littérale.

**Résultat d'audit B13 (Task 1) — PASS.**

| Axe | Verdict | Détail |
|---|---|---|
| Date littérale en prefix | ✅ 0 | Les 2 occurrences (`triage-{YYYY-MM-DD}.md`, `state.json.corrupted.{timestamp}`) sont des **templates de nom de fichier dynamiques**, évalués au runtime — pas des dates figées dans un body. |
| Mutation du catalogue d'outils en session | ✅ aucune | `tools:` statique en frontmatter sur tous les agents. |
| Switch de modèle en session | ✅ aucun | `model: inherit` sur les **19** agents/lenses/workers. |
| `state.json` en suffixe variable | ✅ conforme | Lu en Phase 0 via tool-read, après le prefix stable (instructions chargées en metadata). |

### 2. OUTPUT TAX (output = 3–5× input)

Les phases qui émettent de longs artefacts (software-engineer : code ; acceptance-designer : features ; backlog-planner : stories) sont dominées par l'output. Mandat : **émettre terse**, déléguer la production déterministe aux **ponts outils**. ⚠️ **Le rendu de verdict hors-LLM est conçu mais pas encore en place** (cf. correction Task 5 ci-dessous) : `render-verdict.mjs` / `prefilter.mjs` sont absents et `adversarial-review-lenses/SKILL.md` impose encore un verdict Markdown LLM. Tant que `reviewer-verdict-schema` n'atterrit pas, les reviewers émettent du Markdown complet et paient l'output tax.

### 3. MODEL ROUTER (B12) — classe par slot

Lier chaque primitive à sa classe (table ci-dessus). Anti-pattern à surveiller : reviewer **silencieusement promu** planner-class. La résolution classe→modèle concret vit dans l'adaptateur per-harness, pas dans les bodies.

**Résultat d'annotation B12 (Task 2) — DONE.** Champ `metadata.cost_role_class` ajouté en frontmatter sur les **19** primitives (commentaire inline `# B12 …`), parse `yq` validé. Distribution : **1 planner** (`solution-architect`), **6 implementer** (`backlog-discoverer`, `backlog-planner`, `acceptance-designer`, `software-engineer`, `contract-testing-worker`, `mock-integration-worker`), **12 reviewer** (5 reviewers de phase + 4 reviewer-lenses + 2 worker fidelity-lenses + l'orchestrateur). Aucun reviewer promu planner. L'annotation est une **cible** ; la résolution classe→modèle reste à l'adaptateur per-harness.

### 4. TOOL SUBSET (B15)

Auditer la frontmatter `tools:` de chaque agent : si une primitive voit >20 outils mais en utilise <5 par appel, réduire le catalogue exposé (il fait partie du prefix, payé chaque tour). L'orchestrateur (`agent, read, edit, execute`) et les reviewers (read-only) sont déjà étroits ; cibler surtout les agents avec MCP large.

**Résultat d'audit B15 (Task 3) — PASS, aucune réduction nécessaire.** Surface d'outils max = **11** (`software-engineer`), sous le seuil de 20. Aucun catalogue MCP large. Distribution : software-engineer 11, acceptance-designer 9, workers 7, agents de phase 4, orchestrateur 4 (liste YAML : `agent`, `read`, `edit`, `execute`), reviewers/lenses 2 (read-only). Surfaces déjà conformes B15.

### 5 & 6. EFFORT GOVERNOR (B16) + FOLD-BY-DEFAULT (B11) via `depthTier`

Le `depthTier` (`basic`/`standard`/`comprehensive`) **est déjà** un gouverneur d'effort : il pilote le nombre de lenses (1/2/4), les seuils de mutation, le gate Gherkin. C'est l'instrument B16/B11 de SKRAFT. Mandat : documenter ce rôle de levier de coût (pas seulement de qualité) et garder `comprehensive` réservé au code critique.

### 7. STRUCTURAL PRUNING (GRADIENT WORKFLOW / COST PRUNE)

Le **skip de DISCOVER sur handoff HVE** (cf. spec sœur) est un *cost prune* structurel : une phase entière (agent + reviewer + retries) supprimée quand HVE a déjà fait le travail. À fan-out ≥ 3, préférer un workflow en gradient (étapes hétérogènes) à un panel plat.

## Projection de coût (bands, contrat de validation)

| Primitive | Classe | Prefix | Output | Tours | Patterns |
|---|---|---|---|---|---|
| orchestrateur | reviewer | M (instructions+dispatch) | S (routing) | high | B13 |
| reviewers (×5) | reviewer | M (rubric cacheable) | S (tags) | low | B13, B16, prefilter |
| software-engineer | implementer | M–L | L (code) | medium | B13, B14, output-delegation |
| solution-architect | planner | L | M | medium | B13 |
| autres agents | implementer | M | M | medium | B13, B14 |

Bands = **contrat** (validés à l'étape 8). La fourchette quantitative ($/tokens) requiert l'adaptateur per-harness daté — hors de cette spec.

## Interlock avec l'existant

> **Correction d'état (audit Task 5).** À la date de cette spec, `reviewer-prefilter` et `reviewer-verdict-schema` sont **conçus mais non implémentés** : ils n'existent que comme plans/specs sous `docs/superpowers/`. Les skills `plugins/skills/reviewer-{prefilter,verdict-schema}/` et les scripts `render-verdict.mjs` / `prefilter.mjs` sont **absents** du dépôt, et `adversarial-review-lenses/SKILL.md` §"Output format" impose **toujours un verdict Markdown complet** émis par le LLM. Le levier output-tax sur les reviewers est donc **en attente d'implémentation**, pas acté.

- `reviewer-prefilter` : levier output/turn sur les reviewers — **conçu (plan `2026-06-04`), non implémenté**. À ne pas dupliquer quand il atterrira.
- `reviewer-verdict-schema` : rendu MD hors-LLM — **conçu (spec `2026-05-26`), non implémenté**. Tant qu'il n'atterrit pas, les reviewers paient l'output tax du Markdown.
- skip-DISCOVER : *cost prune* structurel — **implémenté** (entry-point detection dans `skraft-difficulty-routing` + `skraft-orchestrator` Phase 0).

Cette spec ajoute la couche **manquante** : stance déclarée, model-routing par primitive, audit cache-invalidators, audit tool-surface, et reconnaissance du `depthTier` comme gouverneur de coût.
