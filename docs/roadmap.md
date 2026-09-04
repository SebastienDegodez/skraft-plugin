# Roadmap — skraft-framework

Cette page liste les **13 user stories** du framework de garde-fous déterministes,
avec leur gain, statut et milestone.

> **Mise à jour :** quand une US est livrée, passez son statut à ✅ Livré.
> Le README du plugin reste centré sur les capacités effectivement distribuées.

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
| [US9](#us9) | S7 execution-log + CLI bridge | `gain:reliability` | ✅ Livré | Phase 2 — Complétude |
| [US10](#us10) | G6 continuation orchestrateur | `gain:eco-tokens` | ✅ Livré | Phase 2 — Complétude |
| [US11](#us11) | G7/G8 protection d'état + session guard | `gain:safety` | ✅ Livré | Phase 2 — Complétude |
| [US12](#us12) | Observabilité | `gain:observability` | ✅ Livré | Phase 2 — Complétude |
| [US13](#us13) | Recovery / rollback | `gain:reliability` | ✅ Livré | Phase 2 — Complétude |
| [S1](#s1) | State write-through (économie de tokens) | `gain:eco-tokens` | ✅ Livré | Phase 2 — Complétude |
| [S2](#s2) | Config repo-wide (`skraft-config.json`) | `gain:dx` | ✅ Livré | Phase 2 — Complétude |
| [S3](#s3) | Séparation des couches (produit / ingénierie, RPI-aligné) | `gain:dx` | ✅ Livré | Phase 3 — Alignement RPI |

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

**Modules livrés :** `plugins/skraft-framework/com.anthropic.claude-code/hooks/hooks.json` (Claude Code), `.github/hooks/skraft-framework.json`
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

**Livrables :** `docs/site/fr/explanation/hooks.md` et
`docs/site/en/explanation/hooks.md` (architecture, events, config et fail modes),
`docs/roadmap.md` (cette page), plus le README utilisateur du plugin.

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
**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:anti-drift` + `gain:eco-tokens` + `gain:reliability` — progression
DELIVER infalsifiable (S7 DETERMINISTIC TOOL BRIDGE).

**Périmètre :** `domain/execution-log-schema.mjs`, `cli/init-log.mjs`,
`cli/log-phase.mjs` (timestamp UTC réel), `cli/verify-integrity.mjs`.

**Dépend de :** US1

---

### US10 — G6 injection de continuation orchestrateur <a id="us10"></a>

**Issue :** [#56](https://github.com/SebastienDegodez/skraft-plugin/issues/56)
**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:eco-tokens` + `gain:dx` — moins de re-prompting manuel, transitions
prédictibles entre phases.

**Périmètre :** `post-tool-use-service` G6 — sur `PostToolUse(Agent)`, injecte le
contexte d'étape suivante (succès) ou de re-dispatch (échec). Fail-open.

**Dépend de :** US3

---

### US11 — G7/G8 protection d'état + session guard <a id="us11"></a>

**Issue :** [#57](https://github.com/SebastienDegodez/skraft-plugin/issues/57)
**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:safety` + `gain:anti-drift` — état et frontières du pipeline
mécaniquement inviolables.

**Périmètre :** `PreToolUse(Bash)` deny édition directe `state.json`/execution-log ;
session guard `domain/session-guard-policy.mjs` bloque writes `src`/`tests` hors
agent monitoré pendant DELIVER.

**Livré :** `domain/session-guard-policy.mjs` (pur) + `application/pre-tool-use-session-guard-service.mjs`.
G7 (state-independent) refuse toute mutation directe des artefacts protégés
(redirection shell, verbe mutant, ou outil Write/Edit) ; la lecture reste permise —
la seule voie d'écriture sanctionnée est le CLI d'état (#60, S7). G8, pendant DELIVER,
bloque les writes `src/`/`tests/` hors des agents DELIVER monitorés
(`phaseAgents.DELIVER`) ; fail-open si l'état est illisible (un bug du hook ne fige
jamais le pipeline).

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
entrées `SessionStart` dans `plugins/skraft-framework/com.anthropic.claude-code/hooks/hooks.json` + `.github/hooks/skraft-framework.json`.
Seuils configurés via le bloc `observability` de `skraft-config.json`.

**Dépend de :** US8, US9

---

### US13 — Recovery / rollback <a id="us13"></a>

**Issue :** [#59](https://github.com/SebastienDegodez/skraft-plugin/issues/59)
**Statut :** ✅ Livré
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:reliability` + `gain:dx` — le pipeline se rattrape au lieu de
se bloquer sur état corrompu ou stale.

**Périmètre :** guidance de récupération (WHY/HOW/ACTION), rollback de schéma,
résolution d'exécution stale.

**Livraison :** `state.mjs diagnose` émet une guidance actionnable
(`{ code, why, how[], action }`) ; `state.mjs rollback` restaure le backup
`state.json.bak.*` sain le plus récent (lecture seule — la création/rotation
des backups reste possédée par le writer de #60) ; `state.mjs resolve-stale`
réinitialise le budget de retry d'une phase bloquée (événement `RESOLVE_STALE`)
pour la relancer.

**Dépend de :** US8

---

## 3. Variantes futures (non engageant)

Extensions planifiées au-delà des 13 US initiales :

- **US14 #60** — State transition bridge (S7) — écriture déterministe de `state.json` — ✅ Livré (voir [S1](#s1))
- **US15 #61** — Schéma d'état source-unique (SoC)
- **US16 #63** — Déploiement des hooks dans le projet consumer — ✅ Livré (`domain/plugin-root-policy.mjs` + `adapters/infrastructure/plugin-root-resolver.mjs` : résolution `CLAUDE_PLUGIN_ROOT` → glob cache `~/.claude/plugins/cache/*/skraft/*` → module-relatif, cross-platform ; Copilot CLI via chemins relatifs)

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
record-verdict | record-artifact | record-review-artifact |
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

### S2 — Config repo-wide (`skraft-config.json`) <a id="s2"></a>

**Statut :** ✅ Livré — périmètre réduit depuis (voir « Évolution »)
**Milestone :** Phase 2 — Complétude

**Gain :** `gain:dx` — ce qui est une propriété du **dépôt** quitte `state.json` pour un
fichier repo-wide `skraft-config.json` géré par un CLI. Les agents n'appellent que des
commandes (get/set délégués au script).

**Modules livrés :** `domain/config-schema.mjs` (pur, round-trip),
`application/config-service.mjs` (`init/get/set`),
`adapters/infrastructure/config/json-config-{reader,writer}.mjs` (atomique + backup ≤3),
`cli/config.mjs` (S7 bridge : `init | get | set`, exit 0/1/2/3, `SKRAFT_CONFIG_ROOT`|cwd),
`skraft-config.json` (racine, versionné). La version d'origine gouvernait deux clés —
`depthTier` (+ `depthTierRationale`) et `trackingLayout` — et embarquait un skill
configurateur `skraft-config`.

**Évolution — le dial de rigueur a été supprimé :** `depthTier` n'existe plus (schéma,
CLI, `skraft-config.json`, fixtures, tests), et le skill `skraft-config`, dont c'était
le sujet, a été supprimé avec lui. `cli/config.mjs` subsiste et ne gouverne plus qu'**une
seule clé**, `trackingLayout` (voir [S3](#s3)) ; une clé `depthTier` restée dans le fichier
d'un dépôt ancien y passe désormais comme un champ inconnu quelconque, par fidélité de
round-trip. Les seuils ne sont plus configurables : le skill `skraft-quality-bar` porte la
barre unique et permanente — mutation 100 % sur Domain/Application et 90 % sur
API/Infrastructure, couverture de lignes 100 % sur Domain/Application, les quatre lentilles
adversariales à chaque revue, gate Gherkin obligatoire, ADR pour toute décision non
triviale, Object Calisthenics sur le Domain, TDD Outside-In double boucle. Chaque gate est
**bloquante** : les niveaux `advisory` et `warning`, et la rationale qui achetait une
exemption, n'existent plus. La mutation tourne en deux scripts séquencés livrés par
l'adaptateur `quality-gates-<tech>` (core Domain/Application, puis boundary
API/Infrastructure) : chaque script porte sa valeur attendue et la passe au `--break-at` du
runner, dont le **code de sortie** fait verdict.

**Conséquence sur le coût :** `depthTier` était aussi le cost governor du framework
(fan-out reviewer 1/2/4, nombre de runs de mutation, activation de la gate Gherkin). Sans
lui, chaque run paie la forme complète. Le coût est assumé délibérément par le
propriétaire du dépôt : la qualité n'est pas négociable. Cette fiche perd donc son tag
`gain:eco-tokens` ; l'économie de tokens reste portée par [S1](#s1) (write-through) et
[US10](#us10) (continuation).

**Qualité :** `node --test` 100 % + mutation Stryker ≥ 80 % sur les fichiers config.

**Dépend de :** US1, S1

---

### S3 — Séparation des couches (produit / ingénierie, RPI-aligné) <a id="s3"></a>

**Statut :** ✅ Livré
**Milestone :** Phase 3 — Alignement RPI

**Gain :** `gain:dx` — vraie séparation des couches. L'orchestrateur devient l'équivalent
SKRAFT du `rpi-agent` HVE : un pipeline d'**ingénierie** pur `RESEARCH → DESIGN → DISTILL →
DELIVER`. La découverte de backlog et le raffinement d'histoires **quittent** l'orchestrateur
et deviennent des agents **produit** autonomes (`Skraft - Backlog Discoverer`, `Skraft - Backlog Planner`), que
le développeur invoque directement. SKRAFT et HVE-RPI sont **mutuellement exclusifs** (l'un ou
l'autre) et — en layout `bare` — opèrent sur les **mêmes fichiers** `.copilot-tracking/`
(swappabilité).

**Décisions clés :**

1. **Étape RESEARCH** (doctrine task-research RPI) en tête du pipeline : document de recherche
   cité, gated par la difficulté (sautée pour Simple/Medium, comme RPI ne produit pas
   d'artefact de recherche pour du travail simple). **Pas de reviewer** : la qualité se
   vérifie directement par les citations, pas par un gate adversarial ; la phase se clôture
   via `state.mjs close-phase` (fermeture manuelle, comme DELIVER en clôture humaine).
2. **G1 active-pipeline-only + câblage `PreToolUse`** : le garde d'ordre de dispatch ne
   gouverne QUE les agents de phase ; les agents produit (invoqués en top-level) et les
   workers (dispatchés dans DELIVER) passent (`UNGOVERNED`). Les trois gardes `PreToolUse`
   (G1 + G7/G8) sont désormais **câblés** dans `cli/hook.mjs` via un composite : G1 gated sur
   `projectSlug` + `requestedAgent` (un agent standalone n'est jamais bloqué), G7/G8 toujours
   exécuté, décisions combinées fail-closed. Les invariants existants restent intacts
   (AC-01/02/04).
3. **Layout `trackingLayout` (namespaced | bare)** : dial repo-wide. `namespaced` (défaut,
   legacy) sous `skraft-plans/{slug}/` ; `bare` converge sur les répertoires RPI nus et place
   l'état sous `.copilot-tracking/skraft/{slug}/`. Migration via `state.mjs migrate`.

**Modules livrés :** `domain/tracking-layout-policy.mjs` (pur),
`adapters/infrastructure/tracking-root-resolver.mjs` (précédence env → config → défaut),
`domain/pipeline-policy.mjs` (`isPipelineAgent` + court-circuit `UNGOVERNED`),
`application/pre-tool-use-composite.mjs` (compose G1 + G7/G8, câblé dans `cli/hook.mjs`),
`domain/config-schema.mjs` + `application/config-service.mjs` (clé `trackingLayout`),
`cli/state.mjs` (résolution de layout + `migrate`), `cli/hook.mjs` (résolveur partagé +
câblage `PreToolUse` + bridge args event/matcher),
agent `Skraft - Solution Researcher` (spécialiste sans reviewer — `pipeline-policy.mjs`
supporte désormais les phases `reviewer: null`), orchestrateur re-ciblé (`phases`
`[RESEARCH, DESIGN, DISTILL, DELIVER]`), `backlog-*` en racines autonomes,
`skraft-framework.config.json` régénéré, instructions `skraft-state`/`skraft-artifacts`
(layouts documentés).

**Qualité :** `node --test` 100 % (760 tests) + mutation Stryker : `tracking-layout-policy`
100 %, `pre-tool-use-composite` 96 %, `pipeline-policy`/`config-*`/`pre-tool-use-service` ≥ 80 % (break).

**Dépend de :** US3, S1, S2

**Suivi (docs) :** réconciliation du handbook FR/EN (`docs/site/`) — pages de référence
`Skraft - Solution Researcher`, page pipeline, navigation — à passer via `skraft-docs-orchestrator`.
