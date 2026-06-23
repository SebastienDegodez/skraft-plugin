# Reviewer Determinism & Token Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Augmenter le déterminisme des 5 reviewers SKRAFT et réduire les tokens input/output en sortant du LLM tout gate mécanisable (`grep`/`ls`/`exists?`), en ne lui laissant que le jugement sémantique, et en ne lui passant que les sections suspectes via un pré-filtre déterministe.

**Architecture :** On capitalise sur le skill `reviewer-verdict-schema` existant (renderer Node ESM `render-verdict.mjs`, tags JSON déjà en place). On ajoute un skill `reviewer-prefilter` dont le **moteur structurel est ast-grep natif** : un `sgconfig.yml` + des `rules/*.yml` déclaratifs, exécutés par `ast-grep scan --json` qui agrège **lui-même** tous les findings AST en un seul JSON. Les gates non-AST (existence de fichiers, cross-ref markdown, filenames) sont traités par une **glue mince unique** `prefilter.mjs` qui : (a) impose ast-grep (fail-fast), (b) lance `ast-grep scan --json`, (c) ajoute les quelques vérifications filesystem/markdown, (d) agrège le tout en `prefilter-report.json` et le passe au `render-verdict.mjs` existant. Le LLM ne reçoit que les gates **sémantiques** restants sur les **sections suspectes**, et n'émet que des tags. Calcul du score et rendu Markdown restent hors-LLM. Pas de couche de compat : breaking change du contrat reviewer.

