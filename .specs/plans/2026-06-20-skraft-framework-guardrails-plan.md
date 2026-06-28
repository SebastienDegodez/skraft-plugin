# Plan — skraft-framework : couche d'exécution déterministe (garde-fous)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Livraison **issue par issue** ; chaque tâche = une issue GitHub portant ses labels de **gain**.

**Goal :** Doter SKRAFT d'un **framework de garde-fous déterministes** qui rend les invariants du pipeline **mécaniquement infranchissables** via des **hooks**. Cible les deux erreurs observées : (1) **mauvais agent / ordre sauté** par l'orchestrateur, (2) **skills listés "important" jamais lus**. Bénéfice transverse : pipeline **prédictible → économie de tokens**.

**Architecture :** Réalisation runtime des patterns `genesis` déjà cités par les agents. Le système hook = **A9 SUPERVISED EXECUTION (STRONG FORM)** : l'exécution sort de la couche LLM vers un post-stage déterministe **non contournable**. Chaque garde-fou = **S4 VALIDATION DECORATOR** qui **bloque** (anti-pattern S4 « wrapping without blocking » → on ne logge pas, on bloque). Lectures d'état déterministes = **S7 DETERMINISTIC TOOL BRIDGE** (corrige `TOOLLESS PRECONDITION` : l'ordre est lu depuis `state.json`, pas inféré). Trace JSONL append-only = **AUDIT_SURFACE** (sert aussi de seam de test boundary-to-boundary). Code en **Clean Architecture / hexagonal** (domain pur → application → ports → adapters), Result type sans exception aux frontières.

**Tech Stack :** **Node.js ESM (`.mjs`)**, Node v22, **zéro dépendance** runtime (`node:fs`, `node:path`, `node:child_process`, `node:test`). Cross-platform Mac/Windows (un seul `node <script>`). Hooks **Copilot + Claude Code** via manifest **PascalCase** (`plugins/hooks/hooks.json`, format VS Code + matchers Claude). Config `skraft-framework.config.json` **générée** depuis le frontmatter des agents (réutilise le parseur YAML maison `scripts/lib/`).

**Suivi :** 13 issues GitHub (milestones `skraft-framework Phase 1 — MVP` / `Phase 2 — Complétude`). Met à jour `docs/roadmap.md` (qui anticipe déjà « Hooks de gardiennage 🚧 À venir »).

---

## Capacités couvertes par skraft-framework

SKRAFT n'a aujourd'hui que `state.json` + de la prose (WEAK FORM). Manque **toute la couche d'exécution déterministe** :

| Capacité | Garde-fou |
|---|---|
| Dispatch guard (PreToolUse, fail-closed) | **G1** ordre de dispatch vs machine d'état |
| Execution-log + CLI bridge | **CLI** `init-log`/`log-phase`/`verify-integrity` (S7) |
| Step completion (commit git réel vérifié) | **G5** artefacts + verdict + commit |
| Continuation injection (PostToolUse) | **G6** contexte étape suivante |
| Skill enforcement (SubagentStart + tracking) | **G2/G3** directive + vérif bloquante + audit |
| Structure des artefacts + validator | **G4** structure des artefacts |
| Audit trail JSONL | **Audit port** (seam de test) |
| Timeout/stale/abandoned detection | **Observabilité** (P2) |
| Session guard (writes src/, état) | **G7/G8** protection d'état + frontières |
| Config cascade (toggles enforcement) | **Config port** |
| Recovery / rollback | **Recovery services** (P2) |
| Architecture hexagonale + tests boundary | **Fondation** (#1) |

---

## File Structure

**Créés (cible) :**

```
plugins/skraft-framework/
  src/
    domain/            result.mjs · value-objects.mjs · error-codes.mjs · specifications.mjs
                       pipeline-policy.mjs (G1) · skill-policy.mjs (G2) · state-schema.mjs
                       artifact-policy.mjs (G4/G5) · execution-log-schema.mjs
    application/       pre-tool-use-service · subagent-start-service · subagent-stop-service
                       post-tool-use-service · session-start-service · config-loader
    ports/
      driver-ports/    pre-tool-use-port.mjs · subagent-stop-port.mjs
      driven-ports/    state-reader · audit-writer · transcript-reader · commit-verifier
                       filesystem · time-provider · config
    adapters/
      drivers/hooks/   hook-entry.mjs · hook-router.mjs · payload.mjs · decision.mjs · service-factory.mjs
      driven/          state/json-state-reader · audit/jsonl-audit-writer (+null)
                       transcript/jsonl-transcript-reader · git/git-commit-verifier
                       fs/real-filesystem (+in-memory) · time/system-time (+fixed) · config/json-config
    cli/               hook.mjs · init-log.mjs · log-phase.mjs · verify-integrity.mjs · health-check.mjs
  hooks.json                       # manifest plugin (PascalCase, Copilot+Claude)
  skraft-framework.config.json     # GÉNÉRÉ depuis le frontmatter des agents
  README.md
.github/hooks/skraft-framework.json   # manifest dev repo (Copilot)
scripts/build-skraft-framework-config.mjs   # générateur frontmatter -> config
tests/skraft-framework/
  unit/{domain,application,adapters/drivers,adapters/driven,ports}/*.test.mjs
  integration/*.test.mjs · real-hook-audit.test.mjs · fixtures/
```

**Modifiés :** `docs/roadmap.md` (remplace « Hooks de gardiennage 🚧 À venir »), `package.json` (scripts `guard:build`/`guard:check`/`test:framework`), `CLAUDE.md` (note).

---

## Mapping hooks (Copilot + Claude, PascalCase)

| Event | Matcher | Garde-fou | Mode |
|---|---|---|---|
| `PreToolUse` | `Agent` | **G1** ordre de dispatch ; **G8** session-guard | fail-closed |
| `PreToolUse` | `Bash` | **G7** deny édition directe `state.json` | fail-closed |
| `SubagentStart` | (regex agents) | **G2** injecte directive skills (verify/eager) | fail-open |
| `SubagentStop` | — | **G2** vérif skills lus + **G5** complétion/commit | bloque sur violation |
| `PostToolUse` | `Read` | **G3** audit chargement skills (JSONL) | fail-open |
| `PostToolUse` | `Agent` | **G6** continuation orchestrateur | fail-open |
| `SessionStart` | — | housekeeping / résumé (P2) | fail-open |

---

## Taxonomie de labels

**Gain (valeur) :** `gain:anti-drift` · `gain:eco-tokens` · `gain:reliability` · `gain:observability` · `gain:safety` · `gain:dx`
**Composant :** `fw:foundation` · `fw:guardrail` · `fw:cli` · `fw:config` · `fw:hooks-manifest`
**Qualité :** `clean-architecture` · `tests` (+ `enhancement` / `documentation` existants)
**Milestones :** `skraft-framework Phase 1 — MVP` · `skraft-framework Phase 2 — Complétude`

---

## Task 0 : Préparer le terrain (labels, milestones, roadmap)

- [ ] Créer les labels `gain:*`, `fw:*`, `clean-architecture`, `tests`.
- [ ] Créer les milestones Phase 1 / Phase 2.
- [ ] Ouvrir les 13 issues (corps = description + gain + critères d'acceptation + dépendances).
- [ ] Écrire/mettre à jour `docs/roadmap.md` en page de référence du framework.

## Milestone Phase 1 — MVP (anti-drift + éco + fondation)

### Task 1 : #1 Fondation Clean Architecture (`fw:foundation` `clean-architecture` `gain:reliability` `tests`)

- [ ] domain : `result.mjs` (Ok/Err), `value-objects.mjs` (Phase, AgentName, ProjectSlug, Verdict, SkillRef), `error-codes.mjs` (registre central), `specifications.mjs`.
- [ ] ports driver (`pre-tool-use-port`, `subagent-stop-port`) + driven (state-reader, audit-writer, transcript-reader, commit-verifier, filesystem, time-provider, config).
- [ ] adapters driven : `jsonl-audit-writer` (+`null`), `json-state-reader`, `system-time` (+`fixed`), `real-filesystem` (+`in-memory`).
- [ ] adapters drivers/hooks : `hook-entry`, `hook-router`, `payload` (normalise camelCase/PascalCase/snake_case), `decision` (allow/deny/block/additionalContext), `service-factory` (composition root).
- [ ] `application/config-loader` (cascade projet/global/env).
- [ ] Harnais `node --test` + scripts npm. **Acceptation :** suite vide passe ; audit = seam observable ; zéro dépendance.

### Task 2 : #2 Générateur de config data-driven (`fw:config` `gain:anti-drift` `gain:dx` `clean-architecture`)

- [x] `plugins/src/cli/build-config.mjs` (+ `build-config-bin.mjs`) : parse `plugins/agents/**/*.agent.md` (metadata.phase, dispatched_by, skills, inputs.required, outputs ; orchestrator metadata.phases). _Implémenté dans la fondation `plugins/src/` (cf. `resolve-model`), pas dans `scripts/` ; `skillPolicy` non présent → défaut `verify`._
- [x] Émet `plugins/skraft-framework.config.json` : `phaseOrder`, `phaseAgents{specialist,reviewer}` (reviewer en phase `X-REVIEW` rattaché à `X`), `agentSkills{[agent]:[{name,policy}]}`, `agentArtifacts{[agent]:{inputs,outputs}}`. Politique métier pure `domain/framework-config-policy.mjs`.
- [x] Réutilise le parseur YAML maison `scripts/lib/book.mjs` (`parseYaml`).
- [x] Scripts npm `config:build` + `config:check` (échoue si le JSON committé est désync). Domaine couvert par mutation 98.55 % (1 survivant Regex équivalent documenté). **Dépend de #1.**

### Task 3 : #3 G1 garde d'ordre de dispatch (`fw:guardrail` `gain:anti-drift` `gain:eco-tokens` `gain:reliability`)

- [ ] `domain/pipeline-policy.mjs` PUR : `expectedNextAgent(state,config)` + `validateDispatch(requestedAgent,state,config)` (phase order, `skipPhases`, specialist-avant-reviewer, avancement uniquement sur `APPROVED`, retries).
- [ ] `domain/state-schema.mjs` + `driven/json-state-reader` + `application/pre-tool-use-service`.
- [ ] Branché sur `PreToolUse(Agent)` : **deny** hors-séquence (fail-closed). **Acceptation :** un dispatch hors-ordre est bloqué avant de payer le sous-agent. **Dépend de #1, #2.**

### Task 4 : #4 G2/G3 forçage du chargement des skills + audit (`fw:guardrail` `gain:anti-drift` `gain:eco-tokens` `gain:observability`)

- [ ] `domain/skill-policy.mjs` : `mandatorySkillsFor(agent)`, `missingSkills(read, required)`.
- [ ] `subagent-start-service` : injecte la directive MANDATORY dans `additionalContext` (mode `verify` par défaut ; option `eager` = inline le contenu `SKILL.md`).
- [ ] `subagent-stop-service` : scanne le transcript (`/<skill>/SKILL.md`) → **block** si un skill obligatoire n'a pas été lu.
- [ ] `post-tool-use-service` G3 : journalise les lectures de `SKILL.md` en JSONL (fail-open). **Acceptation :** un agent qui n'a pas lu un skill obligatoire est relancé. **Dépend de #1, #2.**

### Task 5 : #5 Manifests hooks Copilot + Claude (`fw:hooks-manifest` `gain:reliability`)

- [ ] `plugins/hooks/hooks.json` (PascalCase : `PreToolUse` matcher Agent+Bash, `SubagentStart`, `SubagentStop`, `PostToolUse` matcher Read+Agent) ; commande cross-platform `command: node plugins/skraft-framework/src/cli/hook.mjs <Event>`.
- [ ] `cli/hook.mjs` route via `service-factory`.
- [ ] `.github/hooks/skraft-framework.json` (manifest dev repo). **Acceptation :** mêmes garde-fous sur les deux runtimes. **Dépend de #3, #4.**

### Task 6 : #6 Tests boundary-to-boundary (`tests` `clean-architecture` `gain:reliability`)

- [ ] domain purs (pipeline-policy ordering bon/mauvais/sauté ; skill-policy missing).
- [ ] application services à ports mockés (assert événements d'audit qui traversent le port).
- [ ] driver-adapter avec spy audit writer + MockStdin/Stdout ; normalisation payload camel/Pascal ; fail-open vs fail-closed.
- [ ] `real-hook-audit` (audite le `hooks.json` réel) ; `config-in-sync` (`guard:check`). **Dépend de #3, #4, #5.**

### Task 7 : #7 Documentation + roadmap.md (`documentation` `gain:dx`)

- [ ] `plugins/skraft-framework/README.md` (architecture hexagonale, events, config, fail modes, ancrage genesis A9/S4/S7, G1..G8).
- [ ] Mise à jour `docs/roadmap.md` (remplace « Hooks de gardiennage 🚧 À venir » ; une fiche par feature avec son **gain**, milestone, dépendances). Note `CLAUDE.md`. **Dépend de #5.**

## Milestone Phase 2 — Complétude

### Task 8 : #8 G4/G5 artefacts + verdict + commit (`fw:guardrail` `gain:reliability` `gain:anti-drift` `gain:safety`)

- [ ] `domain/artifact-policy.mjs` (artefacts attendus par phase/agent) + parseur de verdict reviewer (`reviews/{date}/*.md` → APPROVED/NEEDS_REWORK/REJECTED) + `driven/git-commit-verifier`.
- [ ] `subagent-stop-service` complétion fail-closed avant avancement. **Dépend de #3.**

### Task 9 : #9 S7 execution-log + CLI bridge (`fw:cli` `gain:reliability` `gain:anti-drift` `gain:eco-tokens`)

- [ ] `domain/execution-log-schema.mjs` (phases TDD, complétude, terminal phases) + `cli/init-log.mjs`, `cli/log-phase.mjs` (timestamp UTC réel), `cli/verify-integrity.mjs`.
- [ ] L'agent DELIVER enregistre ses phases au lieu de les affirmer. **Dépend de #1.**

### Task 10 : #10 G6 continuation orchestrateur (`fw:guardrail` `gain:eco-tokens` `gain:dx`)

- [ ] `PostToolUse(Agent)` injecte le contexte d'étape suivante / re-dispatch sur échec. **Dépend de #3.**

### Task 11 : #11 G7/G8 protection d'état + session guard (`fw:guardrail` `gain:safety` `gain:anti-drift`)

- [ ] `PreToolUse(Bash)` deny édition directe `state.json`/execution-log (forcer le passage par la CLI).
- [ ] Session guard : bloque writes `src`/`tests` hors agent monitoré pendant DELIVER (`domain/session-guard-policy.mjs`). **Dépend de #3.**

### Task 12 : #12 Observabilité (`fw:cli` `gain:observability` `gain:dx`)

- [ ] timeout-monitor, turn-counter, détection phases abandonnées/stale, deliver-progress injection, SessionStart housekeeping, `cli/health-check.mjs`. **Dépend de #8, #9.**

### Task 13 : #13 Recovery / rollback (`gain:reliability` `gain:dx`)

- [ ] guidance de récupération, rollback de schéma, résolution du stale. **Dépend de #8.**

---

## Notes & risques

- `general-purpose` n'émet pas `SubagentStart/Stop` → sans impact (agents SKRAFT = custom agents).
- Parsing transcript G2 tolérant : match `/<skill>/SKILL.md` (chemin déployé variable : `plugins/skills` vs `.github/skills` vs `~/.copilot`).
- `eager` (inline `SKILL.md`) garantit mais coûte des tokens → réservé aux skills critiques ; défaut `verify`.
- Fail-closed limité à G1/G5/G7 ; tout le reste fail-open sur **bug du hook** (une violation détectée bloque ; un bug du garde-fou ne fige jamais le pipeline).
- Handbook `docs/site` (parité FR/EN + chaînes d'agents) traité en suivi séparé.
