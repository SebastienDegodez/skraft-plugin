# SKRAFT × HVE Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre `skraft-plugin` compatible avec les conventions HVE en remplaçant uniquement RPI : adopter `state.json`, les chemins datés sous `.copilot-tracking/skraft-plans/`, et la commande d'entrée `/skraft`.

**Architecture:** Hexagonal pour SKRAFT (orchestrator + 5 phase agents + 5 reviewers). Adoption verbatim des conventions HVE : `state.json` JSON, protocole 6-étapes par tour, arborescence datée. 2 nouveaux fichiers instructions + 2 nouvelles skills + édition de l'orchestrator + retarget des phase/reviewer agents.

**Tech Stack:** Markdown (.agent.md, .instructions.md, SKILL.md), YAML frontmatter, JSON Schema (state.json), conventions HVE-Core (microsoft/hve-core).

**Spec source:** [docs/superpowers/specs/2026-05-26-skraft-hve-compatibility-design.md](../specs/2026-05-26-skraft-hve-compatibility-design.md)

**Branche de travail:** `feat/hve-compatibility` (déjà créée).

---

## File Structure

```
skraft-plugin/
├── plugins/
│   ├── agents/
│   │   ├── skraft-orchestrator.agent.md       [MODIFY]
│   │   ├── backlog-discoverer.agent.md        [MODIFY paths]
│   │   ├── backlog-discoverer-reviewer.agent.md [MODIFY paths]
│   │   ├── backlog-planner.agent.md           [MODIFY paths]
│   │   ├── backlog-planner-reviewer.agent.md  [MODIFY paths]
│   │   ├── solution-architect.agent.md        [MODIFY paths]
│   │   ├── solution-architect-reviewer.agent.md [MODIFY paths]
│   │   ├── acceptance-designer.agent.md       [MODIFY paths]
│   │   ├── acceptance-designer-reviewer.agent.md [MODIFY paths]
│   │   ├── software-engineer.agent.md         [MODIFY paths]
│   │   └── software-engineer-reviewer.agent.md [MODIFY paths]
│   ├── instructions/                          [CREATE folder]
│   │   ├── skraft-state.instructions.md       [CREATE]
│   │   └── skraft-artifacts.instructions.md   [CREATE]
│   └── skills/
│       ├── skraft-difficulty-routing/
│       │   └── SKILL.md                       [CREATE]
│       └── adversarial-review-lenses/
│           └── SKILL.md                       [CREATE]
└── docs/superpowers/
    ├── specs/2026-05-26-skraft-hve-compatibility-design.md  [DONE]
    └── plans/2026-05-26-skraft-hve-compatibility.md         [THIS FILE]
```

---

## Task 1: Convention foundation — `skraft-state` instructions

Établit la convention `state.json` et le protocole 6-étapes. Fondation des autres tâches.

**Files:**
- Create: `plugins/instructions/skraft-state.instructions.md`

**Reference:** `hve-core/.github/instructions/security/identity.instructions.md` (lignes 100-165 pour schéma + protocole).

- [ ] **Step 1: Créer le fichier avec frontmatter et schéma**

Frontmatter :
```yaml
---
description: "SKRAFT pipeline state schema, 6-step state protocol, and 4-step resume sequence"
applyTo: '**/.copilot-tracking/skraft-plans/**'
---
```

Contenu requis : schéma `state.json` complet (cf. spec section "state.json — schéma"), protocole 6-étapes (READ/VALIDATE/DETERMINE/EXECUTE/UPDATE/WRITE), séquence Resume 4-étapes, règles de transition (`currentPhase` ne change que sur APPROVED), recovery procedure si state.json corrompu.

- [ ] **Step 2: Vérifier conformité prompt-builder.instructions.md**

Vérifier : H1 présent, sections (Schema / State Protocol / Resume / Recovery), pas de duplication HVE.

- [ ] **Step 3: Commit**

```bash
git add plugins/instructions/skraft-state.instructions.md
git commit -m "feat(instructions): add skraft-state convention (state.json + 6-step protocol)"
```

---

## Task 2: Convention foundation — `skraft-artifacts` instructions

Définit le mapping chemins SKRAFT → HVE pour tous les artefacts produits par les phase agents et reviewers.

**Files:**
- Create: `plugins/instructions/skraft-artifacts.instructions.md`

