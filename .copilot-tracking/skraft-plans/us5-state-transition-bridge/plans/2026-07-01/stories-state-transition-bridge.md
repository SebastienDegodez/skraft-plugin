<!-- markdownlint-disable-file -->
# Stories — [US] #14 State Transition Bridge (S7)
## Issue #60 · us5-state-transition-bridge · 2026-07-01

---

## Sprint Plan

### Milestone : `v0.5-state-cli-bridge`

**Objectif :** Livrer le pont CLI déterministe S7 pour `state.json` — éliminer TOOLLESS ASSERTION et UNSUPERVISED MUTATION, réduire la consommation de tokens de ~61 000 par pipeline, établir la seule porte d'écriture sûre vers l'état du pipeline SKRAFT.

### MoSCoW

| Priorité | Issue | Story | Effort | DoR |
|---|---|---|---|---|
| **Must Have** | #60 | State Transition Bridge — CLI S7 + state-machine + atomic writer | L (2–3 j) | ✅ Ready |

### Capacity Check

```
Capacité effective : 5 j × 0,7 = 3,5 j
Effort total schedulé : L = 2–3 j (médian 2,5 j)
Résultat : 2,5 ≤ 3,5 ✅
```

### Graphe de dépendances

```
#47 (CLOSED) ──┐
               └──► #60 [ce sprint] ──► #57 (sprint+1, dépend de #60)
#49 (CLOSED) ──┘

#55 (OPEN, périmètre distinct, parallélisable — non bloquant)
```

---

## User Story

**En tant qu'** orchestrateur SKRAFT,
**je veux** muter `state.json` exclusivement via `cli/state.mjs`,
**afin que** chaque transition d'état soit légale, atomique, et infalsifiable.

---

## Exemples de domaine

| # | Slug | Phase courante | Verdict | Événement | Résultat attendu |
|---|---|---|---|---|---|
| E1 | `us5-state-transition-bridge` | DISCOVER | APPROVED | `transition --to DISCUSS` | currentPhase=DISCUSS, exit=0 |
| E2 | `us5-state-transition-bridge` | DISCOVER | APPROVED | `transition --to DESIGN` | ILLEGAL_PHASE_SKIP, exit=1, state inchangé |
| E3 | `us5-state-transition-bridge` | DISCOVER | REJECTED | `transition --to DISCUSS` | VERDICT_NOT_APPROVED, exit=1, state inchangé |
| E4 | `skraft-demo` | — (absent) | — | `init` | state.json créé, currentPhase=DISCOVER, exit=0 |
| E5 | `us5-state-transition-bridge` | DISCUSS | — | `init` (2e appel) | no-op, state inchangé, exit=0 |
| E6 | `us5-state-transition-bridge` | DISCUSS | — | `record-verdict --verdict APPROVED` | verdict[DISCUSS]=APPROVED, exit=0 |
| E7 | `us5-state-transition-bridge` | DISCUSS | — | `record-artifact --path ./plans/stories.md` | artifact ajouté, existants préservés, exit=0 |
| E8 | `us5-state-transition-bridge` | — | — | `set-difficulty medium-hard` (1er) | difficulty=medium-hard, exit=0 |
| E9 | `us5-state-transition-bridge` | — | — | `set-difficulty easy` (2e) | IMMUTABLE_FIELD, exit=1, difficulty inchangé |
| E10 | `us5-state-transition-bridge` | DESIGN | — | `get --field currentPhase` | stdout="DESIGN", state inchangé, exit=0 |

---

## Critères d'acceptation (Gherkin-ready)

### AC1 — Transition légale

```gherkin
Feature: Transition légale vers la phase suivante

  Scenario: L'orchestrateur avance de DISCOVER vers DISCUSS
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And currentPhase vaut "DISCOVER"
      And le verdict de la phase "DISCOVER" est "APPROVED"
    When l'orchestrateur appelle `node cli/state.mjs transition --to DISCUSS --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 0
      And state.json indique currentPhase = "DISCUSS"
      And phasesCompleted contient "DISCOVER"
      And stdout contient un objet JSON avec les champs modifiés
      And aucun fichier temporaire résiduel n'est laissé sur le disque
