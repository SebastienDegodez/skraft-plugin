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
| 2 | Générateur de config data-driven | 🔲 À faire | — |
| 3 | G1 garde d'ordre de dispatch | 🔲 À faire | — |
| 4 | G2/G3 forçage skills + audit | 🔲 À faire | — |
| 5 | Manifests hooks Copilot + Claude | ✅ Scaffold | `hooks/hooks.json`, `.github/hooks/skraft.json`, `src/cli/hook.mjs` (stub) |
| 6 | Tests boundary-to-boundary | 🔲 À faire | — |
| 7 | Documentation + roadmap.md | 🔲 À faire | — |
| 8 | G4/G5 artefacts + verdict + commit | 🔲 À faire | — |
| 9 | S7 execution-log + CLI bridge | 🔲 À faire | — |
| 10 | G6 continuation orchestrateur | 🔲 À faire | — |
| 11 | G7/G8 protection d'état + session guard | 🔲 À faire | — |
| 12 | Observabilité | 🔲 À faire | — |
| 13 | Recovery / rollback | 🔲 À faire | — |
| 16 | Déploiement hooks dans le projet consumer | 🔲 À faire | — |

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
│   └── execution-log-schema.mjs
├── application/
│   ├── pre-tool-use-service.mjs
│   ├── subagent-start-service.mjs
│   ├── subagent-stop-service.mjs
│   ├── post-tool-use-service.mjs
│   ├── session-start-service.mjs
│   └── config-loader.mjs
├── ports/
│   ├── api/                 # contrats entrants (appelés par la couche Api)
│   │   ├── pre-tool-use.mjs
│   │   └── subagent-stop.mjs
│   └── infrastructure/      # contrats sortants (implémentés par l'infra)
│       ├── state-reader.mjs
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
│       ├── system-time.mjs (+fixed)
│       └── real-filesystem.mjs (+in-memory)
└── cli/
    ├── hook.mjs               # ← appelé par hooks.json
    ├── init-log.mjs
    ├── log-phase.mjs
    ├── verify-integrity.mjs
    └── health-check.mjs
```

---

## Garde-fous (G1–G8)

| Garde | Event hook | Matcher | Mode | US | Statut |
|---|---|---|---|---|---|
| G1 ordre dispatch | `PreToolUse` | `Agent` | fail-closed | #3 | 🔲 |
| G2 inject skills | `SubagentStart` | — | fail-open | #4 | 🔲 |
| G3 audit skills | `PostToolUse` | `Read` | fail-open | #4 | 🔲 |
| G4 structure artefacts | `SubagentStop` | — | fail-closed | #8 | 🔲 |
| G5 verdict + commit | `SubagentStop` | — | fail-closed | #8 | 🔲 |
| G6 continuation | `PostToolUse` | `Agent` | fail-open | #10 | 🔲 |
| G7 deny state.json direct | `PreToolUse` | `Bash` | fail-closed | #11 | 🔲 |
| G8 session guard | `PreToolUse` | `Agent` | fail-closed | #11 | 🔲 |

---

## Hooks déployés

### Claude Code — `plugins/hooks/hooks.json`

| Event | Matcher | Garde activé |
|---|---|---|
| `PreToolUse` | `Agent` | G1 + G8 |
| `SubagentStart` | — | G2 |
| `SubagentStop` | — | G3 vérif + G4/G5 |
| `PostToolUse` | `Agent` | G6 |

### Copilot CLI — `.github/hooks/skraft.json`

| Event | Garde activé |
|---|---|
| `preToolUse` | G1 + G8 |
| `subagentStop` | G3 vérif + G4/G5 |

> ⚠️ À compléter (US#51) : aligner Copilot sur tous les events Claude Code.

---

## Principes d'implémentation

- **Zéro dépendance runtime** : uniquement `node:fs`, `node:path`, `node:child_process`, `node:test`.
- **Fail-closed limité** : G1/G5/G7/G8 bloquent. Tout le reste = fail-open sur bug de hook.
- **Domain pur** : aucun import du protocole hook dans `domain/`.
- **Audit JSONL append-only** : seam de test observable à la frontière.
- **Result type** : pas d'exception aux frontières (Ok/Err).
- **Cross-platform** : un seul `node <script>` pour Mac et Windows.
