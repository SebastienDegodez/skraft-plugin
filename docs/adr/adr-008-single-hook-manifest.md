<!-- markdownlint-disable-file -->
---
adr: 8
title: One hook manifest at hooks/hooks.json, auto-loaded by every harness, pointed at by none
status: Proposed
chosen: ship a single manifest at <plugin-root>/hooks/hooks.json and declare no hooks pointer
decision: >
  Hook discovery sits outside the agent-plugin spec. Every harness loads
  <plugin-root>/hooks/hooks.json on its own — Claude Code and VS Code try it before any manifest
  pointer, and the Copilot CLI reads that path and nothing else, ignoring the extensions map. A
  manifest `hooks` pointer names an ADDITIONAL file, so a second copy registers the same
  guardrails twice. skraft therefore ships exactly one manifest, at that path, in the Claude
  schema, resolving through ${CLAUDE_PLUGIN_ROOT} — the one plugin-root variable all three
  harnesses inject. The wiring is verified by execution, not by validation.
supersedes: null
date: 2026-09-04
ratified_by: null
---

# ADR-008 — One hook manifest at `hooks/hooks.json`, auto-loaded by every harness, pointed at by none

**Status:** Proposed
**Date:** 2026-09-04

## Context

`plugins/skraft-framework/plugin.json` routes each harness to its own assets through the
`extensions` map, and `.claude-plugin/plugin.json` names each component it must read. That
indirection is the point of the agent-plugin spec: one plugin, one manifest per harness, each
harness reading the pointer that names it.

**Hooks do not work that way.** They are discovered at a hard-coded path, and every harness
reaches it without being told.

### What was measured

Against Copilot CLI 1.0.80, through `scripts/copilot-hook-smoke.mjs` — the real
`plugin marketplace add` + `plugin install` flow into a throwaway `COPILOT_HOME`, then a real
session per probe, with the plugin's own audit log as the receipt that a hook process ran:

| Layout under test | `allowed` (hook spawned) | `denied` (G7 refusal honored) |
|---|---|---|
| `com.github.copilot/hooks/hooks.json` + `hooks` pointer in both `plugin.json` files | no audit entry | forbidden write **went through** |
| no manifest at the plugin root | no audit entry | forbidden write **went through** |
| `hooks/hooks.json`, Claude schema, `${CLAUDE_PLUGIN_ROOT}` | passed | **DENY recorded, write refused** |

Three findings fall out of it:

1. **The CLI reads one hard-coded path and ignores the pointer.** Declaring
   `extensions."com.github.copilot".hooks` — in the portable manifest, in the Claude one, or in
   both — fires nothing. Hook discovery is not part of the spec we package against.
2. **The Copilot CLI accepts the Claude schema.** PascalCase events, `matcher`, `command` — the
   manifest that passed is byte-for-byte the one Claude Code and VS Code already run. No
   Copilot-shaped twin is needed.
3. **`${CLAUDE_PLUGIN_ROOT}` is the portable name.** For a plugin-sourced hook the CLI injects
   `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT` and `PLUGIN_ROOT` alike; VS Code injects only the
   first. The intersection is one variable, so a manifest never needs another.

### A pointer is a second registration, not a route

The Claude-family adapter resolves `<plugin-root>/hooks/hooks.json` first, then adds every file
named by `manifest.hooks`, de-duplicating only on resolved path. It names the intent in its own
error text:

> Duplicate hooks file detected: `<pointer>` resolves to already-loaded file `<path>`. **The
> standard `hooks/hooks.json` is loaded automatically, so `manifest.hooks` should only reference
> additional** [files]

So a pointer to a *different* file does not route a harness anywhere — it registers a second
copy. Every guardrail in it evaluates twice and every audit line is written twice.

### Why a second copy is where drift lands

