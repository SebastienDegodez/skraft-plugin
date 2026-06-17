# Plan — Économie de tokens SKRAFT (cost-economics genesis)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Tenir la **forme de coût** du pipeline SKRAFT au design : déclarer une posture (`balanced`), router chaque primitive vers sa classe de rôle, garantir la discipline de cache (B13), réduire l'output tax, et reconnaître `depthTier` + skip-DISCOVER comme leviers de coût — sans dégrader la qualité de revue ni dupliquer `reviewer-prefilter`.

**Architecture :** Application du cadre cost-economics du skill `genesis` (7 concepts, patterns B12 MODEL ROUTER / B13 CACHE-AWARE PREFIX / B14 PROMPT THRIFT / B15 TOOL SUBSET / B16 EFFORT GOVERNOR / B11 FOLD-BY-DEFAULT, GRADIENT WORKFLOW / COST PRUNE) aux primitives SKRAFT. L'essentiel est un **travail d'audit + annotation** des agents/instructions existants ; peu de nouveau code.

**Tech Stack :** Markdown agentique (`.agent.md`, `SKILL.md`, `.instructions.md`), frontmatter YAML, `state.json`. Adaptateur per-harness (pricing) référencé mais hors-scope.

**Spec source :** [.specs/specs/2026-06-17-skraft-token-economy-spec.md](../specs/2026-06-17-skraft-token-economy-spec.md).

**Branche de travail :** `feat/skip-discover-on-hve-handoff` (ou branche dédiée `feat/token-economy`).

---

## File Structure

**Audités / annotés (modifiés) :**

- `plugins/agents/skraft-orchestrator.agent.md` — audit cache-invalidators (aucune date littérale en prefix) ; confirmer `state.json` en suffixe variable.
- `plugins/agents/*.agent.md` (10 agents) — annoter la classe de rôle cible ; audit frontmatter `tools:` (B15).
- `plugins/instructions/skraft-state.instructions.md` — documenter `depthTier` comme gouverneur d'effort/coût (B16/B11).
- `plugins/skills/skraft-difficulty-routing/SKILL.md` — note : Axe 2 (`depthTier`) = levier de coût, pas seulement de qualité.

**Créés :**

- `.specs/specs/2026-06-17-skraft-token-economy-spec.md`
- `.specs/plans/2026-06-17-skraft-token-economy-plan.md`

---

## Task 0 : Déclarer la posture (stance)

- [ ] Acter `balanced` comme posture par défaut SKRAFT (mandat B13 systématique).
- [ ] Documenter la bascule `frugal` par story via `state.json` (mandats B12/B15/B16).

## Task 1 : Audit cache-invalidators (B13)

- [x] Grep des bodies d'agents + instructions chargées en prefix pour toute **date littérale / « Current date » / timestamp**. Lister les occurrences. → 0 date figée ; 2 templates dynamiques inoffensifs.
- [x] Confirmer qu'aucun agent ne mute son catalogue d'outils ni ne switche de modèle en cours de session. → `tools:` statique ; `model: inherit` × 19.
- [x] Vérifier que l'orchestrateur charge ses instructions stables **avant** `state.json` (suffixe variable). → `state.json` lu en Phase 0 via tool-read, instructions en metadata/prefix.
- [x] Consigner le résultat (PASS/occurrences) dans le spec. → table d'audit ajoutée §1.

## Task 2 : Model-routing par primitive (B12)

- [ ] Annoter chaque `*.agent.md` avec sa **classe de rôle cible** (table de la spec) en metadata ou commentaire frontmatter.
- [ ] Vérifier que les 5 reviewers ne sont **jamais** promus planner-class (rester reviewer).
- [ ] Confirmer `solution-architect` = planner ; orchestrateur = reviewer/trivial.

## Task 3 : Audit tool-surface (B15)

- [ ] Pour chaque agent, comparer la frontmatter `tools:` au nombre réellement utilisé par appel.
- [ ] Flag toute primitive voyant >20 outils et en utilisant <5 → proposer un sous-ensemble.
- [ ] Prioriser les agents adossés à un large catalogue MCP.

## Task 4 : `depthTier` comme gouverneur de coût (B16/B11)

- [ ] Ajouter dans `skraft-state.instructions.md` et `skraft-difficulty-routing/SKILL.md` une note : `depthTier` pilote l'**effort et le coût** (lenses 1/2/4, seuils mutation, gate Gherkin), pas seulement la qualité.
- [ ] Rappeler la règle : `comprehensive` réservé au code critique ; `basic`/`standard` réduisent fan-out et output.

## Task 5 : Output tax — confirmer la délégation hors-LLM

- [ ] Vérifier que les reviewers n'émettent que des **tags JSON** (rendu MD via `render-verdict.mjs`) — déjà acté par `reviewer-verdict-schema`.
- [ ] Confirmer que `reviewer-prefilter` sort les gates mécanisables (output/turn) — déjà en cours, **ne pas dupliquer**.
- [ ] Identifier toute autre émission longue mécanisable (synthèses) candidate à un pont outil.

## Task 6 : Projection de coût (contrat de validation)

- [ ] Figer la table de bands (classe / prefix / output / tours / patterns) de la spec.
- [ ] Noter explicitement que la fourchette quantitative ($/tokens) requiert l'adaptateur per-harness daté (hors-scope ici).

## Task 7 : Checklist de validation (étape 8 genesis)

- [ ] Chaque classe de rôle annotée correspond aux bands de la projection (pas de promotion silencieuse).
- [ ] Aucun invalidateur de cache introduit.
- [ ] Patterns cités (B12/B13/B14/B15/B16) matérialisés quelque part.
- [ ] Si une posture `frugal` est activée : B12/B15/B16 visibles.

---

## Notes de revue

- **Plus gros ROI : B13.** La discipline de cache est un booléen par tour ; un seul invalidateur annule tout le cache d'un agent. Task 1 est prioritaire.
- **Ne pas re-faire le prefilter.** L'effort reviewer (output/turn) est déjà capturé ; ce plan couvre l'**orchestrateur, les agents spécialistes, et le routing modèle** — la moitié non traitée.
- **Couplage qualité.** Aucune tâche ne touche les lenses/poids/scoring d'`adversarial-review-lenses` : l'économie vient de la *forme* (cache, classe, output, effort), pas d'une baisse de rigueur.
