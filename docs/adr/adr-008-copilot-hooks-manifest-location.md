<!-- markdownlint-disable-file -->
---
adr: 8
title: Ship the Copilot hooks manifest at the plugin root, outside the agent-plugin spec
status: Accepted
chosen: duplicate the hooks manifest at <plugin-root>/hooks/hooks.json
decision: >
  The Copilot CLI discovers plugin hooks at the hard-coded path <plugin-root>/hooks/hooks.json and
  ignores the extensions."com.github.copilot".hooks pointer declared in plugin.json. Hook discovery
  is therefore NOT part of the agent-plugin specification. We ship the manifest at the CLI's
  hard-coded path in addition to the spec-declared location, and we verify the wiring with a live
  smoke test rather than with schema validation.
supersedes: null
date: 2026-08-26
ratified_by: "sebastiendegodez (2026-08-26)"
---

# ADR-008 — Ship the Copilot hooks manifest at the plugin root, outside the agent-plugin spec

**Status:** Accepted
**Date:** 2026-08-26
**Ratified by:** sebastiendegodez (2026-08-26)

## Context

`plugins/skraft-framework/plugin.json` declares itself against
`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` and routes each harness to its own
manifest through the `extensions` map:

```json
"extensions": {
  "com.anthropic.claude-code": { "hooks": "./com.anthropic.claude-code/hooks/hooks.json" },
  "com.github.copilot":        { "hooks": "./com.github.copilot/hooks/hooks.json" }
}
```

That indirection is the whole point of the agent-plugin spec: one plugin, one manifest per harness,
each harness reading the pointer that names it.

**The Copilot CLI does not read that pointer.** It looks for hooks at one hard-coded path —
`<plugin-root>/hooks/hooks.json` — and nowhere else.

This was established by bisection against Copilot CLI 1.0.80, using a minimal probe plugin whose
hook command only appends a line to a receipt file:

| Probe layout | Hooks fired |
|---|---|
| `com.github.copilot/hooks/hooks.json` + `extensions` pointer | none |
| skraft-shaped `plugin.json`, minimal manifest under `com.github.copilot/` | none |
| the same probe, manifest copied to `hooks/hooks.json` | `sessionStart` fired |

The three forces that make this worth recording:

**Force 1 — The failure is silent.** A plugin whose hooks are never discovered emits no warning, no
`Invalid hooks config`, nothing in `--log-level debug`. The CLI reports the plugin as installed
(`plugins=1`), loads its agents and its skills, and simply never spawns a hook command. There is no
signal to notice, so the defect survives any amount of reading.

**Force 2 — Schema validation cannot catch it.** `plugin.json` is *valid* against the agent-plugin
schema. The manifest under `com.github.copilot/hooks/hooks.json` is *valid* against the CLI's own
`HookType` enum. Every artifact passes every check, and the wiring is still dead. The property that
matters — "the harness actually spawns this command" — is not expressed in any schema we can
validate against.

**Force 3 — The behaviour is undocumented and unversioned.** Because hook discovery sits outside the
spec, nothing constrains the CLI to keep this path. It is an implementation detail we depend on,
discovered empirically, that can move in any patch release without a deprecation window.

## Decision

**Ship the hooks manifest at `<plugin-root>/hooks/hooks.json`**, the path the Copilot CLI actually
reads, while keeping the spec-declared `extensions` pointer and the per-harness manifest in place.

Consequently:

1. `plugins/skraft-framework/hooks/hooks.json` is the manifest Copilot consumes. It must stay
   byte-identical in intent to `com.github.copilot/hooks/hooks.json`; the two are one manifest shipped
   at two paths, not two manifests.
2. The `extensions` map stays. It is the correct declaration under the spec, it is what Claude Code
   honours, and it is what a future spec-conformant Copilot release would honour.
3. **The wiring is verified by execution, not by validation.** `scripts/copilot-hook-smoke.mjs`
   installs the plugin into a throwaway `COPILOT_HOME` through the real
   `copilot plugin marketplace add` + `copilot plugin install` flow, drives a real session, and
   asserts on observed behaviour: that an audit entry was written, and that a forbidden write was
   actually refused. Nothing short of a live run can assert this property.

## Consequences

**Positive**

- skraft's Copilot hooks run. Before this decision they never had.
- The duplication is a single small file at a known path, reviewable at a glance.
- The smoke test converts a silent, undetectable failure into a failing exit code. Its mutation
  check confirms this: removing `hooks/hooks.json` fails both probes; leaving hooks wired but
  blinding the guard fails the behavioural probe only — a failure mode no log scan would surface.

**Negative**

- Two files must move together. A change to `com.github.copilot/hooks/hooks.json` that forgets the
  root copy leaves the plugin silently hookless again. The existing hook-manifest-parity check must
  cover the root path, and the smoke test is the backstop.
- We depend on an undocumented path. If a future CLI honours the `extensions` pointer, the root copy
  becomes redundant but harmless; if the hard-coded path *moves*, the smoke test is what tells us.

**Neutral**

- Claude Code is unaffected: it reads the `extensions` pointer and never looks at `hooks/`.

## Related

- The same investigation surfaced a second, independent defect: the Copilot CLI sends
  `toolName` lowercased (`"bash"`) and `toolArgs` as a JSON-encoded **string**, where the services
  expect `"Bash"` and a `toolInput` object. That is a wire-vocabulary mismatch, addressed by
  `src/adapters/api/hooks/harness-input.mjs` (the inbound mirror of `harness-output.mjs`), not by
  this ADR.
- ADR-006 — fail-open posture. A hook that is never spawned is the degenerate case of fail-open: the
  pipeline keeps running, with zero enforcement and zero signal. This ADR exists because that
  degenerate case must be detectable.