On 2026-09-04 a Copilot-schema copy — camelCase events, `bash`/`powershell` keys, commands
resolved through `${PLUGIN_ROOT}` — was found parked at the Claude manifest's path in an
installed checkout. VS Code injects `CLAUDE_PLUGIN_ROOT` and no other plugin-root name, so
`${PLUGIN_ROOT}` expanded to nothing and every hook died on
`Cannot find module '/src/cli/hook.mjs'` — for a week, without a single failed session. Two
manifests that must stay in intent-parity while deliberately differing in *one token* is a shape
no reviewer diffs correctly.

### The three forces that make this worth recording

**Force 1 — The failure is silent.** A plugin whose hooks are never discovered emits no warning,
no `Invalid hooks config`, nothing in `--log-level debug`. The CLI reports the plugin as
installed, loads its agents and its skills, and simply never spawns a hook command. There is no
signal to notice, so the defect survives any amount of reading.

**Force 2 — Schema validation cannot catch it.** Both manifests are *valid*: `plugin.json`
against the agent-plugin schema, the hook file against the CLI's own `HookType` enum. Every
artifact passes every check and the wiring is still dead. The property that matters — "the
harness actually spawns this command" — is not expressed in any schema we can validate against.

**Force 3 — The behaviour is undocumented and unversioned.** Because hook discovery sits outside
the spec, nothing constrains a CLI to keep this path. It is an implementation detail we depend
on, discovered empirically, that can move in any patch release without a deprecation window.

## Decision

**Ship one manifest, at `<plugin-root>/hooks/hooks.json`, in the Claude schema, resolving
through `${CLAUDE_PLUGIN_ROOT}`. Declare no `hooks` pointer in any manifest.**

Consequently:

1. No manifest ships under `com.anthropic.claude-code/hooks/` or `com.github.copilot/hooks/`,
   and no `hooks` field appears in `plugin.json`, `.claude-plugin/plugin.json` or
   `.codex-plugin/plugin.json` — under the auto-load rule such a field can only add a duplicate.
2. The `extensions` map stays for the assets it does govern (agents, rules). It is the correct
   declaration under the spec; it simply has no say over hooks.
3. `.github/hooks/skraft-framework.json` stays as it is. It serves a different consumer — a repo
   checkout with no installed plugin — and its commands are repo-relative by necessity.
4. **The wiring is verified by execution, not by validation.** `scripts/copilot-hook-smoke.mjs`
   drives a real session and asserts on observed behaviour: that an audit entry was written, and
   that a forbidden write was actually refused. Nothing short of a live run can assert that.

## Consequences

**Positive**

- skraft's guardrails run under the Copilot CLI on an installed plugin. Before this decision
  they never had, and the smoke test shows the forbidden write landing on disk.
- One file, one schema, one variable. There is no parity duty between manifests, and no place
  for the token drift that broke VS Code.
- No double evaluation and no doubled audit lines on the Claude-family harnesses.
- The smoke test converts a silent, undetectable failure into a failing exit code. Its mutation
  check confirms this: removing the manifest fails both probes; leaving hooks wired but blinding
  the guard fails the behavioural probe only — a failure mode no log scan would surface.

**Negative**

- We depend on an undocumented, unversioned path. If a future release honours the `extensions`
  pointer instead, this layout keeps working; if the hard-coded path *moves*, the smoke test is
  what tells us.
- Codex is unverified: it is pointed at by nothing now, so if its adapter does not auto-load the
  standard path, its hooks stop firing — silently, like every hook discovery failure.

**Neutral**

- `com.anthropic.claude-code/` keeps the agent tree and `com.github.copilot/` keeps the rules
  tree. Hooks are simply no longer a per-harness asset.

## Related

- ADR-006 — fail-open posture. A hook that is never spawned is the degenerate case of fail-open:
  the pipeline keeps running, with zero enforcement and zero signal. This ADR exists because that
  degenerate case must be detectable.
- The same investigation surfaced a second, independent defect: the Copilot CLI sends `toolName`
  lowercased (`"bash"`) and `toolArgs` as a JSON-encoded **string**, where the services expect
  `"Bash"` and a `toolInput` object. That is a wire-vocabulary mismatch, addressed by
  `src/adapters/api/hooks/harness-input.mjs`, not by this ADR.