**Tech Stack :** **ast-grep** (`@ast-grep/cli`) — moteur AST tree-sitter **obligatoire**, piloté par `sgconfig.yml` + rule-sets YAML, multi-langages (C#, Java, Kotlin, TS, Python). Node ESM ≥ 20 uniquement pour la **glue d'agrégation** et les tests (`node:test`/`node:assert`) — c'est le runtime **déjà requis** par `render-verdict.mjs`, donc aucune nouvelle dépendance runtime. JSON natif, Markdown, YAML frontmatter.

**Décision de dépendance (ADR à produire) :** ast-grep est une **dépendance dure et obligatoire** du skill `reviewer-prefilter` — **pas de fallback**. Justification : la précision AST (zéro faux positif sur commentaires/strings), le déclaratif YAML maintenable, l'agrégation JSON native, et l'alignement **stack-agnostic** (cf. `resolving-stack-commands`). **Comportement si ast-grep absent du PATH : `prefilter.mjs` s'arrête en erreur (exit ≠ 0)** — jamais de dégradation silencieuse, jamais de faux PASS, jamais de bascule vers le LLM. Un fallback rendrait le verdict dépendant de l'environnement et casserait le déterminisme. L'install (`npm i -g @ast-grep/cli` ou `brew install ast-grep`) est un pré-requis documenté du skill.

**Spec source :** À rédiger (`docs/superpowers/specs/2026-06-04-reviewer-determinism-design.md`) — voir Task 0.

**Branche de travail :** `feat/hve-compatibility`.

---

## Classification des gates (fondement du plan)

Avant tout code, ce plan repose sur un tri formel de chaque gate selon qu'il est **mécanisable** (décidable par script, zéro LLM) ou **sémantique** (exige le jugement du modèle). Source : [plugins/skills/architecture-review-criteria/SKILL.md](../../../plugins/skills/architecture-review-criteria/SKILL.md).

| Gate | Nature | Mécanisme déterministe possible | Moteur |
|---|---|---|---|
| G1 | Mécanisable | rule ast-grep : nœud AST de **type** référence/implémente un port `CommandBus`/`QueryBus`/`EventStore`/`Saga` (par résolution de type, pas par nom) → cross-check ADR `Accepted` | **ast-grep** |
| G2 | Mécanisable | cross-ref `**Supersedes:**` ↔ rows `docs/adr/supersessions.md` (markdown, pas AST) | Node-texte |
| G3 | Mécanisable | rule ast-grep : nœud `import`/`using` ciblant un module Infra/API, `inside` un fichier dont le **chemin** appartient à la couche Domain/Application | **ast-grep** |
| G4 | Mécanisable | rule ast-grep : nœud `interface_declaration` (peu importe le nom) `inside` un fichier dont le **chemin** est hors Application — couche résolue par path/module, **jamais** par préfixe `I*` | **ast-grep** |
| G5 | Mixte | **AST** : champ d'un agrégat dont le **type déclaré** est un autre agrégat (référence objet) au lieu d'un type ID (ast-grep) ; **LLM** : « l'agrégat enforce ses propres invariants » | ast-grep + LLM |
| G6 | **Sémantique** | admissibilité des labels context-map (Conformist vs OHS/PL) | LLM |
| G7 | Mécanisable | mapping story-id → trigger présent dans event model | Node-texte |
| G8 | Mécanisable | chaque Command a ≥1 domain event | Node-texte |
| G9 | **Sémantique** | justification YAGNI d'un élément architectural | LLM |
| G10 | Mécanisable | existence `consistency-matrix-{story}.md` + ligne `PASS` | Node-FS |
| G11 | **Sémantique** | admissibilité d'une force + alternative "do without" | LLM |
| G12 | Mécanisable | réalisation des rows `supersession-plan` (3 conditions) | Node-texte |
| G13 | Mécanisable | sibling `-resolution.md` (court-circuit REJECTED) | Node-FS |
| G14 | Mécanisable | filenames `*-rejected.md` + `Status:` frontmatter | Node-FS |
| G15 | **Sémantique** | ADR restitue-t-il un baseline déjà enforced | LLM |

**Résultat attendu :** 10/15 gates pleinement mécanisables (G1–G4 via ast-grep ; G7, G8, G10, G12, G13, G14 via Node) + G5 partiellement (volet AST mécanisé, volet invariants au LLM). Seuls 4 gates restent purement LLM (G6, G9, G11, G15) + le résidu sémantique de G5. Le pré-filtre supprime ~66 % des décisions LLM et ne passe au modèle que les sections d'artefacts concernées par les gates restants.

**Répartition par moteur :** 4 gates **ast-grep** (G1, G3, G4, volet AST de G5) — rules YAML déclaratives, agrégées par `sg scan --json` ; 6 gates **glue Node** (G2, G7, G8, G10, G12, G13, G14) — markdown / filesystem, dans un **unique** `prefilter.mjs` (pas de framework de détecteurs) ; 4–5 gates **LLM** — jugement sémantique pur.

> **Note :** ce tableau est l'autorité de la Task 0 (spec). Si la spec révise une classification, ce plan doit être régénéré.

> **Pourquoi ast-grep est le moteur, pas Node :** les gates structurels sont des **règles AST déclaratives** (YAML), pas du code impératif. ast-grep parse, matche et agrège nativement (`sg scan --json`). Écrire des détecteurs `.mjs` qui re-parsent du code serait réinventer ast-grep en moins bien. Le seul Node conservé est une glue d'agrégation pour les gates **non-AST** (existence de fichiers, cross-ref markdown) — et il réutilise le runtime **déjà imposé** par `render-verdict.mjs`. Zéro nouvelle dépendance runtime.

> **Principe AST (non-négociable) :** aucune détection structurelle ne s'appuie sur une **convention de nommage** (pas de `I*`, pas de suffixe `*Repository`). On matche le **kind de nœud AST** (`interface_declaration`, `class_declaration`, `import`…) et on résout l'appartenance à une couche par le **chemin/module** du fichier (mapping `layer-map` déclaré dans la spec). Le nommage est une heuristique fragile et language-specific — ast-grep existe précisément pour s'en passer.

---

## File Structure

**Créés (skill `reviewer-prefilter`) :**
- `plugins/skills/reviewer-prefilter/SKILL.md` — entry-point, contrat d'invocation, pré-requis ast-grep, mapping gate→moteur.
- `plugins/skills/reviewer-prefilter/sgconfig.yml` — config ast-grep : déclare le dossier `rules/` et les langages. C'est le point d'entrée de `ast-grep scan`.
- `plugins/skills/reviewer-prefilter/rules/` — rule-sets **ast-grep** YAML, le moteur structurel : `g01-structural-ports.yml`, `g03-dependency-rule.yml`, `g04-interface-placement.yml`, `g05-cross-aggregate-ref.yml`, déclinés par langage via `language:` (csharp, java, kotlin, typescript, python). Chaque rule porte un `metadata: { gate, severity }` pour l'agrégation.
- `plugins/skills/reviewer-prefilter/scripts/prefilter.mjs` — **glue unique** : fail-fast ast-grep → `sg scan --json` → + gates non-AST (FS/markdown) → agrégation `prefilter-report.json`. Pas de dossier `detectors/`.
- `plugins/skills/reviewer-prefilter/assets/reference/prefilter-report-schema.md` — référence humaine du format JSON.
- `plugins/skills/reviewer-prefilter/assets/examples/report-clean.json`
- `plugins/skills/reviewer-prefilter/assets/examples/report-blocker-shortcircuit.json`
- `plugins/skills/reviewer-prefilter/assets/examples/report-suspect-sections.json`
- `plugins/skills/reviewer-prefilter/assets/fixtures/repo-fixture-clean/` — arbre minimal pour tests.
- `plugins/skills/reviewer-prefilter/assets/fixtures/repo-fixture-g13-open/` — blocker sans résolution.
- `plugins/skills/reviewer-prefilter/assets/fixtures/repo-fixture-g14-rejected-filename/`
- `plugins/skills/reviewer-prefilter/references/detector-internals.md` — load-on-demand.
- `plugins/skills/reviewer-prefilter/tests/prefilter.test.mjs` — `node --test`.
- `docs/superpowers/specs/2026-06-04-reviewer-determinism-design.md` — spec source.

**Modifiés :**
- `plugins/skills/adversarial-review-lenses/SKILL.md` — §Procédure : étape pré-filtre avant les lentilles ; tags émis uniquement pour gates sémantiques ; description requise seulement si tag ≠ OK.
- `plugins/skills/architecture-review-criteria/SKILL.md` — marquer chaque gate `mechanizable: true|false` ; renvoyer les gates mécanisés vers `reviewer-prefilter`.
- `plugins/agents/solution-architect-reviewer.agent.md` — Phase 0 (run prefilter), court-circuit, FAN-OUT réduit aux gates sémantiques sur sections suspectes.
- `plugins/agents/backlog-discoverer-reviewer.agent.md` — idem (gates de sa phase).
- `plugins/agents/backlog-planner-reviewer.agent.md` — idem.
- `plugins/agents/acceptance-designer-reviewer.agent.md` — idem.
- `plugins/agents/software-engineer-reviewer.agent.md` — idem.
- `plugins/agents/skraft-orchestrator.agent.md` — exécuter `prefilter.mjs` avant dispatch reviewer ; fusionner `prefilter-report.json` + tags LLM → `render-verdict.mjs` ; peupler `state.json::reviewerVerdicts[phase]`.

**Découpage par responsabilité :** le moteur structurel vit en **YAML déclaratif** (`rules/*.yml` + `sgconfig.yml`), testé par fixtures de code. La glue `prefilter.mjs` reste **un seul fichier** (~150 LoC) : lancer ast-grep, ajouter les gates FS/markdown, agréger. Pas de framework de détecteurs Node — ce serait dupliquer ast-grep.

---

## Task 0: Spec source — design du pré-filtre déterministe

Rédige la spec qui fige : la classification des gates, le schéma `prefilter-report.json`, le contrat de court-circuit, et le nouveau contrat reviewer (tags sémantiques only). **Bloquant** pour toutes les tâches suivantes.

**Files:**
- Create: `docs/superpowers/specs/2026-06-04-reviewer-determinism-design.md`
- Read: `plugins/skills/architecture-review-criteria/SKILL.md`, `plugins/skills/adversarial-review-lenses/SKILL.md`, `plugins/skills/reviewer-verdict-schema/SKILL.md`

- [ ] **Step 1 : Figer la classification des gates + le moteur**

Reprendre le tableau ci-dessus, le valider gate-par-gate contre la définition de chaque gate dans les 5 reviewers (pas seulement architecture). Pour chaque gate, trancher le **moteur** : `ast-grep` (AST-structurel, rule YAML), `Node-glue` (texte/FS) ou `LLM` (sémantique). Produire un ADR de dépendance actant qu'ast-grep est **obligatoire et sans fallback** (justification : précision AST, déclaratif YAML, agrégation native, stack-agnostic ; comportement absent du PATH = exit en erreur).

- [ ] **Step 2 : Définir le schéma `prefilter-report.json`**

Champs minimaux : `phase`, `shortCircuit: { triggered: bool, gate: string|null, verdict: "REJECTED"|null }`, `mechanizedFindings: [{ gate, tag, evidence }]`, `suspectSections: [{ artefact, anchor, gates: [string] }]`, `semanticGatesRemaining: [string]`.

- [ ] **Step 2b : Définir le `layer-map` (résolution de couche par chemin)**

Figer comment une couche Clean Architecture (Domain / Application / Infrastructure / API) est résolue à partir du **chemin** d'un fichier (glob par couche), **jamais** par convention de nommage de symbole. C'est l'entrée commune des rules G3/G4. Prévoir un `layer-map` par défaut + override projet.

- [ ] **Step 3 : Contrat de court-circuit**

Documenter : si un détecteur produit un BLOCKER mécanique (ex. G13 open, G14 filename), `shortCircuit.triggered = true` et **le LLM n'est pas appelé**. L'orchestrateur rend directement le verdict REJECTED via `render-verdict.mjs`.

- [ ] **Step 4 : Nouveau contrat reviewer (token reduction)**

Documenter : le reviewer reçoit `prefilter-report.json` + uniquement les `suspectSections`. Il émet des tags **seulement** pour `semanticGatesRemaining`. `description` requise uniquement si `tag ≠ OK`. Aucun re-listing des définitions de gates dans la sortie.

- [ ] **Step 5 : Mesures de succès**

Définir les KPI vérifiables : (a) % de décisions hors-LLM ≥ 60 %, (b) golden cases reproductibles à 100 %, (c) réduction tokens input mesurée sur un cas de référence.

---

## Phase 1 — Skill scaffolding + moteur de pré-filtre (TDD)

### Task 1: Scaffolding du skill `reviewer-prefilter`

**Files:**
- Create: `plugins/skills/reviewer-prefilter/SKILL.md`
- Create: `plugins/skills/reviewer-prefilter/sgconfig.yml`
- Create: `plugins/skills/reviewer-prefilter/scripts/prefilter.mjs` (stub)
- Create: `plugins/skills/reviewer-prefilter/tests/prefilter.test.mjs` (stub)

- [ ] **Step 1 : Créer l'arborescence**

```bash
mkdir -p plugins/skills/reviewer-prefilter/{rules,scripts,assets/examples,assets/fixtures,assets/reference,references,tests}
```

- [ ] **Step 2 : SKILL.md minimal**

Frontmatter conforme `hve-core/prompt-builder.instructions.md`. Pré-requis **ast-grep obligatoire** documenté en tête (`npm i -g @ast-grep/cli`). Sections vides : "Invocation contract / Engine (ast-grep rules) / Report schema". Contenu détaillé en Task 8.

- [ ] **Step 3 : `sgconfig.yml`**

```yaml
ruleDirs:
  - rules
```

Point d'entrée d'`ast-grep scan`. Les langages sont portés par chaque rule (`language:`).

- [ ] **Step 4 : Stub `prefilter.mjs` (fail-fast ast-grep)**

```javascript
#!/usr/bin/env node
// prefilter.mjs — ast-grep scan + non-AST gates + aggregation
import { spawnSync } from 'node:child_process';
const probe = spawnSync('ast-grep', ['--version'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error('FATAL: ast-grep is required and was not found on PATH. Install: npm i -g @ast-grep/cli');
  process.exit(2);
}
// TODO: scan(sgconfig) / non-AST gates / aggregate prefilter-report.json
```

- [ ] **Step 5 : Stub test + vérifier le runner**

```bash
node --test plugins/skills/reviewer-prefilter/tests/
```

---

### Task 2: Gates de court-circuit (G13, G14) — TDD

Les BLOCKER déterministes prioritaires : ils évitent tout appel LLM. Pure filesystem → dans la glue `prefilter.mjs`, **pas** de fichier détecteur dédié.

**Files:**
- Modify: `plugins/skills/reviewer-prefilter/scripts/prefilter.mjs`
- Create: `plugins/skills/reviewer-prefilter/assets/fixtures/repo-fixture-g13-open/`
- Create: `plugins/skills/reviewer-prefilter/assets/fixtures/repo-fixture-g14-rejected-filename/`
- Modify: `plugins/skills/reviewer-prefilter/tests/prefilter.test.mjs`

- [ ] **Step 1 : RED — test G13**

Fixture : un `blockers/{date}/decision-drift-x-001.md` sans sibling `-resolution.md`. Test attend `shortCircuit.triggered === true`, `gate === "G13"`, `verdict === "REJECTED"`.

- [ ] **Step 2 : GREEN — check G13 dans la glue**

`exists?` du sibling `-resolution.md` pour chaque blocker. Pur filesystem, zéro LLM, zéro ast-grep.

- [ ] **Step 3 : RED — test G14**

Fixture : un fichier `adrs/adr-007-event-sourcing-rejected.md`. Test attend `shortCircuit` G14.

- [ ] **Step 4 : GREEN — check G14 dans la glue**

Scan des filenames `adrs/*.md`, match `/-(rejected|accepted|deprecated|superseded)\.md$/`. Lire le `Status:` frontmatter pour le second pass.

- [ ] **Step 5 : Refactor + commit**

```bash
git add plugins/skills/reviewer-prefilter/
git commit -m "feat(prefilter): G13/G14 short-circuit (filesystem gates)"
```

---

### Task 3: Rules ast-grep — moteur structurel (G1, G3, G4, volet AST G5) — TDD

Le cœur du système : **rules YAML déclaratives**, exécutées par `ast-grep scan --json`. **Aucun code Node** ici — ast-grep parse, matche et agrège.

**Files:**
- Create: `plugins/skills/reviewer-prefilter/rules/{g01-structural-ports,g03-dependency-rule,g04-interface-placement,g05-cross-aggregate-ref}.yml`
- Create: `plugins/skills/reviewer-prefilter/assets/fixtures/repo-fixture-clean/` (+ fixture violante par gate **et par langage**)
- Modify: `plugins/skills/reviewer-prefilter/tests/prefilter.test.mjs`

- [ ] **Step 1 : RED — `sg scan` produit du JSON exploitable**

Test : `ast-grep scan -c sgconfig.yml --json {fixture}` retourne des hits avec `metadata.gate`. Tri lexicographique des hits garanti (déterminisme).

- [ ] **Step 2 : GREEN + RED — G3 dependency-rule (le cas du catalog ast-grep)**

Rule YAML : un nœud `import`/`using` ciblant un module Infrastructure/API, `inside` un fichier dont le **chemin appartient** à la couche Domain/Application (via `files:`/glob de la rule, pas via le nom du symbole). S'inspirer de la règle clean-architecture du catalog ast-grep (Kotlin) et la décliner csharp/java/ts/python. Fixture violante par langage → hit `metadata: { gate: G3, severity: BLOCKER }`.

- [ ] **Step 3 : GREEN + RED — G1 ports + G4 placement (par AST, jamais par nom)**

G1 : rule matchant un nœud de **type** qui implémente/référence un port (`CommandBus`, `QueryBus`, `EventStore`, `Saga`) → liste les hits (cross-check ADR fait par la glue Task 5). G4 : rule matchant le nœud `interface_declaration` (**quel que soit son nom**) dans un fichier dont le **chemin** est hors Application (`files:` glob). La couche vient du chemin, jamais du préfixe `I*`.

- [ ] **Step 4 : GREEN + RED — volet AST de G5**

Rule : un champ d'un agrégat dont le **type déclaré** est un autre agrégat (référence objet typée) au lieu d'un type ID. Hit → `metadata: { gate: G5, severity: HIGH }` ; le volet « enforce ses invariants » reste taggé par le LLM.

- [ ] **Step 5 : Refactor + commit**

```bash
git commit -am "feat(prefilter): ast-grep rules for G1/G3/G4/G5-AST"
```

---

### Task 4: Gates markdown/traçabilité (G2, G7, G8, G10, G12) — TDD

Gates non-AST (markdown cross-ref + existence de fichiers) → dans la glue `prefilter.mjs`, fonctions pures, **pas** de framework de détecteurs.

**Files:**
- Modify: `plugins/skills/reviewer-prefilter/scripts/prefilter.mjs`
- Modify: `plugins/skills/reviewer-prefilter/tests/prefilter.test.mjs`

- [ ] **Step 1 : RED + GREEN — G2 (supersession cross-ref)**

Chaque `**Supersedes:** ADR-NNN` dans un ADR a une row correspondante dans `docs/adr/supersessions.md` (et inverse). Asymétrie → BLOCKER.

- [ ] **Step 2 : RED + GREEN — G7**

Chaque story-id de `stories-{milestone}.md` apparaît comme Command/Query dans un slice d'event model. Manquant → HIGH.

- [ ] **Step 3 : RED + GREEN — G8**

Chaque Command a ≥1 domain event associé. Command orpheline → HIGH.

- [ ] **Step 4 : RED + GREEN — G10 + G12**

G10 : `consistency-matrix-{story}.md` existe par story + ligne `consistency-gate: PASS`, sinon BLOCKER. G12 : pour chaque row `supersession-plan-{story}.md`, les 3 conditions (new ADR `**Supersedes:**` + row registry + aucun artefact descriptif citant l'ADR superseded), sinon BLOCKER.

- [ ] **Step 5 : Refactor + commit**

```bash
git commit -am "feat(prefilter): markdown/traceability gates G2/G7/G8/G10/G12"
```

---

### Task 5: Agrégateur `prefilter.mjs` + index des sections suspectes — TDD

**Files:**
- Modify: `plugins/skills/reviewer-prefilter/scripts/prefilter.mjs`
- Create: `plugins/skills/reviewer-prefilter/assets/examples/{report-clean,report-blocker-shortcircuit,report-suspect-sections}.json`
- Modify: `plugins/skills/reviewer-prefilter/tests/prefilter.test.mjs`

- [ ] **Step 1 : RED — agrégation + court-circuit prioritaire**

Test : si un gate de court-circuit (G13/G14) déclenche, `prefilter.mjs` n'invoque **pas** le reste et émet `shortCircuit` ; sinon il fusionne les hits `sg scan --json` (mappés via `metadata.gate`) + les gates markdown/FS.

- [ ] **Step 2 : GREEN — pipeline d'agrégation**

`parseArgs(--phase, --root)` → (1) court-circuit FS → (2) `ast-grep scan -c sgconfig.yml --json` → (3) gates markdown/FS de la phase → fusion. G1 : cross-check chaque hit de port contre la présence d'un ADR `Accepted`. Sortie `prefilter-report.json` sur stdout.

- [ ] **Step 3 : RED + GREEN — `suspectSections`**

Pour chaque gate **sémantique** restant (G5-LLM, G6, G9, G11, G15), produire les ancres d'artefacts à lire (ex. lignes context-map pour G6). C'est l'index qui réduit l'input LLM.

- [ ] **Step 4 : RED + GREEN — `semanticGatesRemaining`**

Liste des gates non tranchés mécaniquement, à passer au LLM.

- [ ] **Step 5 : Snapshot examples + commit**

Geler les 3 exemples JSON comme golden. `git commit -am "feat(prefilter): aggregate report + suspect-section index"`.

---

## Phase 2 — Intégration reviewers + orchestrateur

### Task 6: Brancher `adversarial-review-lenses` sur le pré-filtre

**Files:**
- Modify: `plugins/skills/adversarial-review-lenses/SKILL.md`

- [ ] **Step 1 : Ajouter l'étape "Phase 0 — Pré-filtre"**

Avant les lentilles : charger `prefilter-report.json`. Si `shortCircuit.triggered`, ne pas exécuter de lentille — le verdict est déjà REJECTED.

- [ ] **Step 2 : Restreindre les lentilles aux gates sémantiques**

Les lentilles n'évaluent que `semanticGatesRemaining`, sur les `suspectSections` seulement.

- [ ] **Step 3 : Resserrer le format de sortie (tokens)**

Émettre des **tags seulement**. `description` requise uniquement si `tag ≠ OK`. Supprimer le re-listing des définitions de gates.

- [ ] **Step 4 : Cross-ref `reviewer-prefilter`**

Lien vers le nouveau skill ; préciser que le score pondéré fusionne `mechanizedFindings` + tags LLM (calcul hors-LLM par `render-verdict.mjs`).

---

### Task 7: Retarget des 5 reviewers + marquage des gates

**Files:**
- Modify: `plugins/skills/architecture-review-criteria/SKILL.md`
- Modify: `plugins/agents/{solution-architect,backlog-discoverer,backlog-planner,acceptance-designer,software-engineer}-reviewer.agent.md`

- [ ] **Step 1 : Marquer chaque gate `mechanizable`**

Dans chaque `*-review-criteria` skill, annoter les gates (`mechanizable: true` → délégué au prefilter ; `false` → LLM).

- [ ] **Step 2 : Ajouter "Phase 0: PREFILTER" à chaque reviewer**

Avant RECEIVE/FAN-OUT : exécuter `prefilter.mjs --phase {phase}` (ou consommer le rapport fourni par l'orchestrateur), honorer le court-circuit.

- [ ] **Step 3 : Réduire FAN-OUT aux lentilles sémantiques**

Chaque lentille ne traite que ses gates `mechanizable: false` sur `suspectSections`.

- [ ] **Step 4 : Charger le skill `reviewer-prefilter`**

Ajouter au bloc "Skill Loading — MANDATORY" de chaque reviewer.

- [ ] **Step 5 : Vérifier les boundaries**

Les reviewers restent READ-ONLY. `prefilter.mjs` écrit **uniquement** `prefilter-report.json` sous `reviews/{date}/` — confirmer le grant.

---

### Task 8: Orchestrateur — exécution prefilter + fusion verdict

**Files:**
- Modify: `plugins/agents/skraft-orchestrator.agent.md`
- Modify: `plugins/skills/reviewer-prefilter/SKILL.md` (contenu détaillé final)

- [ ] **Step 1 : Étape "Run prefilter" avant dispatch**

Avant de dispatcher un reviewer, l'orchestrateur exécute `prefilter.mjs` et passe le rapport au reviewer.

- [ ] **Step 2 : Honorer le court-circuit côté orchestrateur**

Si `shortCircuit.triggered`, **ne pas dispatcher le reviewer** ; rendre directement REJECTED via `render-verdict.mjs`.

- [ ] **Step 3 : Fusion `mechanizedFindings` + tags LLM**

Concaténer les findings mécaniques et les tags sémantiques, puis appeler `render-verdict.mjs` (calcul score + Markdown hors-LLM).

- [ ] **Step 4 : Peupler `state.json`**

Écrire `state.json::reviewerVerdicts[phase]` depuis la ligne verdict du rendu.

- [ ] **Step 5 : SKILL.md final**

Compléter `reviewer-prefilter/SKILL.md` : contrat d'invocation, mapping gate→détecteur, schéma rapport, exemples.

---

## Phase 3 — Garanties de déterminisme

### Task 9: Golden cases anti-régression

**Files:**
- Create: `plugins/skills/reviewer-prefilter/tests/golden/` (artefacts figés + rapports attendus)
- Modify: `plugins/skills/reviewer-prefilter/tests/prefilter.test.mjs`

- [ ] **Step 1 : Figer ≥4 cas golden**

clean / G13-shortcircuit / G14-shortcircuit / suspect-sections. Chaque cas = arbre d'artefacts + `prefilter-report.json` attendu.

- [ ] **Step 2 : Test de reproductibilité**

Rejouer `prefilter.mjs` N fois sur chaque golden → rapport **byte-identique** à chaque run (tri lexicographique des inputs garanti).

- [ ] **Step 3 : Test de stabilité d'ordre**

Vérifier que l'ordre de découverte des fichiers n'affecte pas le rapport (sort déterministe imposé dans `prefilter.mjs`).

- [ ] **Step 4 : Commit**

```bash
git commit -am "test(prefilter): golden cases + determinism guarantees"
```

---

### Task 10: Mesure tokens + documentation des KPI

**Files:**
- Create: `.copilot-tracking/changes/2026-06-04-reviewer-determinism-results.md`

- [ ] **Step 1 : Mesurer le baseline**

Sur un cas de référence (DESIGN d'une story), compter les tokens input/output reviewer **avant** pré-filtre.

- [ ] **Step 2 : Mesurer après**

Même cas, **avec** pré-filtre : input réduit aux `suspectSections`, output réduit aux tags.

- [ ] **Step 3 : Vérifier les KPI de la spec**

(a) ≥ 60 % de décisions hors-LLM, (b) golden 100 % reproductibles, (c) delta tokens documenté.

- [ ] **Step 4 : Consigner**

Écrire le journal de résultats ; lier la spec et le plan.

---

## Risques & garde-fous

- **Détecteur trop strict → faux BLOCKER.** Mitigé par les golden cases et par la séparation court-circuit (G13/G14, non ambigus) vs findings agrégés (G1–G12, fusionnés au score, pas de court-circuit).
- **ast-grep absent du PATH.** **Fail-fast** : `prefilter.mjs` sort en erreur (exit 2), jamais de dégradation ni de faux PASS. ast-grep est un pré-requis dur, documenté dans le SKILL.md + ADR de dépendance.
- **Drift des rules ast-grep vs définitions de gates.** Les `rules/*.yml` sont l'**autorité unique** des détections AST ; `architecture-review-criteria` renvoie vers elles (pas de regex/signature dupliqué dans la prose du gate).
- **Faux positifs AST par langage.** Une rule par `language:` avec fixture violante **et** fixture clean par langage. Un langage non couvert par une rule = gate non évalué pour ce langage (signalé explicitement), jamais un PASS implicite.
- **Reviewers qui "trichent" et relisent tout.** Le contrat impose que le LLM ne reçoive que `suspectSections` ; l'orchestrateur ne fournit pas les artefacts complets.
- **Régression silencieuse du déterminisme.** Task 9 (reproductibilité byte-identique) en CI est le filet ; les hits ast-grep sont triés lexicographiquement avant agrégation. La CI installe ast-grep en pré-requis du job.
