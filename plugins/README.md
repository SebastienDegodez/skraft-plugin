# skraft-framework — Documentation vivante

> **Mise à jour obligatoire :** ce fichier est mis à jour à chaque US implémentée.
> L'agent qui implémente une US **doit** cocher la case correspondante et documenter les modules livrés.

---

## Emplacement & résolution

Le framework vit dans `plugins/src/`. Il est livré avec le plugin.

Point d'entrée appelé par `hooks/hooks.json` (Claude Code) et `.github/hooks/skraft.json` (Copilot) :
```
$CLAUDE_PLUGIN_ROOT/src/cli/hook.mjs <Event> [matcher]
```
Fallback si `CLAUDE_PLUGIN_ROOT` absent : glob `~/.claude/plugins/cache/*/skraft/*/src/cli/hook.mjs`.

---

## État d'implémentation

| # | US | Statut | Modules livrés |
|---|---|---|---|
| 1 | Fondation Clean Architecture | ✅ Livré | `domain/` (result, value-objects, error-codes, specifications), `ports/api` + `ports/infrastructure`, `adapters/api/hooks` (hook-entry, hook-router, payload, decision, service-factory), `adapters/infrastructure` (jsonl-audit-writer +null, json-state-reader, system-time +fixed, real-filesystem +in-memory), `application/config-loader`, `cli/hook.mjs` — `node --test` 100 % + mutation Stryker |
| 2 | Générateur de config data-driven | ✅ Livré | `domain/framework-config-policy.mjs` (pur), `cli/build-config.mjs` (+bin), `skraft-framework.config.json` généré, scripts npm `config:build`/`config:check` — `node --test` 100 % + mutation Stryker 100 % |
| 3 | G1 garde d'ordre de dispatch | ✅ Livré | `domain/pipeline-policy.mjs`, `domain/state-schema.mjs`, `adapters/infrastructure/json-state-reader.mjs`, `application/pre-tool-use-service.mjs` — branché `PreToolUse(Agent)` fail-closed |
| 4 | G2/G3 forçage skills + audit | ✅ Livré | `domain/skill-policy.mjs`, `application/subagent-start-service.mjs`, `application/subagent-stop-service.mjs` (block si skill manquant), `application/post-tool-use-service.mjs` G3 (fail-open) |
| 5 | Manifests hooks Copilot + Claude | ✅ Livré | `hooks/hooks.json` (Claude Code — PreToolUse Agent+Bash, SubagentStart, SubagentStop, PostToolUse), `.github/hooks/skraft-framework.json` (Copilot) |
| 6 | Tests boundary-to-boundary | 🔲 À faire | — |
| 7 | Documentation + roadmap.md | ✅ Livré | `plugins/README.md` (ancrage genesis A9/S4/S7, fail modes, guide « ajouter un garde-fou »), `docs/roadmap.md` (13 US avec gain + statut + milestone) |
| 8 | G4/G5 artefacts + verdict + commit | ✅ Livré | `domain/artifact-policy.mjs` (artefacts attendus, parseur de verdict reviewer, `**Verdict:** APPROVED\|NEEDS_REWORK\|REJECTED`), `ports/infrastructure/commit-verifier.mjs` + `adapters/infrastructure/git-commit-verifier.mjs` (working tree propre), `subagent-stop-service` (complétion fail-closed : artefact manquant, verdict divergent du fichier écrit, DELIVER sans commit vérifié) — branché dans `cli/hook.mjs` |
| 9 | S7 execution-log + CLI bridge | 🔲 À faire | — |
| 10 | G6 continuation orchestrateur | 🔲 À faire | — |
| 11 | G7/G8 protection d'état + session guard | 🔲 À faire | — |
| 12 | Observabilité | ✅ Livré | `domain/observability-policy.mjs` (seuils + `detectStalePhase` fail-open + `planAuditRetention`/`planStaleSignals`), `application/health-check-service.mjs`, `application/session-start-service.mjs`, `cli/health-check.mjs` + `cli/housekeeping.mjs`, entrées `SessionStart` dans les deux manifests hooks ; seuils via bloc `observability` de `skraft-config.json` — `node --test` 100 % |
| 13 | Recovery / rollback | 🔲 À faire | — |
| 16 | Déploiement hooks dans le projet consumer | 🔲 À faire | — |
| S1 | State write-through (token economy) | ✅ Livré | `cli/state.mjs` (S7 bridge : `init\|get\|transition\|record-verdict\|record-artifact\|record-review-artifact\|set-difficulty\|incr-retry`), `domain/state-machine.mjs` (invariants I1-I9), `adapters/infrastructure/state/json-state-writer.mjs` (atomique + backup ≤3), `application/state-service.mjs` ; réhydratation 1×/session + `skraft-state`/`skraft-todo-sync.instructions.md` — `node --test` 100 % + mutation Stryker ≥ 86 % |
| S2 | Config repo-wide (configurateur `depthTier`) | ✅ Livré | `domain/config-schema.mjs` (pur), `application/config-service.mjs`, `adapters/infrastructure/config/json-config-{reader,writer}.mjs` (atomique + backup ≤3), `cli/config.mjs` (`init\|get\|set`), `skills/skraft-config/SKILL.md` (configurateur S7/A9), `skraft-config.json` (racine, versionné) — `node --test` 100 % + mutation Stryker ≥ 80 % |