- [ ] **Step 1: Créer le fichier avec table de mapping**

Frontmatter :
```yaml
---
description: "SKRAFT artifact path conventions aligned with HVE-Core dated subdirectories"
applyTo: '**/.copilot-tracking/**'
---
```

Contenu : table de mapping (DISCOVER → research/, DISCUSS → plans/, DESIGN → adrs/+details/, DISTILL → details/+features/, DELIVER → changes/, Reviews → reviews/), règle d'écriture seule pour reviewers, header `<!-- markdownlint-disable-file -->` obligatoire, namespace `skraft-plans/{slug}/`.

- [ ] **Step 2: Vérifier le mapping vs spec**

Confronter avec la section "Mapping artefacts SKRAFT → HVE" du spec.

- [ ] **Step 3: Commit**

```bash
git add plugins/instructions/skraft-artifacts.instructions.md
git commit -m "feat(instructions): add skraft-artifacts path conventions (HVE-aligned)"
```

---

## Task 3: Skill — `skraft-difficulty-routing`

Procédure d'évaluation 3-axes en sortie de DISCOVER. Référencée par l'orchestrator.

**Files:**
- Create: `plugins/skills/skraft-difficulty-routing/SKILL.md`

- [ ] **Step 1: Créer SKILL.md avec frontmatter**

Frontmatter :
```yaml
---
name: skraft-difficulty-routing
description: "Use at DISCOVER exit to evaluate 3-axis routing (entry point, depth tier, difficulty tier), validate immutable invariants, and persist to state.json"
---
```

Contenu : 3 axes orthogonaux à évaluer en sortie de DISCOVER :

1. **Entry Point** — quelles phases jouer (skip si checklist satisfaite). Persisté dans `state.json::entryPoint`.
2. **Depth Tier** (alignement HVE/RPI : `basic | standard | comprehensive | custom`) — profondeur d'exécution au sein de chaque phase. Persisté dans `state.json::userPreferences.depthTier`.
3. **Difficulty Tier** (`simple | medium | medium-hard | challenging`) — modèle d'exécution dans DELIVER (inline vs subagents + artefacts). Persisté dans `state.json::difficulty`.

### Depth Tier — table de référence

| Depth Tier | TDD (mandatory) | Mutation Domain/Application | Mutation API/Infrastructure | Reviewer lenses | Gherkin gate | Use case |
|---|---|---|---|---|---|---|
| `basic` | Red-Green | skip | skip | 1 | recommandé | Prototype, spike |
| `standard` | Red-Green-Refactor | **100%** | skip | 2 | recommandé | Feature non critique, itération rapide |
| `comprehensive` **(default)** | Outside-In double-loop | **100%** | **90%** | 4 (A7 complet) | obligatoire | Default — feature production, code critique, public API |
| `custom` | mandatory (variante au choix) | user-defined ≥ 0 | user-defined ≥ 0 | user-defined ≥ 1 | user-defined | Cas étrange — soumis aux invariants |

L'orchestrator persiste `comprehensive` dans `state.json::userPreferences.depthTier` si aucun choix utilisateur n'a été enregistré. Tout downgrade vers `basic`, `standard` ou `custom` exige un choix explicite de l'utilisateur en sortie de DISCOVER.

### Invariants immuables (jamais désactivables, y compris en `custom`)

- **TDD obligatoire** (au minimum Red-Green) — pas de production code sans test rouge préalable.
- **Clean Architecture layer boundaries** — Domain ne dépend ni de Application ni de Infrastructure.
- **Test integrity** — interdiction de supprimer ou désactiver un test pour passer GREEN.
- **State.json schema compliance** — sérialisation conforme, traçabilité HVE.
- **HVE dated paths** (`research/{date}/`, `adrs/`, `details/{date}/`, `changes/{date}/`, `reviews/{date}/`).
- **Reviewers en read-only** — n'écrivent que sous `reviews/{date}/`.
- **Aucun secret/credential commité**.

### Niveaux d'enforcement par gate (mapping par défaut)

`advisory` = logué dans `reviews/{date}/` mais ne bloque pas. `warning` = bloque sauf override justifié dans `state.json::overrides[]`. `blocking` = bloque sans override possible.

