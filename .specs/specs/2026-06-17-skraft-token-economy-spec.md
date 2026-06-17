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

### 2. OUTPUT TAX (output = 3–5× input)

Les phases qui émettent de longs artefacts (software-engineer : code ; acceptance-designer : features ; backlog-planner : stories) sont dominées par l'output. Mandat : **émettre terse**, déléguer la production déterministe aux **ponts outils** (renderer `render-verdict.mjs`, `prefilter.mjs` déjà existants). Les reviewers n'émettent que des **tags JSON** ; le rendu MD est hors-LLM (déjà acté par `reviewer-verdict-schema`).

### 3. MODEL ROUTER (B12) — classe par slot

Lier chaque primitive à sa classe (table ci-dessus). Anti-pattern à surveiller : reviewer **silencieusement promu** planner-class. La résolution classe→modèle concret vit dans l'adaptateur per-harness, pas dans les bodies.

### 4. TOOL SUBSET (B15)

Auditer la frontmatter `tools:` de chaque agent : si une primitive voit >20 outils mais en utilise <5 par appel, réduire le catalogue exposé (il fait partie du prefix, payé chaque tour). L'orchestrateur (`agent, read, edit, execute`) et les reviewers (read-only) sont déjà étroits ; cibler surtout les agents avec MCP large.

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

- `reviewer-prefilter` : levier output/turn sur les reviewers — **déjà couvert**, non dupliqué.
- `reviewer-verdict-schema` : rendu MD hors-LLM — levier output déjà acté.
- skip-DISCOVER : *cost prune* structurel — déjà implémenté.

Cette spec ajoute la couche **manquante** : stance déclarée, model-routing par primitive, audit cache-invalidators, audit tool-surface, et reconnaissance du `depthTier` comme gouverneur de coût.

## Levier futur — pont outil S7 pour `state.json` (genesis §S7 DETERMINISTIC TOOL BRIDGE)

> **Non couvert par ce plan.** À traiter dans une spec/plan dédiée.

### Problème

Aujourd'hui, l'orchestrateur **lit** `state.json` via tool-read (conforme, variable suffix) mais **écrit** `state.json` en émettant le JSON complet par le LLM. Ce pattern est doublement pénalisant :

- **Output tax** : réécrire un fichier JSON de ~50 champs par le LLM paye le taux output (3–5× input).
- **HAND-ROLLED HALLUCINATION** (anti-pattern S7) : le LLM peut légèrement altérer des champs qu'il ne devait pas toucher (drift silencieux sur `phasesCompleted`, `retryCount`, etc.).

### Principe — pont outil S7

Pour toute opération sur `state.json` qui est un **FAIT DEVANT ÊTRE VRAI** (lecture) ou un **EFFET DE BORD CONSÉQUENTIEL** (écriture), la discipline genesis impose de déléguer à un outil déterministe — le LLM décide *quoi* faire, l'outil *exécute*. Le harness SKRAFT dispose de `execute/runInTerminal`, donc n'importe quel CLI disponible dans l'environnement est un substrat valide.

### Catalogue des outils disponibles

| Outil | Usage `state.json` | Disponibilité |
|---|---|---|
| **`jq`** | Lecture de champ précis, mutation chirurgicale (`jq '.currentPhase = "DISCUSS"'`), patch atomique avec `--argjson` | macOS (brew), Linux (apt/yum) — courant |
| **`rg` (ripgrep)** | Scan multi-fichiers pour retrouver l'état le plus récent (recovery) | macOS (brew), Linux — courant |
| **`grep`** | Présent partout ; extraction simple d'une valeur sans `jq` | Universel |
| **`yq`** | Si `state.json` migrait un jour vers YAML, ou pour lire des fichiers de config adjacents | Optionnel |
| **`ast-grep`** | Pour les gates structurels sur le code source (déjà prévu par `reviewer-prefilter`) — pas pertinent pour `state.json` | Optionnel |

### Contrat d'utilisation recommandé

```bash
# Lecture ciblée (remplace tool-read + parse LLM)
jq -r '.currentPhase' state.json

# Avancement de phase (remplace réécriture LLM complète)
jq --arg phase "DISCUSS" '.currentPhase = $phase' state.json > state.tmp && mv state.tmp state.json

# Ajout verdict reviewer (mutation chirurgicale)
jq --arg v "APPROVED" '.reviewerVerdicts.DISCOVER = $v' state.json > state.tmp && mv state.tmp state.json

# Incrément retryCount (arithmétique déterministe)
jq '.retryCount.DISCUSS += 1' state.json > state.tmp && mv state.tmp state.json

# Détection de jq au démarrage (fail-fast si absent — style prefilter)
command -v jq >/dev/null || { echo "jq manquant — opérations state.json dégradées" ; exit 1 ; }
```

### Règle de sélection (conforme S7)

1. Si `jq` est disponible → substrat principal pour toutes les opérations `state.json`.
2. Si `jq` est absent → fallback `grep` pour la lecture uniquement ; les écritures restent LLM (mode dégradé documenté, jamais silencieux).
3. Jamais de détection silencieuse : si l'outil manque, l'agent le signale explicitement avant de continuer en mode dégradé.