```

### AC2 — Transition illégale rejetée (SEQUENTIAL_ENFORCEMENT + VERDICT_NOT_APPROVED)

```gherkin
Feature: Rejet des transitions illégales

  Scenario: Saut de phase interdit (I2 — SEQUENTIAL_ENFORCEMENT)
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And currentPhase vaut "DISCOVER"
      And le verdict de la phase "DISCOVER" est "APPROVED"
    When l'orchestrateur appelle `node cli/state.mjs transition --to DESIGN --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 1
      And stderr contient le code d'erreur "ILLEGAL_PHASE_SKIP"
      And stderr contient le message "expected DISCUSS, got DESIGN"
      And state.json est inchangé (currentPhase reste "DISCOVER")
      And aucun fichier backup n'est créé

  Scenario: Avance sans verdict APPROVED (I1 — VERDICT_NOT_APPROVED)
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And currentPhase vaut "DISCOVER"
      And le verdict de la phase "DISCOVER" est "REJECTED"
    When l'orchestrateur appelle `node cli/state.mjs transition --to DISCUSS --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 1
      And stderr contient le code d'erreur "VERDICT_NOT_APPROVED"
      And state.json est inchangé (currentPhase reste "DISCOVER")
      And aucun fichier backup n'est créé
```

### AC3 — INIT idempotent

```gherkin
Feature: Initialisation idempotente de state.json

  Scenario: Création initiale — fichier absent (I9 branche A)
    Given aucun state.json n'existe pour le slug "skraft-demo"
    When l'orchestrateur appelle `node cli/state.mjs init --slug skraft-demo`
    Then la commande se termine avec exit code 0
      And state.json est créé avec currentPhase = "DISCOVER"
      And retryCount est initialisé à {}
      And phasesCompleted est initialisé à []
      And difficulty est null

  Scenario: Appel répété — fichier déjà présent (I9 branche B — no-op)
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And currentPhase vaut "DISCUSS"
    When l'orchestrateur appelle `node cli/state.mjs init --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 0
      And state.json est inchangé (currentPhase reste "DISCUSS")
      And aucun backup n'est créé
```

### AC4 — Écriture atomique + backup rotatif

```gherkin
Feature: Écriture atomique avec rotation des backups

  Scenario: Rotation backup ≤ 3 fichiers .bak
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And 3 fichiers backup existent : state.json.bak.100, state.json.bak.200, state.json.bak.300
    When une opération d'écriture réussit (record-verdict --verdict APPROVED)
    Then state.json contient le nouvel état
      And si une interruption survient pendant l'écriture, state.json reste identique à son état pré-opération (aucune donnée partielle observable)
      And un nouveau backup state.json.bak.{ts_new} est créé
      And le backup le plus ancien (state.json.bak.100) est supprimé
      And exactement 3 fichiers backup subsistent
      And aucun fichier temporaire résiduel n'est présent

  Scenario: Corruption détectée — snapshot avant écrasement
    Given un state.json corrompu (JSON invalide) existe
    When l'orchestrateur appelle `node cli/state.mjs transition --to DISCUSS --slug skraft-demo`
    Then la commande se termine avec exit code 2
      And stderr contient le code d'erreur "CORRUPTED_STATE"
      And state.json est snapshoté vers "state.json.corrupted.{ts}"
      And aucune écriture partielle n'a eu lieu