| Gate | basic | standard | comprehensive |
|---|---|---|---|
| Clean Architecture boundaries | blocking | blocking | blocking |
| TDD cycle respecté | blocking | blocking | blocking |
| Test integrity | blocking | blocking | blocking |
| Mutation Domain/Application ≥ threshold | advisory | blocking | blocking |
| Mutation API/Infrastructure ≥ threshold | advisory | advisory | blocking |
| Gherkin gate (user-approved) | advisory | warning | blocking |
| ADR pour décisions non-triviales | advisory | warning | blocking |
| Object Calisthenics (Domain) | advisory | warning | blocking |

### Vérifications de cohérence sur `custom`

L'orchestrator refuse l'exécution si l'une des combinaisons suivantes est détectée dans `state.json::userPreferences.customDepth` :

| Combinaison interdite | Raison |
|---|---|
| Tout gate listé comme invariant `≠ blocking` | Invariants immuables |
| `mutationDomain: blocking` + `mutationDomainThreshold: 0` | Threshold à 0 rend le gate inutile |
| `gherkinGate: advisory` + `mutationApi: blocking` | Tests API sans BDD = pas de comportement testé |
| `tddCycle: ≠ blocking` | TDD est invariant |

En cas de conflit : orchestrator stoppe et demande à l'utilisateur de corriger `userPreferences.customDepth` avant de poursuivre.

- [ ] **Step 2: Cross-check session memory**

Référence : `/memories/session/skraft-hve-design.md` section "Combined Design: 3 orthogonal axes". Mettre à jour la session memory si l'alignement HVE Depth Tier introduit de nouvelles décisions.

- [ ] **Step 3: Commit**

```bash
git add plugins/skills/skraft-difficulty-routing/SKILL.md
git commit -m "feat(skills): add skraft-difficulty-routing (3-axis assessment + HVE depth tier alignment)"
```

---

## Task 4: Skill — `adversarial-review-lenses`

Procédure A7 ADVERSARIAL REVIEW : 4 lentilles indépendantes + synthèse. Référencée par les 5 reviewers.

**Files:**
- Create: `plugins/skills/adversarial-review-lenses/SKILL.md`

- [ ] **Step 1: Créer SKILL.md avec frontmatter**

Frontmatter :
```yaml
---
name: adversarial-review-lenses
description: "Use when a reviewer agent must produce an adversarial verdict via 4 independent lenses and weighted synthesis (Genesis A7 pattern)"
---
```

Contenu : pattern A7 (4 lentilles indépendantes : completeness / business-fit / quality / risk), règle de no-contamination entre lentilles, formule de synthèse pondérée, format verdict `APPROVED|NEEDS_REWORK|REJECTED`, output template pour `reviews/{date}/*-review.md`.

- [ ] **Step 2: Référencer review-artifacts.instructions.md HVE**

Lien `#file:` vers `.copilot-tracking/reviews/code-reviews/review-artifacts.instructions.md` (résolu via HVE-core fallback).

- [ ] **Step 3: Commit**

```bash
git add plugins/skills/adversarial-review-lenses/SKILL.md
git commit -m "feat(skills): add adversarial-review-lenses (Genesis A7 4-lens procedure)"
```

---

## Task 5: Rewrite `skraft-orchestrator.agent.md`

Cœur du changement : `/sdlc` → `/skraft`, paths HVE, retry inline, neighbor warning, références aux nouvelles instructions.

**Files:**
- Modify: `plugins/agents/skraft-orchestrator.agent.md`

- [ ] **Step 1: Frontmatter — renommer entry_point et state_file**

```yaml
metadata:
  entry_point: /skraft         # was /sdlc
  state_file: .copilot-tracking/skraft-plans/{projectSlug}/state.json  # was .skraft/sdlc/state.md
```

Mettre à jour `description:` pour mentionner `/skraft`.

- [ ] **Step 2: Phase 0 LOAD STATE — pivot vers state.json**

Remplacer le bloc Phase 0 : lire `state.json` (pas `state.md`), suivre protocole 6-étapes référencé via `#file:plugins/instructions/skraft-state.instructions.md`.

- [ ] **Step 3: State schema — supprimer le bloc markdown, référencer skraft-state**

Supprimer l'ancien schéma `state.md` (lignes ~60-105 actuelles). Remplacer par un renvoi : "Voir `skraft-state.instructions.md` pour le schéma `state.json` et les règles de mise à jour."

- [ ] **Step 4: Dispatch table — retarget paths**

