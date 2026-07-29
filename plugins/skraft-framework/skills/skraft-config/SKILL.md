---
name: skraft-config
description: "Use to initialize and configure the repo-wide SKRAFT settings file (skraft-config.json) — chiefly the depthTier strictness dial that governs the whole codebase. Activate on 'configure skraft', 'set depth tier', 'skraft-config init', 'change strictness', or whenever a repo needs its pipeline rigor level set once. All reads and writes go through the deterministic config CLI; never hand-edit the JSON for governed keys."
---
<!-- markdownlint-disable-file -->

# SKRAFT Config — repo-wide configurateur

`skraft-config.json` holds settings that belong to the **repository**, not to any
single work item. Today that is the **depth tier** — the strictness dial that governs
TDD variant, mutation thresholds, reviewer lens count, and the Gherkin gate across
every phase of the pipeline (see `plugins/skills/skraft-difficulty-routing/SKILL.md`
for the tier table). This skill is the configurateur: it initializes and edits that
file. Per-work-item difficulty is NOT here — it lives in `state.json` via the state CLI.

## Determinism contract (S7)

Every read and write of a governed key goes through the config CLI — never hand-edit
`skraft-config.json` for `depthTier` / `depthTierRationale`. The CLI validates values,
preserves unknown human-authored fields, backs up atomically, and returns structured
errors. Agents only need the commands below; they never parse or mutate the JSON.

Portable invocation (same env var on Claude Code and Copilot CLI; `SKRAFT_CONFIG_ROOT`
overrides the base directory, defaulting to the current working directory = repo root):

```bash
node "$CLAUDE_PLUGIN_ROOT/src/cli/config.mjs" <subcommand> [flags]
```

| Subcommand | Flags | Effect |
|---|---|---|
| `init` | — | Create `skraft-config.json` with `depthTier: comprehensive` if absent (idempotent; reports `created`). |
| `get` | `[--key K]` | Read-only. Whole config as JSON, or one scalar (`--key depthTier`). Never writes. |
| `set` | `--key K --value V` | Guarded write. `depthTier` in {basic, standard, comprehensive, custom}; `depthTierRationale` = free text. Rejects unknown keys / invalid values (exit 3). |

Exit codes: `0` success | `1` unknown subcommand | `2` IO/corrupted | `3` invalid value / unknown key / invalid config.

## Configure flow (A9 supervised execution: init then set then verify)

1. **INIT.** Ensure the file exists:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/src/cli/config.mjs" init
   ```
   `{"created":true,...}` means a fresh `comprehensive` default was seeded; `false` means one already existed.

2. **CHOOSE the tier with the user.** Depth tier is a one-time repo decision, not a per-run choice. Present the trade-off and let the user pick:

   ```
   Depth tier governs strictness + token cost for THIS whole repository:
   - basic         Red-Green, no mutation, 1 reviewer lens — prototypes / spikes
   - standard      Red-Green-Refactor, 100% domain mutation, 2 lenses — fast iteration
   - comprehensive Outside-In double-loop, full mutation, 4 lenses — production/default
   - custom        per-gate levels (edit skraft-config.json::customDepth)
   Which tier for this repo? [comprehensive]
   ```

3. **SET.** Persist the choice, and its rationale when downgrading from the default:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/src/cli/config.mjs" set --key depthTier --value standard
   node "$CLAUDE_PLUGIN_ROOT/src/cli/config.mjs" set --key depthTierRationale --value "internal tooling repo, speed over rigor"
   ```
   A non-zero exit with `INVALID_VALUE` / `UNKNOWN_KEY` on stderr means fix the value and re-run — do not fall back to hand-editing.

4. **VERIFY.** Read the value back and surface it to the user:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/src/cli/config.mjs" get --key depthTier
   ```
   Confirm with an emoji line, e.g. `Repo depth tier set to 'standard' (was comprehensive).`

## How other agents consume it

The orchestrator reads the tier at dispatch time (`config.mjs get --key depthTier`) and
passes it into each sub-agent's dispatch context header. Sub-agents receive the value in
their payload and never read `skraft-config.json` themselves.

## Custom tier

For `custom`, the four standard tiers do not apply. The user hand-edits
`skraft-config.json::customDepth` with per-gate enforcement levels; the
`skraft-difficulty-routing` skill validates the combination (it rejects downgrading any
immutable-invariant gate below `blocking`). `customDepth` is a structured field, not a
governed scalar, so it is edited directly rather than through `config.mjs set`.
