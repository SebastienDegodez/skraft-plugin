# Roadmap — skraft-framework

Cette page liste les **13 user stories** du framework de garde-fous déterministes,
avec leur gain, statut et milestone.

> **Mise à jour :** quand une US est livrée, passez son statut à ✅ Livré
> **et** cochez la case dans `plugins/README.md`.

## 1. Vue d'ensemble

| US | Titre | Gain principal | Statut | Milestone |
|---|---|---|---|---|
| [US1](#us1) | Fondation Clean Architecture | `gain:reliability` | ✅ Livré | Phase 1 — MVP |
| [US2](#us2) | Générateur de config data-driven | `gain:anti-drift` | ✅ Livré | Phase 1 — MVP |
| [US3](#us3) | G1 garde d'ordre de dispatch | `gain:anti-drift` | ✅ Livré | Phase 1 — MVP |
| [US4](#us4) | G2/G3 forçage skills + audit | `gain:anti-drift` | ✅ Livré | Phase 1 — MVP |
| [US5](#us5) | Manifests hooks Copilot + Claude | `gain:reliability` | ✅ Livré | Phase 1 — MVP |
| [US6](#us6) | Tests boundary-to-boundary | `gain:reliability` | 🔲 À faire | Phase 1 — MVP |
| [US7](#us7) | Documentation + roadmap.md | `gain:dx` | ✅ Livré | Phase 1 — MVP |
| [US8](#us8) | G4/G5 artefacts + verdict + commit | `gain:reliability` | ✅ Livré | Phase 2 — Complétude |
| [US9](#us9) | S7 execution-log + CLI bridge | `gain:reliability` | 🔲 À faire | Phase 2 — Complétude |
| [US10](#us10) | G6 continuation orchestrateur | `gain:eco-tokens` | 🔲 À faire | Phase 2 — Complétude |
| [US11](#us11) | G7/G8 protection d'état + session guard | `gain:safety` | 🔲 À faire | Phase 2 — Complétude |
| [US12](#us12) | Observabilité | `gain:observability` | ✅ Livré | Phase 2 — Complétude |
| [US13](#us13) | Recovery / rollback | `gain:reliability` | 🔲 À faire | Phase 2 — Complétude |
| [S1](#s1) | State write-through (économie de tokens) | `gain:eco-tokens` | ✅ Livré | Phase 2 — Complétude |
| [S2](#s2) | Config repo-wide (configurateur `depthTier`) | `gain:dx` | ✅ Livré | Phase 2 — Complétude |

---

## 2. Fiches détaillées

### US1 — Fondation Clean Architecture <a id="us1"></a>

**Issue :** [#47](https://github.com/SebastienDegodez/skraft-plugin/issues/47)
**Statut :** ✅ Livré
**Milestone :** Phase 1 — MVP

**Gain :** `gain:reliability` — socle déterministe, testable boundary-to-boundary.
Audit-writer = seam de test observable. Zéro dépendance runtime.

**Modules livrés :** `domain/` (result, value-objects, error-codes, specifications),
`ports/api` + `ports/infrastructure`, `adapters/api/hooks` (hook-entry, hook-router,
payload, decision, service-factory), `adapters/infrastructure` (jsonl-audit-writer,
null-audit-writer, json-state-reader, system-time, fixed-time, real-filesystem,
in-memory-filesystem), `application/config-loader`, `cli/hook.mjs`.

**Dépend de :** —

---

### US2 — Générateur de config data-driven <a id="us2"></a>

**Issue :** [#48](https://github.com/SebastienDegodez/skraft-plugin/issues/48)
**Statut :** ✅ Livré
**Milestone :** Phase 1 — MVP

**Gain :** `gain:anti-drift` + `gain:dx` — config générée depuis le frontmatter des agents,
zéro dérive entre agents et garde-fous.

**Modules livrés :** `domain/framework-config-policy.mjs`, `cli/build-config.mjs`,
`skraft-framework.config.json`, scripts npm `config:build` / `config:check`.

**Dépend de :** US1

---

### US3 — G1 garde d'ordre de dispatch <a id="us3"></a>

**Issue :** [#49](https://github.com/SebastienDegodez/skraft-plugin/issues/49)
**Statut :** ✅ Livré
**Milestone :** Phase 1 — MVP

**Gain :** `gain:anti-drift` + `gain:eco-tokens` + `gain:reliability` — un dispatch
hors-séquence est bloqué **avant** de payer le sous-agent.

**Modules livrés :** `domain/pipeline-policy.mjs`, `domain/state-schema.mjs`,
`adapters/infrastructure/json-state-reader.mjs`, `application/pre-tool-use-service.mjs`.
Branché sur `PreToolUse(Agent)` — fail-closed.

**Dépend de :** US1, US2

---

### US4 — G2/G3 forçage du chargement des skills + audit <a id="us4"></a>

**Issue :** [#50](https://github.com/SebastienDegodez/skraft-plugin/issues/50)
**Statut :** ✅ Livré
**Milestone :** Phase 1 — MVP

**Gain :** `gain:anti-drift` + `gain:eco-tokens` + `gain:observability` — un agent qui
n'a pas lu un skill obligatoire est relancé ; les lectures sont journalisées en JSONL.

**Modules livrés :** `domain/skill-policy.mjs`, `application/subagent-start-service.mjs`,
`application/subagent-stop-service.mjs` (bloc si skill manquant), G3 dans
`application/post-tool-use-service.mjs` (fail-open).

**Dépend de :** US1, US2

---

### US5 — Manifests hooks Copilot + Claude Code <a id="us5"></a>

**Issue :** [#51](https://github.com/SebastienDegodez/skraft-plugin/issues/51)
**Statut :** ✅ Livré
**Milestone :** Phase 1 — MVP

**Gain :** `gain:reliability` — mêmes garde-fous sur les deux runtimes (Copilot CLI
et Claude Code).

**Modules livrés :** `plugins/hooks/hooks.json` (Claude Code), `.github/hooks/skraft-framework.json`
(Copilot), `cli/hook.mjs` routé via `service-factory`.

**Dépend de :** US3, US4

---

### US6 — Tests boundary-to-boundary + audit du hooks.json réel <a id="us6"></a>

**Issue :** [#52](https://github.com/SebastienDegodez/skraft-plugin/issues/52)
**Statut :** 🔲 À faire
**Milestone :** Phase 1 — MVP

**Gain :** `gain:reliability` — non-régression prouvée sur les décisions allow/deny/block.
Le test `real-hook-audit` échoue si `hooks.json` ne route pas un event attendu.

**Périmètre :** domain purs (pipeline-policy, skill-policy), application services à ports
mockés, driver-adapter (spy audit writer + MockStdin/Stdout, normalisation payload),
`real-hook-audit`, `config-in-sync`.

**Dépend de :** US3, US4, US5

---

### US7 — Documentation + roadmap.md <a id="us7"></a>

**Issue :** [#53](https://github.com/SebastienDegodez/skraft-plugin/issues/53)
**Statut :** ✅ Livré
**Milestone :** Phase 1 — MVP

**Gain :** `gain:dx` — lecteur comprend chaque garde-fou, son ancrage genesis,
et comment en ajouter un nouveau.

**Livrables :** `plugins/README.md` (architecture hexagonale, events, config, fail modes,
ancrage genesis A9/S4/S7, G1..G8, guide « comment ajouter un garde-fou »),
`docs/roadmap.md` (cette page).

**Dépend de :** US5

---

### US8 — G4/G5 vérification artefacts + verdict + commit <a id="us8"></a>

**Issue :** [#54](https://github.com/SebastienDegodez/skraft-plugin/issues/54)
**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:anti-drift` + `gain:reliability` + `gain:safety` — avancement bloqué
sans artefacts réels, verdict APPROVED et commit git vérifié.

**Périmètre :** `domain/artifact-policy.mjs`, parseur de verdict reviewer
(`reviews/{date}/*.md`), `driven/git-commit-verifier`, `subagent-stop-service`
complétion fail-closed.

**Dépend de :** US3

---

### US9 — S7 execution-log + CLI bridge <a id="us9"></a>

**Issue :** [#55](https://github.com/SebastienDegodez/skraft-plugin/issues/55)
**Statut :** 🔲 À faire
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:anti-drift` + `gain:eco-tokens` + `gain:reliability` — progression
DELIVER infalsifiable (S7 DETERMINISTIC TOOL BRIDGE).

**Périmètre :** `domain/execution-log-schema.mjs`, `cli/init-log.mjs`,
`cli/log-phase.mjs` (timestamp UTC réel), `cli/verify-integrity.mjs`.

**Dépend de :** US1

---

### US10 — G6 injection de continuation orchestrateur <a id="us10"></a>

**Issue :** [#56](https://github.com/SebastienDegodez/skraft-plugin/issues/56)
**Statut :** 🔲 À faire
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:eco-tokens` + `gain:dx` — moins de re-prompting manuel, transitions
prédictibles entre phases.

**Périmètre :** `post-tool-use-service` G6 — sur `PostToolUse(Agent)`, injecte le
contexte d'étape suivante (succès) ou de re-dispatch (échec). Fail-open.

**Dépend de :** US3

---

### US11 — G7/G8 protection d'état + session guard <a id="us11"></a>

**Issue :** [#57](https://github.com/SebastienDegodez/skraft-plugin/issues/57)
**Statut :** 🔲 À faire
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:safety` + `gain:anti-drift` — état et frontières du pipeline
mécaniquement inviolables.

**Périmètre :** `PreToolUse(Bash)` deny édition directe `state.json`/execution-log ;
session guard `domain/session-guard-policy.mjs` bloque writes `src`/`tests` hors
agent monitoré pendant DELIVER.

**Dépend de :** US3

---

### US12 — Observabilité (timeout/stale + health-check) <a id="us12"></a>

**Issue :** [#58](https://github.com/SebastienDegodez/skraft-plugin/issues/58)
**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:observability` + `gain:dx` — détection des phases abandonnées,
diagnostics, auto-entretien.

**Périmètre :** timeout-monitor, turn-counter, détection phases stale, `cli/health-check.mjs`,
housekeeping `SessionStart` (rétention audit, signaux périmés).

**Modules livrés :** `domain/observability-policy.mjs` (seuils + `detectStalePhase`
fail-open + `planAuditRetention` / `planStaleSignals`), `application/health-check-service.mjs`,
`application/session-start-service.mjs`, `cli/health-check.mjs`, `cli/housekeeping.mjs`,
entrées `SessionStart` dans `plugins/hooks/hooks.json` + `.github/hooks/skraft-framework.json`.
Seuils configurés via le bloc `observability` de `skraft-config.json`.

**Dépend de :** US8, US9

---

### US13 — Recovery / rollback <a id="us13"></a>

**Issue :** [#59](https://github.com/SebastienDegodez/skraft-plugin/issues/59)
**Statut :** 🔲 À faire
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:reliability` + `gain:dx` — le pipeline se rattrape au lieu de
se bloquer sur état corrompu ou stale.

**Périmètre :** guidance de récupération (WHY/HOW/ACTION), rollback de schéma,
résolution d'exécution stale.

**Dépend de :** US8

---

## 3. Variantes futures (non engageant)

Extensions planifiées au-delà des 13 US initiales :

- **US14 #60** — State transition bridge (S7) — écriture déterministe de `state.json` — ✅ Livré (voir [S1](#s1))
- **US15 #61** — Schéma d'état source-unique (SoC)
- **US16 #63** — Déploiement des hooks dans le projet consumer

---

## 4. Fiches livrées hors séquence initiale

### S1 — State write-through (économie de tokens) <a id="s1"></a>

**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:eco-tokens` + `gain:reliability` — le coût token vient de la *fréquence*
(relecture/réécriture de tout `state.json` à chaque tour), pas de la taille. Le modèle
write-through supprime cette fréquence : réhydratation **1×/session**, working set = todo
natif, écritures déterministes via CLI aux checkpoints. Projection ~800 → ~50 tokens/tour.

**Modules livrés :** `cli/state.mjs` (S7 bridge : `init | get | transition |
record-verdict | record-artifact | record-review-artifact | set-difficulty |
incr-retry`), `domain/state-machine.mjs` (invariants I1-I9, append-only, DONE terminal),
`domain/state-schema.mjs` (`validatePipelineState` round-trip fidelity — préserve tous
les champs orchestrator-owned, migration `reviewerVerdicts`→`verdicts`),
`adapters/infrastructure/state/json-state-writer.mjs` (atomique + backup ≤3),
`application/state-service.mjs`, `ports/infrastructure/state-writer.mjs`.
Instructions : `skraft-state.instructions.md` (write-through) +
`skraft-todo-sync.instructions.md` (projection state→todo natif, Claude/Copilot).

**Qualité :** `node --test` 100 % + mutation Stryker ≥ 86 % sur les fichiers état.

**Dépend de :** US1, US3

---

### S2 — Config repo-wide (configurateur `depthTier`) <a id="s2"></a>

**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:dx` + `gain:eco-tokens` — `depthTier` (dial de rigueur = cost governor)
est une propriété du **dépôt**, pas d'un work-item. Il quitte `state.json` pour un fichier
repo-wide `skraft-config.json` géré par un configurateur ; `difficulty` reste per-work-item
via `state.mjs`. Les agents n'appellent que des commandes (get/set délégués au script).

**Modules livrés :** `domain/config-schema.mjs` (pur, round-trip),
`application/config-service.mjs` (`init/get/set`, clés `depthTier` + `depthTierRationale`),
`adapters/infrastructure/config/json-config-{reader,writer}.mjs` (atomique + backup ≤3),
`cli/config.mjs` (S7 bridge : `init | get | set`, exit 0/1/2/3, `SKRAFT_CONFIG_ROOT`|cwd),
`skills/skraft-config/SKILL.md` (configurateur, S7 + A9 init→set→verify),
`skraft-config.json` (racine, versionné).

**Qualité :** `node --test` 100 % + mutation Stryker ≥ 80 % sur les fichiers config.

**Dépend de :** US1, S1
