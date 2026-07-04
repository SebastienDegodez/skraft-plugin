---
description: "CLI-ensemble freshness discipline: after editing agents, CLI sources, hooks or the plugin manifest, run the deterministic freshness gate — never assert freshness in prose"
applyTo: '**/plugins/{src/cli,src/adapters/api/hooks,agents,hooks,.claude-plugin}/**'
---
<!-- markdownlint-disable-file -->

# SKRAFT CLI Freshness Conventions

The SKRAFT plugin ships a CLI ensemble (build-config, resolve-model, state,
check-freshness, hook.mjs) plus generated artifacts (skraft-framework.config.json)
and distribution manifests (plugin.json, package.json, apm.yml). Their coherence
is verified by a deterministic tool, never by an LLM assertion.

## After any edit under this scope

1. Run the local gate suite:

   ```bash
   node scripts/local-ci.mjs
   ```

2. Treat a non-zero exit as BLOCKING. Fix the reported drift, re-run. Common repairs:
   - `drift: plugins/skraft-framework.config.json` → `node plugins/src/cli/build-config-bin.mjs --apply`
   - `VERSION_DESYNC` → align `plugins/src/package.json` / `apm.yml` /
     regenerate the config so every surface matches `plugins/.claude-plugin/plugin.json`
     (the version SSOT).
   - `UNROUTED_HOOK` → either add the route to
     `plugins/src/adapters/api/hooks/hook-router.mjs` (`SUPPORTED_HOOK_TYPES`)
     or remove the entry from `plugins/hooks/hooks.json`.
   - `CI_GATE_MISSING` → add the matching step to
     `.github/workflows/skraft-framework-ci.yml` (gate list lives in
     `scripts/lib/ci-gates.mjs`).

3. Never claim "the config is in sync", "versions are aligned" or "hooks are wired"
   in prose. The exit code of the gate is the only acceptable evidence. Quote it.

## Version bumps

`plugins/.claude-plugin/plugin.json` is the master version. Do not hand-bump it in
feature work — the release workflow computes the bump from Conventional Commits and
aligns `package.json`, `apm.yml` and the generated config in one pass.

## Staleness check outside Claude Code

The SessionStart staleness notice only exists inside Claude Code (hooks). On any
other harness (Copilot, Cursor), check manually:

```bash
node plugins/src/cli/check-freshness-bin.mjs --remote        # human output
node plugins/src/cli/check-freshness-bin.mjs --remote --json # machine output
```

Same daily cache, same fail-open behaviour; always exits 0 (observability, not a gate).