---

## Architecture cible

```
plugins/src/
├── domain/              # pur, zéro dépendance
│   ├── result.mjs
│   ├── value-objects.mjs
│   ├── error-codes.mjs
│   ├── specifications.mjs
│   ├── pipeline-policy.mjs   # G1
│   ├── skill-policy.mjs      # G2/G3
│   ├── artifact-policy.mjs   # G4/G5
│   ├── state-schema.mjs
│   ├── state-machine.mjs     # invariants I1-I9 (write-through)
│   ├── config-schema.mjs     # depthTier repo-wide
│   ├── observability-policy.mjs  # seuils + stale-phase + rétention (US12)
│   └── execution-log-schema.mjs
├── application/
│   ├── pre-tool-use-service.mjs
│   ├── subagent-start-service.mjs
│   ├── subagent-stop-service.mjs
│   ├── post-tool-use-service.mjs
│   ├── session-start-service.mjs # housekeeping (rétention audit + signaux)
│   ├── health-check-service.mjs  # diagnostics (version/manifests/logs/config)
│   ├── state-service.mjs     # init/get/applyEvent (write-through)
│   ├── config-service.mjs    # init/get/set (depthTier)
│   └── config-loader.mjs
├── ports/
│   ├── api/                 # contrats entrants (appelés par la couche Api)
│   │   ├── pre-tool-use.mjs
│   │   └── subagent-stop.mjs
│   └── infrastructure/      # contrats sortants (implémentés par l'infra)
│       ├── state-reader.mjs
│       ├── state-writer.mjs
│       ├── audit-writer.mjs
│       ├── transcript-reader.mjs
│       ├── commit-verifier.mjs
│       ├── filesystem.mjs
│       ├── time-provider.mjs
│       └── config.mjs
├── adapters/
│   ├── api/hooks/
│   │   ├── hook-entry.mjs
│   │   ├── hook-router.mjs
│   │   ├── payload.mjs        # normalise camelCase/PascalCase/snake_case
│   │   ├── decision.mjs       # allow/deny/block/additionalContext
│   │   └── service-factory.mjs
│   └── infrastructure/
│       ├── jsonl-audit-writer.mjs (+null)
│       ├── json-state-reader.mjs
│       ├── state/
│       │   └── json-state-writer.mjs   # atomique + backup ≤3
│       ├── config/
│       │   ├── json-config-reader.mjs
│       │   └── json-config-writer.mjs  # atomique + backup ≤3
│       ├── system-time.mjs (+fixed)
│       └── real-filesystem.mjs (+in-memory)
└── cli/
    ├── hook.mjs               # ← appelé par hooks.json
    ├── state.mjs             # S7 bridge état (write-through)
    ├── config.mjs            # S7 bridge config repo-wide (depthTier)
    ├── health-check.mjs      # US12 diagnostics (fail-open)
    ├── housekeeping.mjs      # US12 SessionStart auto-entretien
    ├── init-log.mjs
    ├── log-phase.mjs
    └── verify-integrity.mjs
```

---

## Garde-fous (G1–G8)

| Garde | Event hook | Matcher | Mode | US | Statut |
|---|---|---|---|---|---|
| G1 ordre dispatch | `PreToolUse` | `Agent` | fail-closed | #3 | 🔲 |
| G2 inject skills | `SubagentStart` | — | fail-open | #4 | 🔲 |
| G3 audit skills | `PostToolUse` | `Read` | fail-open | #4 | 🔲 |
| G4 structure artefacts | `SubagentStop` | — | fail-closed | #8 | ✅ |
| G5 verdict + commit | `SubagentStop` | — | fail-closed | #8 | ✅ |
| G6 continuation | `PostToolUse` | `Agent` | fail-open | #10 | 🔲 |
| G7 deny state.json direct | `PreToolUse` | `Bash` | fail-closed | #11 | 🔲 |
| G8 session guard | `PreToolUse` | `Agent` | fail-closed | #11 | 🔲 |

---

## Hooks déployés

### Claude Code — `plugins/hooks/hooks.json`

