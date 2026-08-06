# Plan — Skip DISCOVER sur handoff HVE (Entry Point v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Éviter le doublon de sprint entre HVE et SKRAFT. Quand HVE a déjà fourni un backlog hiérarchisé **et** un sprint pré-calculé, SKRAFT **saute complètement DISCOVER** (pas de re-triage, pas de seconde proposition de sprint) et entre directement en DISCUSS via un artefact d'ingestion.

**Architecture :** On rend opérationnel l'**Axe 1 « Entry Point »** du skill `skraft-difficulty-routing`, jusqu'ici spécifié mais inerte. Le champ `entryPoint` est ajouté au schéma `state.json`. La détection du handoff (2 formes) et le protocole d'ingestion vivent dans le skill ; l'orchestrateur évalue l'Entry Point en **Phase 0** (avant DISCOVER), demande confirmation, écrit les artefacts substituts (`triage-ingest-{date}.md` + `sprint-proposal.md`) et positionne `currentPhase = DISCUSS`. Le gate de `backlog-planner` accepte l'artefact ingéré sans modification structurelle (glob `triage-*.md`).

**Tech Stack :** Markdown agentique (agents `.agent.md`, skills `SKILL.md`, instructions `.instructions.md`), schéma `state.json` (JSON). Pas de nouvelle dépendance runtime.

**Spec source :** [.spec/2026-06-17-skip-discover-on-hve-handoff-spec.md](2026-06-17-skip-discover-on-hve-handoff-spec.md).

**Branche de travail :** `feat/skip-discover-on-hve-handoff`.

---

## File Structure

**Modifiés :**

- `plugins/skraft-framework/instructions/skraft-state.instructions.md` — champ `entryPoint` (schéma + sémantique + création).
- `plugins/skraft-framework/skills/skraft-difficulty-routing/SKILL.md` — détection handoff (2 formes), gate de confirmation, protocole d'ingestion, protocole de sortie.
- `plugins/skraft-framework/agents/skraft-orchestrator.agent.md` — Phase 0 détection + branchement skip, routing 3-axes en deux temps, protocole d'exécution qui ignore `skipPhases`.
- `plugins/skraft-framework/agents/backlog-planner.agent.md` — acceptation de `triage-ingest-*.md`, sémantique d'héritage (pas de re-priorisation).

**Créés :**

- `.spec/2026-06-17-skip-discover-on-hve-handoff-spec.md`
- `.spec/2026-06-17-skip-discover-on-hve-handoff-plan.md`

---

## Task A : Schéma d'état — champ `entryPoint`

- [x] Ajouter `entryPoint { skipPhases, handoffSource, handoffArtifacts }` au bloc schéma JSON.
- [x] Ajouter la sémantique du champ (évaluation Phase 0, défaut vide, lien avec l'ingestion).
- [x] Ajuster la section « State creation » (init `entryPoint`, `currentPhase` peut valoir `DISCUSS` si DISCOVER sauté, `difficulty` assigné au démarrage si skip).

## Task B : Skill `skraft-difficulty-routing`

- [x] Réécrire l'Axe 1 « Entry Point » : évaluation **au démarrage** (et non plus à la sortie de DISCOVER).
- [x] Table de détection des signaux handoff (formes A et B, mapping `handoffSource`).
- [x] Critère de confirmation (backlog **ET** sprint) + gate de confirmation utilisateur.
- [x] Protocole d'ingestion (mapping backlog → `triage-ingest`, sprint → `sprint-proposal`, sanitisation, enregistrement état).
- [x] Protocole de sortie mis à jour (écrire `entryPoint`, vérifier les artefacts avant `DISCUSS`, checklist emoji avec phase sautée).
- [x] Frontmatter `description` mise à jour.

## Task C : Orchestrateur

- [x] Phase 0 : étape de détection handoff (pipeline neuf uniquement) + branchement skip/ingestion + évaluation depth/difficulty au démarrage.
- [x] Résumé de reprise enrichi (`Entry point: DISCOVER skipped (handoff: …)`).
- [x] Section « Difficulty + depth-tier routing » : routing en deux temps.
- [x] Protocole d'exécution : ignorer toute phase de `entryPoint.skipPhases`.
- [x] Note « Skill usage » : skill chargé au démarrage **et** à la sortie de DISCOVER.

## Task D : `backlog-planner` (DISCUSS)

- [x] Phase RECEIVE : variante handoff ingéré (`triage-ingest-{date}.md`, priorités/sprint hérités, pas de recalcul).
- [x] PRIOR PHASE GATE : accepter `triage-ingest-*.md`.
- [x] Frontmatter `inputs.context` : ajout de `triage-ingest-{date}.md`.

## Task E : Documentation `docs/site/**` (FR + EN)  — RESTANT

- [ ] Mettre à jour la page éditoriale `docs/site/fr/explanation/concepts.md` (§ Routing 3 axes) : Entry Point évalué **au démarrage** + capacité de skip DISCOVER sur handoff HVE.
- [ ] Mettre à jour la page éditoriale équivalente EN (parité obligatoire).
- [ ] Régénérer les pages **dérivées** `reference/` via l'orchestrateur de docs (ne pas éditer à la main).

## Task F : Vérification  — RESTANT

- [ ] `node scripts/scan-drift.mjs` — aucune dérive doc/code après ajout `entryPoint`.
- [ ] `node scripts/lint-nav.mjs` + `node scripts/check-citations.mjs` — parité FR/EN et liens.
- [ ] Eval `evals/skraft-docs-orchestrator/` si elle couvre l'orchestration.
- [ ] Test manuel : état avec `sprint-plan.md` HVE présent ⇒ skip DISCOVER, `triage-ingest.md` généré, DISCUSS démarre sans halt.

---

## Notes de revue

- **Risque héritage silencieux** : si l'ingestion copie un sprint HVE incohérent, SKRAFT le propage. Mitigation : l'en-tête `ingested: true` + la note « not recomputed » rendent l'héritage explicite et auditable par les reviewers aval.
- **Cohérence `difficulty`** : impératif d'évaluer depth/difficulty au démarrage quand DISCOVER est sauté, sinon `difficulty = null` casse le modèle d'exécution DELIVER. Couvert par Task C.