Remplacer tous les `.skraft/sdlc/{phase}/...` par chemins HVE :
- DISCOVER → `research/{date}/`
- DISCUSS → `plans/{date}/`
- DESIGN → `adrs/` + `details/{date}/`
- DISTILL → `details/{date}/` + `features/`
- DELIVER → `changes/{date}/`

Référencer `#file:plugins/instructions/skraft-artifacts.instructions.md`.

- [ ] **Step 5: Retry policy — inline**

Section dédiée : "Max retries per phase: `userPreferences.maxRetriesPerPhase` (default 2). Sur dépassement, surface utilisateur avec `nextActions`."

- [ ] **Step 6: Neighbor planner warning**

Ajouter 5-10 lignes : "Au démarrage, scanner `.copilot-tracking/security-plans/{slug}/`, `.copilot-tracking/rai-plans/{slug}/`, `.copilot-tracking/sssc-plans/{slug}/`. Si trouvé, ajouter à `state.json::neighborPlanners` et à `nextActions` un message d'avertissement (lecture seule, aucun couplage)."

- [ ] **Step 7: Difficulty assessment — référencer skill**

À la sortie DISCOVER, charger `skraft-difficulty-routing` skill, écrire le résultat dans `state.json::difficulty`.

- [ ] **Step 8: Entry point summary — `/skraft`**

Section finale : "Single entry point: `/skraft`. The user never needs to specify a phase."

- [ ] **Step 9: Lint check**

Vérifier que toutes les anciennes mentions `.skraft/sdlc/` et `/sdlc` ont disparu :
```bash
grep -n "\.skraft/sdlc\|/sdlc" plugins/agents/skraft-orchestrator.agent.md || echo "Clean"
```
Expected: `Clean`

- [ ] **Step 10: Commit**

```bash
git add plugins/agents/skraft-orchestrator.agent.md
git commit -m "refactor(agents): rewrite skraft-orchestrator for HVE compatibility (/sdlc → /skraft, state.json, dated paths)"
```

---

## Task 6: Retarget phase agents (DISCOVER → DELIVER)

Mise à jour des 5 phase agents pour écrire dans les nouveaux chemins HVE.

**Files:**
- Modify: `plugins/agents/backlog-discoverer.agent.md`
- Modify: `plugins/agents/backlog-planner.agent.md`
- Modify: `plugins/agents/solution-architect.agent.md`
- Modify: `plugins/agents/acceptance-designer.agent.md`
- Modify: `plugins/agents/software-engineer.agent.md`

- [ ] **Step 1: Find & replace global sur les 5 fichiers**

Remplacements (en respectant le mapping de la spec) :
- `.skraft/sdlc/discover/` → `.copilot-tracking/skraft-plans/{slug}/research/{date}/`
- `.skraft/sdlc/discuss/` → `.copilot-tracking/skraft-plans/{slug}/plans/{date}/`
- `.skraft/sdlc/design/` → `.copilot-tracking/skraft-plans/{slug}/adrs/` (ADR) + `details/{date}/` (contracts)
- `.skraft/sdlc/distill/` → `.copilot-tracking/skraft-plans/{slug}/details/{date}/` + `features/` (Gherkin)
- `.skraft/sdlc/deliver/` → `.copilot-tracking/skraft-plans/{slug}/changes/{date}/`

- [ ] **Step 2: Ajouter référence à `skraft-artifacts.instructions.md`**

Dans chaque phase agent, ajouter dans la section "Output" : "Suit les conventions de `#file:plugins/instructions/skraft-artifacts.instructions.md`."

- [ ] **Step 3: Lint check**

```bash
grep -rn "\.skraft/sdlc" plugins/agents/ || echo "Clean"
```
Expected: `Clean`

- [ ] **Step 4: Commit**

```bash
git add plugins/agents/backlog-discoverer.agent.md plugins/agents/backlog-planner.agent.md plugins/agents/solution-architect.agent.md plugins/agents/acceptance-designer.agent.md plugins/agents/software-engineer.agent.md
git commit -m "refactor(agents): retarget phase agents to HVE artifact paths"
```

---

## Task 7: Retarget reviewer agents

Les 5 reviewers n'écrivent QUE dans `reviews/{date}/`. Pas dans le namespace des artefacts qu'ils auditent.

