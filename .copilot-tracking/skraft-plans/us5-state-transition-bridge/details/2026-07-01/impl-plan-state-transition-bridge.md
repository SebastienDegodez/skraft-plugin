<!-- markdownlint-disable-file -->
# Plan d'implémentation — State Transition Bridge
## us5-state-transition-bridge · 2026-07-01 · Issue #60

---

## Coverage Matrix (test-design-mandates)

| Scénario | Use Case Boundary | Layer | Double Type | Walking Skeleton | Priorité |
|---|---|---|---|---|---|
| AC1 — Transition légale DISCOVER→DISCUSS | `state-service.applyEvent` | Application | Real tmpdir (I/O integration) | A | P1 |
| AC2a — ILLEGAL_PHASE_SKIP | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC2b — VERDICT_NOT_APPROVED | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC3a — Init crée le fichier | `state-service.init` | Application | Real tmpdir | A | P1 |
| AC3b — Init idempotente | `state-service.init` | Application | Real tmpdir | A | P1 |
| AC4a — Rotation backup ≤3 | `state-service.applyEvent` (atomicité FS comportement sous-jacent) | Application | Real tmpdir | A | P1 |
| AC4b — Corruption détectée | `state-service.applyEvent` (CORRUPTED_STATE remontté par le writer) | Application | Real tmpdir | A | P2 |
| AC5 — Record-verdict sans avance | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC6a — Record-artifact append | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC6b — APPEND_ONLY_VIOLATION (domain) | `applyTransition` | Domain | None (pure) | D | P2 |
| AC7a — Set-difficulty 1ère écriture | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC7b — IMMUTABLE_FIELD | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC8 — Get champ ciblé | `state-service.get` | Application | Real tmpdir | A | P1 |
| AC9a — RETRY_EXHAUSTED | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC9b — incr-retry succès | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC10a — TERMINAL_STATE (transition) | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC10b — TERMINAL_STATE (record-verdict) | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |
| AC11a — phasesCompleted append-only (domain) | `applyTransition` | Domain | None (pure) | D | P2 |
| AC11b — reviewArtifacts append-only (domain) | `applyTransition` | Domain | None (pure) | D | P2 |
| AC12 — Coercion pre-existing state | `state-service.applyEvent` | Application | Real tmpdir | A | P1 |

**Walking Skeleton strategies :**
- **A** — acceptance via `createStateService` (Application layer, real tmpdir) — default pour CLI acceptance tests
- **B** — acceptance via `createJsonStateWriter` (Infrastructure layer, real tmpdir) — pour AC4 (atomicité)
- **D** — unit pur via `applyTransition(state, event)` — pour AC6b, AC11a, AC11b (domaine pur, aucune infrastructure)