| Event | Matcher | Garde activé |
|---|---|---|
| `SessionStart` | — | housekeeping (US12 — rétention audit + signaux) |
| `PreToolUse` | `Agent` | G1 + G8 |
| `SubagentStart` | — | G2 |
| `SubagentStop` | — | G3 vérif + G4/G5 |
| `PostToolUse` | `Agent` | G6 |

### Copilot CLI — `.github/hooks/skraft.json`

| Event | Garde activé |
|---|---|
| `sessionStart` | housekeeping (US12) |
| `preToolUse` | G1 + G8 |
| `subagentStop` | G3 vérif + G4/G5 |

> ⚠️ À compléter (US#51) : aligner Copilot sur tous les events Claude Code.

---

## Ancrage genesis (A9 / S4 / S7)

Le framework réalise trois patterns genesis au niveau runtime :

| Pattern | Rôle dans skraft-framework |
|---|---|
| **A9 SUPERVISED EXECUTION (strong form)** | L'exécution sort de la couche LLM vers un post-stage déterministe **non contournable** via les hooks. |
| **S4 VALIDATION DECORATOR** | Chaque garde-fou **bloque** (pas seulement logge). Anti-pattern évité : « wrapping without blocking ». |
| **S7 DETERMINISTIC TOOL BRIDGE** | L'ordre de dispatch est lu depuis `state.json` — pas inféré. Les phases TDD de DELIVER sont enregistrées via le CLI bridge. |

---

## Modes de défaillance (fail modes)

| Mode | Garde-fous | Comportement |
|---|---|---|
| **fail-closed** | G1, G5, G7, G8 | Retourne `deny`/`block` et arrête l'outil. Un bug du garde-fou ne passe **jamais** silencieusement. |
| **fail-open** | G2, G3, G6 | En cas d'erreur interne du hook, retourne `allow` pour ne pas figer le pipeline. La violation détectée bloque ; le bug du hook ne bloque jamais. |

> Règle d'or : un **bug de hook** ne doit jamais bloquer le pipeline.
> Une **violation d'invariant détectée** doit toujours bloquer.

---

## Comment ajouter un garde-fou

Suivre ces 5 étapes pour ajouter un nouveau garde-fou `Gn` :

### 1. Règle métier pure — `domain/`

Créer `plugins/src/domain/<nom>-policy.mjs` contenant la logique pure
(zero dépendance, pas d'import infra).

```js
// domain/example-policy.mjs
export function validateExample(payload, config) {
  if (/* violation */) return { ok: false, code: 'EXAMPLE_VIOLATION', message: '…' };
  return { ok: true };
}
```

### 2. Service applicatif — `application/`

Créer ou étendre `plugins/src/application/<event>-service.mjs` :
orchestrer domaine + ports (state-reader, audit-writer).

```js
// application/pre-tool-use-service.mjs  (extrait)
import { validateExample } from '../domain/example-policy.mjs';

export async function handlePreToolUse(payload, { stateReader, auditWriter, config }) {
  const result = validateExample(payload, config);
  await auditWriter.append({ event: 'pre-tool-use', result });
  return result;
}
```

### 3. Décision hook — `adapters/api/hooks/`

Dans `hook-router.mjs`, brancher l'event et le matcher sur le service,
puis convertir le résultat en décision (`allow` / `deny` / `block` /
`additionalContext`) via `decision.mjs`.

```js
// hook-router.mjs  (extrait)
case 'PreToolUse':
  const res = await handlePreToolUse(payload, deps);
  return res.ok ? decision.allow() : decision.deny(res.message);
```

### 4. Déclarer dans hooks.json

Ajouter (ou vérifier) l'entrée dans `plugins/hooks/hooks.json` :

```json
{ "event": "PreToolUse", "matcher": "Bash", "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/cli/hook.mjs\" PreToolUse" }
```

### 5. Documenter et tester

- Cocher la case dans le tableau **Garde-fous (G1–G8)** ci-dessus.
- Ajouter un test unitaire `tests/skraft-framework/<policy>.unit.test.mjs`
  (domain pur) et un test d'acceptation `tests/skraft-framework/<feature>.acceptance.test.mjs`
  (boundary-to-boundary avec spy audit-writer).
- Mettre à jour le statut dans `docs/roadmap.md`.

---

## Principes d'implémentation

- **Zéro dépendance runtime** : uniquement `node:fs`, `node:path`, `node:child_process`, `node:test`.
- **Fail-closed limité** : G1/G5/G7/G8 bloquent. Tout le reste = fail-open sur bug de hook.
- **Domain pur** : aucun import du protocole hook dans `domain/`.
- **Audit JSONL append-only** : seam de test observable à la frontière.
- **Result type** : pas d'exception aux frontières (Ok/Err).
- **Cross-platform** : un seul `node <script>` pour Mac et Windows.