**Files:**
- Modify: `plugins/agents/backlog-discoverer-reviewer.agent.md`
- Modify: `plugins/agents/backlog-planner-reviewer.agent.md`
- Modify: `plugins/agents/solution-architect-reviewer.agent.md`
- Modify: `plugins/agents/acceptance-designer-reviewer.agent.md`
- Modify: `plugins/agents/software-engineer-reviewer.agent.md`

- [ ] **Step 1: Find & replace paths**

Remplacer tous les `.skraft/sdlc/{phase}/reviews/` (et toute écriture hors `reviews/`) par :
`.copilot-tracking/skraft-plans/{slug}/reviews/{date}/{phase}-review-{N}.md`

- [ ] **Step 2: Ajouter référence aux 2 skills**

Chaque reviewer référence :
- `#file:plugins/skills/adversarial-review-lenses/SKILL.md` (procédure 4-lentilles)
- `#file:plugins/instructions/skraft-artifacts.instructions.md` (chemins reviews/)

- [ ] **Step 3: Verrou lecture seule sur artefacts**

Ajouter une clause explicite dans chaque reviewer : "READ-ONLY sur les artefacts auditer. Aucune modification de `research/`, `plans/`, `adrs/`, `details/`, `changes/`. Sortie unique : `reviews/{date}/*.md`."

- [ ] **Step 4: Lint check**

```bash
grep -rn "\.skraft/sdlc" plugins/agents/*reviewer* || echo "Clean"
```
Expected: `Clean`

- [ ] **Step 5: Commit**

```bash
git add plugins/agents/backlog-discoverer-reviewer.agent.md plugins/agents/backlog-planner-reviewer.agent.md plugins/agents/solution-architect-reviewer.agent.md plugins/agents/acceptance-designer-reviewer.agent.md plugins/agents/software-engineer-reviewer.agent.md
git commit -m "refactor(agents): retarget reviewer agents to reviews/{date}/ (read-only on artefacts)"
```

---

## Task 8: Validation finale

Vérifications croisées avant clôture de la branche.

- [ ] **Step 1: Aucune mention résiduelle de `/sdlc` ou `.skraft/sdlc/`**

```bash
grep -rn "/sdlc\|\.skraft/sdlc" plugins/ || echo "Clean"
```
Expected: `Clean` (sauf si présent dans un commentaire historique justifié).

- [ ] **Step 2: Markdown lint sur les nouveaux fichiers**

Si un linter markdown est dispo dans le repo (à vérifier), le passer sur les 4 nouveaux fichiers + 11 modifiés.

- [ ] **Step 3: Self-review checklist**

Vérifier :
- [ ] `state.json` schéma cohérent dans `skraft-state.instructions.md` ET dans l'orchestrator
- [ ] Le mapping de `skraft-artifacts.instructions.md` correspond aux chemins utilisés par les phase agents
- [ ] Reviewers n'écrivent que dans `reviews/{date}/`
- [ ] Orchestrator référence les 2 instructions + les 2 nouvelles skills
- [ ] Frontmatter `applyTo` correct sur les 2 instructions

- [ ] **Step 4: Diff summary**

```bash
git log --oneline main..feat/hve-compatibility
git diff --stat main..feat/hve-compatibility
```

- [ ] **Step 5: Update spec status (optional)**

Si validation OK, ajouter une ligne de bas de spec : "**Statut : ✅ implémenté sur `feat/hve-compatibility` le {date}**."

- [ ] **Step 6: Final commit (optional)**

```bash
git add docs/superpowers/specs/2026-05-26-skraft-hve-compatibility-design.md
git commit -m "docs(specs): mark skraft-hve-compatibility as implemented"
```

---

## Remember

- Hard rule utilisateur : **« Si le fichier existe déjà, il faut se conformer EXACTEMENT au phase d'avant »** — réutilisation verbatim des conventions HVE.
- SKRAFT remplace UNIQUEMENT RPI. 9 autres planners HVE coexistent en pairs.
- `state.json` (jamais `.md`). Single entrypoint `/skraft`.
- Reviewers en lecture seule, écrivent uniquement dans `reviews/{date}/`.
- Markdown header `<!-- markdownlint-disable-file -->` requis sous `.copilot-tracking/`.
- DELIVER reste opaque : seuls commit SHAs + mutation score remontent à l'orchestrator.
- Difficulty évaluée 1 fois en sortie DISCOVER, persistée dans `state.json::difficulty`.
