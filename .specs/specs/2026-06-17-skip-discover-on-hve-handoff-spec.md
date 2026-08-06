# Spec — Skip DISCOVER sur handoff HVE (Entry Point v1)

> **Statut spec :** v1 — design figé avant finalisation docs.

## Cycle de vie de cette spec

Document **de design**. Le code des agents/skills/instructions est modifié dans la même branche (`feat/skip-discover-on-hve-handoff`) ; cette spec fige le contrat. Les pages `docs/site/**` dérivées sont régénérées par l'orchestrateur de docs, pas éditées à la main.

## Contexte

Quand un projet arrive depuis **HVE**, il porte souvent déjà :

- une hiérarchie de backlog (Epic / Feature / User Story) produite par `ado-prd-to-wit`, `jira-prd-to-wit`, ou les planners Security / RAI / SSSC ;
- un **sprint pré-calculé** (`ado-backlog-sprint.instructions.md` → `sprint-plan.md` avec capacité, couverture, dépendances).

Or la phase **DISCOVER** de SKRAFT (`backlog-discoverer` + `backlog-discoverer-reviewer`) exécute en **Phase 5 « Sprint Proposal »** un re-triage des issues GitHub puis **re-décide un sprint** (capacité × 0.7, override P0, MoSCoW via `sprint-planning`). C'est un **doublon** du travail HVE.

Le garde-fou prévu — l'**Axe 1 « Entry Point »** du skill `skraft-difficulty-routing` — était **spécifié mais inopérant** :

1. le champ `entryPoint` **n'existait pas** dans le schéma d'état (`skraft-state.instructions.md` ne définissait que `entryMode`) ;
2. il était évalué **à la sortie de DISCOVER** — trop tard pour sauter DISCOVER ;
3. l'orchestrateur ne s'y branchait jamais : les 5 phases tournaient toujours.

## Objectifs

1. **Détecter** un handoff HVE complet (backlog hiérarchisé **ET** sprint), sous deux formes : issues GitHub déjà triées+jalonnées, ou artefacts markdown ADO/Jira.
2. **Sauter complètement DISCOVER** quand le handoff est confirmé, et entrer directement en DISCUSS.
3. **Ne jamais re-décider** le sprint ni re-prioriser : le sprint HVE est hérité tel quel.
4. Évaluer l'Entry Point **au démarrage du pipeline (Phase 0)**, avant DISCOVER.
5. Conserver tous les invariants immuables (TDD, Clean Architecture, chemins datés HVE, schéma `state.json`, reviewers read-only, pas de secrets).

## Hors périmètre

- Skip générique de **n'importe quelle** phase (DESIGN/DISTILL). v1 ne cible que DISCOVER. L'Axe 1 complet reste futur.
- Création d'un type « Enabler » côté HVE (mapping : Feature HVE ≈ Enabler).
- Migration d'états `state.json` existants.

## Décisions retenues

| Décision | Choix | Justification |
|---|---|---|
| Forme du handoff supportée | Les **deux** (issues GitHub jalonnées **et** `sprint-plan.md` ADO/Jira) | Couvre les sorties HVE réelles |
| Comportement DISCOVER | **Skip total** → DISCUSS direct | Élimine le doublon de sprint |
| Substitut au gate DISCUSS | **Générer** un artefact d'ingestion (`triage-ingest-{date}.md` + `sprint-proposal.md`) | Traçabilité + faible couplage ; le glob `triage-*.md` du gate `backlog-planner` passe sans modification structurelle |
| Déclenchement du skip | **Confirmation utilisateur** une fois | La détection ne saute jamais en silence |

## Design

### 1. Schéma d'état — champ `entryPoint`

Ajouté à `state.json` (cf. `plugins/skraft-framework/instructions/skraft-state.instructions.md`) :

```json
"entryPoint": {
  "skipPhases": ["DISCOVER"],
  "handoffSource": "hve-ado | hve-jira | hve-github | null",
  "handoffArtifacts": ["research/2026-06-17/triage-ingest-2026-06-17.md"]
}
```

Défaut : `{ "skipPhases": [], "handoffSource": null, "handoffArtifacts": [] }` (toutes les phases tournent).

### 2. Détection du handoff (skill `skraft-difficulty-routing`)

| Forme | Signal | `handoffSource` |
|---|---|---|
| A — Issues GitHub triées + jalonnées | Issues ouvertes portant labels `type/*` + priorité `P0–P3` + effort **et** un milestone/sprint, sans artefact DISCOVER en attente | `hve-github` |
| B — Artefact sprint ADO | `sprint-plan.md` sous `.copilot-tracking/workitems/sprint/{iteration}/` avec table capacité/couverture | `hve-ado` |
| B — Artefact sprint Jira | Artefact de sprint planifié sous `.copilot-tracking/jira-issues/**` avec hiérarchie Epic/Feature/Story | `hve-jira` |

Un handoff n'est **confirmé** que s'il porte **à la fois** une hiérarchie de backlog **et** un périmètre de sprint. Backlog sans sprint, ou sprint sans items triés ⇒ DISCOVER tourne normalement.

### 3. Gate de confirmation

La détection ne saute jamais automatiquement. L'orchestrateur présente le handoff une fois et requiert un choix explicite : `skip DISCOVER` ou `run DISCOVER anyway`.

### 4. Protocole d'ingestion (uniquement si DISCOVER est sauté)

Le skill mappe le handoff vers les artefacts attendus par DISCUSS, **sans** re-triage ni re-priorisation :

1. Backlog → `research/{date}/triage-ingest-{date}.md` : titre, type, **priorité HVE conservée**, effort, référence source (work item ID / numéro d'issue) ; en-tête `source: {handoffSource}`, `ingested: true`.
2. Sprint → `research/{date}/sprint-proposal.md` : périmètre HVE copié verbatim (items ordonnés, capacité, dépendances). Note : `Sprint inherited from {handoffSource}; not recomputed by SKRAFT.`
3. Sanitisation des chemins internes (convention HVE).
4. Enregistrement des chemins dans `state.json::phaseArtifacts.DISCOVER` et `entryPoint.handoffArtifacts`.

### 5. Orchestrateur — Phase 0

Nouvelle étape de détection (en plus du scan `neighborPlanners`), uniquement sur pipeline neuf (`phasesCompleted` vide, `currentPhase == "DISCOVER"`). Sur **skip DISCOVER** : écrire `entryPoint`, lancer l'ingestion, évaluer **aussi** les axes depth/difficulty maintenant (sinon `difficulty` reste `null`), positionner `currentPhase = "DISCUSS"`, ajouter `DISCOVER` à `phasesCompleted`. Avant tout dispatch, l'orchestrateur ignore toute phase listée dans `entryPoint.skipPhases`.

### 6. DISCUSS — `backlog-planner`

Le gate « PRIOR PHASE READING » accepte `triage-ingest-*.md` (couvert par le glob `triage-*.md`). Variante ingérée : priorités et sprint **hérités de HVE, non recalculés** — l'agent affine en stories sans re-prioriser ni réordonner.

## Invariants conservés

TDD ≥ Red-Green, frontières Clean Architecture, intégrité des tests, conformité schéma `state.json`, chemins datés HVE, reviewers read-only, aucun secret commité. Les artefacts d'ingestion respectent ces invariants.