```

### AC5 — Record-verdict

```gherkin
Feature: Enregistrement du verdict d'une phase

  Scenario: Verdict APPROVED enregistré pour DISCUSS
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And currentPhase vaut "DISCUSS"
      And aucun verdict n'est enregistré pour "DISCUSS"
    When l'orchestrateur appelle `node cli/state.mjs record-verdict --phase DISCUSS --verdict APPROVED --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 0
      And state.json indique verdict["DISCUSS"] = "APPROVED"
      And currentPhase reste "DISCUSS" (record-verdict n'avance pas la phase)
```

### AC6 — Record-artifact (append-only)

```gherkin
Feature: Enregistrement d'artefacts de phase (append-only — I5)

  Scenario: Ajout d'un artefact sans perte des existants
    Given phaseArtifacts["DISCUSS"] contient 1 chemin
    When l'orchestrateur appelle `node cli/state.mjs record-artifact --phase DISCUSS --path "plans/2026-07-01/ac-draft.md" --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 0
      And phaseArtifacts["DISCUSS"] contient les deux chemins
      And aucun artefact existant n'est supprimé (I5 append-only)

  Scenario: Tentative de réduction rejetée (test domaine pur — hors couche CLI)
    # Ce scénario est un test unitaire de domain/state-machine.mjs, pas un test CLI
    Given un state.json valide avec 2 artefacts dans phaseArtifacts["DISCUSS"]
    When state-machine.applyTransition reçoit un événement RECORD_ARTIFACT qui tente de remplacer phaseArtifacts["DISCUSS"] par une liste plus courte
    Then la machine d'état retourne un résultat d'échec avec code "APPEND_ONLY_VIOLATION" (exit code 1 en CLI)
      And state.json est inchangé
```

### AC7 — Set-difficulty posée une seule fois

```gherkin
Feature: Champ difficulty immuable après première écriture (I7)

  Scenario: Première écriture de difficulty réussit
    Given un state.json avec difficulty = null
    When l'orchestrateur appelle `node cli/state.mjs set-difficulty --value medium-hard --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 0
      And state.json indique difficulty = "medium-hard"

  Scenario: Tentative de re-définition rejetée (IMMUTABLE_FIELD)
    Given un state.json avec difficulty = "medium-hard"
    When l'orchestrateur appelle `node cli/state.mjs set-difficulty --value easy --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 1
      And stderr contient le code d'erreur "IMMUTABLE_FIELD"
      And state.json indique difficulty = "medium-hard" (inchangé)
```

### AC8 — Get champ individuel (lecture sans écriture)

```gherkin
Feature: Lecture ciblée d'un champ sans effet de bord

  Scenario: Lecture du champ currentPhase retourne uniquement la valeur scalaire
    Given currentPhase vaut "DESIGN" dans state.json
    When l'orchestrateur appelle `node cli/state.mjs get --field currentPhase --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 0
      And stdout contient uniquement "DESIGN" (valeur brute, pas le JSON complet)
      And state.json est inchangé
      And aucun fichier backup n'est créé
```

### AC9 — Incr-retry plafonné (I3 — RETRY_EXHAUSTED)

```gherkin
Feature: Plafond de retries par phase (I3)

  Scenario: incr-retry au-delà de maxRetriesPerPhase est rejeté
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And retryCount["DISCUSS"] vaut 2 (= maxRetriesPerPhase)
    When l'orchestrateur appelle `node cli/state.mjs incr-retry --phase DISCUSS --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 1
      And stderr contient le code d'erreur "RETRY_EXHAUSTED"
      And state.json est inchangé (retryCount["DISCUSS"] reste 2)

  Scenario: incr-retry sous le plafond réussit
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And retryCount["DISCUSS"] vaut 1
    When l'orchestrateur appelle `node cli/state.mjs incr-retry --phase DISCUSS --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 0
      And state.json indique retryCount["DISCUSS"] = 2
```

### AC10 — Phase DONE terminale (I8 — TERMINAL_STATE)

```gherkin
Feature: Toute mutation sur une pipeline terminée est rejetée (I8)

  Scenario: Transition rejetée après DONE
    Given un state.json existe pour le slug "us5-state-transition-bridge"
      And currentPhase vaut "DONE"
    When l'orchestrateur appelle `node cli/state.mjs transition --to DISCOVER --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 1
      And stderr contient le code d'erreur "TERMINAL_STATE"
      And state.json est inchangé (currentPhase reste "DONE")

  Scenario: record-verdict rejeté après DONE
    Given currentPhase vaut "DONE"
    When l'orchestrateur appelle `node cli/state.mjs record-verdict --phase DONE --verdict APPROVED --slug us5-state-transition-bridge`
    Then la commande se termine avec exit code 1
      And stderr contient le code d'erreur "TERMINAL_STATE"
```

### AC11 — Invariants append-only — phasesCompleted (I4) + reviewArtifacts (I6)

```gherkin
Feature: Les tableaux append-only phasesCompleted et reviewArtifacts ne peuvent pas être réduits (test domaine pur)

  Scenario: phasesCompleted append-only (I4 — test unitaire domain/state-machine)
    Given un state.json valide avec phasesCompleted = ["DISCOVER", "DISCUSS"]
    When state-machine.applyTransition reçoit un événement qui tente de réduire phasesCompleted à ["DISCOVER"]
    Then la machine d'état retourne un résultat d'échec avec code "APPEND_ONLY_VIOLATION" (exit code 1 en CLI)
      And state.json est inchangé

  Scenario: reviewArtifacts append-only (I6 — test unitaire domain/state-machine)
    Given un state.json valide avec reviewArtifacts = ["reviews/2026-07-01/discover-review-1.md"]
    When state-machine.applyTransition reçoit un événement qui tente de réduire reviewArtifacts à []
    Then la machine d'état retourne un résultat d'échec avec code "APPEND_ONLY_VIOLATION" (exit code 1 en CLI)
      And state.json est inchangé
```

### AC12 — Coercion state.json pré-existant (compatibilité ascendante)

```gherkin
Feature: applyEvent coërce les champs manquants d'un state.json antérieur à #60

  Scenario: state.json sans retryCount ni phasesCompleted — coercion automatique
    Given un state.json pré-existant (créé avant #60) sans les champs "retryCount" et "phasesCompleted"
      And currentPhase vaut "DISCOVER"
    When l'orchestrateur appelle `node cli/state.mjs record-verdict --phase DISCOVER --verdict APPROVED --slug us5-legacy`
    Then la commande se termine avec exit code 0
      And state.json contient retryCount initialisé à {} (champs coërcsés)
      And state.json contient phasesCompleted initialisé à [] (champ coërcsé)
      And state.json indique verdict["DISCOVER"] = "APPROVED"
```

---

## Definition of Ready (DoR)

- [x] **I1** — Énoncé du problème : éliminer TOOLLESS ASSERTION + UNSUPERVISED MUTATION
- [x] **I2** — Persona : orchestrateur SKRAFT (rôle précis)
- [x] **I3** — 10 exemples de domaine (E1–E10) avec vraies valeurs
- [x] **I4** — 12 ACs, 22 scénarios Gherkin couvrant invariants I1, I2, I3, I5, I7, I8, I9 (CLI) + I4, I6 (test domaine)
- [x] **I5** — Chaque AC traceable à E1–E10
- [x] **I6** — L = 2–3 j ≤ capacité effective 3,5 j
- [x] **I7** — Notes techniques : 10 points d'attention DESIGN/DISTILL
- [x] **I8** — Dépendances : #47 ✅ · #49 ✅ · #57 OPEN sprint+1 · #55 OPEN parallèle

**Verdict DoR : ✅ READY FOR DESIGN**

> **Plan de découpe implicite (AC1–AC12) :** 9 scénarios CLI acceptance tests (AC1–AC10 hors AC6-S2, AC12, ~1,5 j) + 3 scénarios domain unit tests (AC6-S2, AC11, ~0,5 j) = deux boucles TDD distinctes. Total : L = 2 j (médian).

---

## Notes techniques

1. **Breaking change `json-state-reader.write()`** : supprimer + mettre à jour tests dans le même commit.
2. **Atomicité POSIX uniquement** : `rename(tmp, state.json)` non garanti Windows — documenter en JSDoc.
3. **Rotation backup ≤ 3** : readdir + tri chronologique + unlink du plus ancien.
4. **ENOENT auto-init** : `applyEvent` crée l'état par défaut si absent, puis rejoue l'événement.
5. **`nextPhaseAfter()` extraction** : vers `domain/phase-order.mjs` + tests régression `pipeline-policy.mjs` AVANT.
6. **HVE skip-phases** : `nextPhaseAfter` bypasse automatiquement — pas de saut au-delà de la prochaine non-skippée.
7. **Exit codes** : 0=success · 1=validation error · 2=IO error · 3=schema invalid.
8. **Stryker additif** : append sur `mutate` array — ne pas remplacer le glob.
9. **Risque résiduel #57** : UNSUPERVISED MUTATION possible entre #60 et #57 — sprint+1.
10. **Instructions orchestrateur** : `read_file(state.json)` → `cli state get --field <field>` — mise à jour atomique avec CLI.

## Codes d'erreur machine d'état

| Invariant | Code | Déclencheur |
|---|---|---|
| I1 | `VERDICT_NOT_APPROVED` | ADVANCE sans verdict APPROVED |
| I2 | `ILLEGAL_PHASE_SKIP` | ADVANCE vers phase non-séquentielle |
| I3 | `RETRY_EXHAUSTED` | INCR_RETRY au-delà du plafond |
| I4/I5/I6 | `APPEND_ONLY_VIOLATION` | Réduction d'une liste append-only |
| I7 | `IMMUTABLE_FIELD` | SET_DIFFICULTY sur champ déjà posé |
| I8 | `TERMINAL_STATE` | Toute mutation après DONE |
| I9 | — | INIT idempotent — jamais d'erreur |

## Dépendances

| Issue | Rôle | Statut |
|---|---|---|
| #47 | Fournit `json-state-reader`, ports, `result.mjs` | ✅ CLOSED |
| #49 | Fournit `state-schema.mjs`, `pipeline-policy.mjs` | ✅ CLOSED |
| #57 | Dépend de #60 ; ferme la porte directe — sprint+1 | OPEN (non bloquant) |
| #55 | Périmètre distinct — parallélisable | OPEN (non bloquant) |