**Note Mandate 4 (Domain Test Extraction) :** Les scénarios @domain-only (AC6b, AC11a, AC11b) sont des cas de domaine pur non atteignables via CLI (APPEND_ONLY_VIOLATION sur `phasesCompleted`/`reviewArtifacts` n'a pas de sous-commande CLI directe). Extraction justifiée — Gate a: `branch_unreachable_via_AC`. Tous les autres invariants passent via le CLI.

---

## Ordre d'implémentation (outside-in, RED first)

### Étape 1 — `domain/pipeline-policy.mjs` [MODIFY]
- Fichier : `plugins/src/domain/pipeline-policy.mjs`
- Action : **MODIFY**
- Changement : exporter `nextPhaseAfter` (actuellement `const` privé ligne 7)
- Dépendances : `domain/result.mjs` (existant, non modifié)
- Tests RED à écrire : `tests/skraft-framework/state-transition-bridge.acceptance.test.mjs` (AC2a)
- Scénarios Gherkin couverts : AC2a (ILLEGAL_PHASE_SKIP — `nextPhaseAfter` requis par `applyTransition`)
- Notes : export pur, aucun comportement modifié — tests régression `pipeline-policy.unit.test.mjs` doivent rester verts AVANT ce commit

### Étape 2 — `domain/state-schema.mjs` [MODIFY]
- Fichier : `plugins/src/domain/state-schema.mjs`
- Action : **MODIFY**
- Changement : ajouter `validatePipelineState(raw)` — valide le schéma orchestrateur `{ currentPhase, retryCount, phasesCompleted, verdicts, phaseArtifacts, reviewArtifacts, difficulty?, userPreferences? }`
- Dépendances : aucune (domaine pur)
- Tests RED à écrire : `state-transition-bridge.acceptance.test.mjs` (AC12 — coercion via validation)
- Scénarios Gherkin couverts : AC12 (coercion pre-existing), AC2a/AC2b (validation avant transition)
- Notes : `validateState()` existante INCHANGÉE — deux validators coexistent pour deux formes d'état différentes

### Étape 3 — `domain/state-machine.mjs` [NEW]
- Fichier : `plugins/src/domain/state-machine.mjs`
- Action : **NEW**
- Signature : `export const applyTransition = (currentState, event) => Result<FrozenState>`
- Dépendances : `domain/result.mjs`, `domain/state-schema.mjs` (`validatePipelineState`), `domain/pipeline-policy.mjs` (`nextPhaseAfter`)
- Tests RED à écrire : `state-transition-bridge.acceptance.test.mjs` (AC6b, AC11a, AC11b — @domain-only)
- Scénarios Gherkin couverts : AC1, AC2a, AC2b, AC5, AC6, AC7, AC9, AC10, AC11 (via service), AC6b/AC11a/AC11b (directs)
- Notes : module pur sans IO. `phaseOrder` et `maxRetriesPerPhase` lus depuis `currentState.userPreferences` (pas d'injection externe). Invariants I1–I8 tous dans ce module.

### Étape 4 — `ports/infrastructure/state-writer.mjs` [NEW]
- Fichier : `plugins/src/ports/infrastructure/state-writer.mjs`
- Action : **NEW**
- Contenu : constante `STATE_WRITER_PORT` + contrat duck-typed `{ write(projectSlug, state): Promise<Result<void>> }`
- Dépendances : aucune
- Tests RED à écrire : (couvert indirectement via state-service tests)
- Scénarios Gherkin couverts : (infrastructure — couverture indirecte)
- Notes : port interface only, pas de logique

### Étape 5 — `adapters/infrastructure/state/json-state-writer.mjs` [NEW]
- Fichier : `plugins/src/adapters/infrastructure/state/json-state-writer.mjs`
- Action : **NEW**
- Signature : `export const createJsonStateWriter = (basePath) => ({ write: async (projectSlug, state) => Result<void> })`
- Protocole atomique : `tmp write → backup current (bak.{ts}) → rotate >3 → rename tmp → state.json`
- Dépendances : `node:fs/promises`, `node:path`
- Tests RED à écrire : `state-transition-bridge.acceptance.test.mjs` (AC4a, AC4b)
- Scénarios Gherkin couverts : AC4a (rotation backup), AC4b (CORRUPTED_STATE)
- Notes : contrainte cross-platform Windows+macOS — source et destination sur même volume (`EXDEV` → `Err(IO_ERROR)`). Fichier tmp JAMAIS laissé sur disque après succès ou échec avant rename.

### Étape 6 — `adapters/infrastructure/json-state-reader.mjs` [MODIFY]
- Fichier : `plugins/src/adapters/infrastructure/json-state-reader.mjs`
- Action : **MODIFY**
- Changement : supprimer `write()` — garder uniquement `read()`
- Dépendances : `node:fs/promises`, `node:path` (existants)
- Tests RED à écrire : migration test `infrastructure-adapters.test.mjs` (supprimer les tests de `write()`)
- Scénarios Gherkin couverts : (breaking change — ne couvre pas de scenario directement)
- Notes : **BREAKING CHANGE** — tous les appelants existants utilisent `read()` uniquement (vérifiés dans contracts). Le test `infrastructure-adapters.test.mjs` doit être mis à jour dans le MÊME commit.

### Étape 7 — `application/state-service.mjs` [NEW]
- Fichier : `plugins/src/application/state-service.mjs`
- Action : **NEW**
- Signature : `export const createStateService = ({ stateReader, stateWriter }) => ({ init, applyEvent, get })`
- Dépendances : `STATE_READER_PORT`, `STATE_WRITER_PORT`, `domain/state-machine.mjs`
- Tests RED à écrire : `state-transition-bridge.acceptance.test.mjs` (AC1–AC3, AC5–AC10, AC12)
- Scénarios Gherkin couverts : AC1, AC2a, AC2b, AC3a, AC3b, AC5, AC6a, AC7a, AC7b, AC8, AC9a, AC9b, AC10a, AC10b, AC12
- Notes : `applyEvent` gère ENOENT → auto-init + replay. `get` : lecture seule sans écriture ni backup.

### Étape 8 — `cli/state.mjs` [NEW]
- Fichier : `plugins/src/cli/state.mjs`
- Action : **NEW**
- Sous-commandes : `init`, `transition`, `record-verdict`, `record-artifact`, `record-review-artifact`, `set-difficulty`, `incr-retry`, `get`
- Dépendances : `application/state-service.mjs`, `adapters/infrastructure/json-state-reader.mjs`, `adapters/infrastructure/state/json-state-writer.mjs`
- Tests RED à écrire : `state-transition-bridge.acceptance.test.mjs` (scénarios CLI — AC1–AC10, AC12)
- Scénarios Gherkin couverts : tous les scénarios @happy-path, @edge-case, @error-case
- Notes : `basePath` = `SKRAFT_TRACKING_ROOT` env var OU `.copilot-tracking/skraft-plans` relatif à `process.cwd()`. Exit codes : 0=success · 1=validation error · 2=IO error · 3=schema invalid.

---

## Ordre des modules (résumé)

| # | Module | Raison de l'ordre |
|---|---|---|
| 1 | `domain/pipeline-policy.mjs` [MODIFY] | Bloquant — `nextPhaseAfter` requis par `state-machine` |
| 2 | `domain/state-schema.mjs` [MODIFY] | Bloquant — `validatePipelineState` requis par `state-machine` |
| 3 | `domain/state-machine.mjs` [NEW] | Domaine pur — requis par `state-service` |
| 4 | `ports/infrastructure/state-writer.mjs` [NEW] | Port — requis par `state-service` et `cli` |
| 5 | `adapters/infrastructure/state/json-state-writer.mjs` [NEW] | Implémente le port — requis par `cli` |
| 6 | `adapters/infrastructure/json-state-reader.mjs` [MODIFY] | Breaking change — supprimer `write()` |
| 7 | `application/state-service.mjs` [NEW] | Use case — orchestre domain + ports |
| 8 | `cli/state.mjs` [NEW] | Composition root — entry point final |

---

## Contraintes cross-platform

**Windows + macOS (hard requirement ADR-009) :**
- `fs.rename(tmp, dest)` sur Node.js : atomique POSIX sur macOS/Linux, `MoveFileExW` sur Windows
- Le fichier tmp et `state.json` DOIVENT être sur le même volume (`basePath` identique)
- Erreur `EXDEV` (cross-device) → `Err({ code: 'IO_ERROR', reason: 'cross-device rename' })`
- Jamais `writeFile(path, content)` direct — non-atomique sur les deux plateformes
- Pas de `fs.writeFile` → utiliser `tmp write + rename` uniquement

---

## Modifications breaking change

| Module | Changement | Impact |
|---|---|---|
| `adapters/infrastructure/json-state-reader.mjs` | Suppression `write()` | Tests mocking `write()` dans `infrastructure-adapters.test.mjs` à migrer dans le MÊME commit |
| `domain/pipeline-policy.mjs` | Export de `nextPhaseAfter` | Pas de breaking change — ajout d'export seulement |

---

## Stryker additif

Modules à **ajouter** au tableau `mutate` dans `plugins/stryker.config.mjs` :

```js
// Ajouter ces entrées au tableau mutate existant (additif — ne pas remplacer)
'plugins/src/domain/state-machine.mjs',
'plugins/src/domain/state-schema.mjs',        // nouvelle fonction validatePipelineState
'plugins/src/adapters/infrastructure/state/json-state-writer.mjs',
'plugins/src/application/state-service.mjs',
```

> `domain/pipeline-policy.mjs` est déjà dans `mutate` si présent ; vérifier avant d'ajouter.
> Le glob `testFiles: ['tests/skraft-framework/*.test.mjs']` capture automatiquement `state-transition-bridge.acceptance.test.mjs` — aucune modification du glob.
> Les seuils (`thresholds`) ne sont PAS modifiés sans instruction explicite.
