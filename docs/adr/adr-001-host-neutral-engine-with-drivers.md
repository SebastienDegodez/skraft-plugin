<!-- markdownlint-disable-file -->
---
adr: 1
title: Host-neutral engine with use cases, driven by a Claude Code mod, a Copilot dynamic workflow and a VS Code fallback
status: Proposed
chosen: one engine of use cases, depth-1 host drivers (Claude Code mod, Copilot dynamic workflow, Copilot SDK under VS Code with an agent-loop fallback), controls in code, zero hooks
decision: >
  The SKRAFT pipeline is a host-neutral engine of use cases (RunPipeline, Decide, ClosePhase,
  Observe) under plugins/skraft-framework/engine/. Host drivers execute what the engine asks and
  are the only callers that spawn agents (depth 1): the Claude Code mod and the GitHub Copilot
  dynamic workflow are primary; under VS Code, the Copilot SDK runs the workflow driver, and an
  agent-driven `skraft next` / `skraft record` loop is the fallback. Phase order, expected
  outputs, write scope (git diff per step), gates and review verdict are computed by the engine.
  V2 starts with zero hooks. The workflow is a developer-customisable DOT graph whose DELIVER
  gates are locked. The v1 engine is deleted on integration/v2-next and compared against main by
  eng/regression/.
date: 2026-10-10
ratified_by: null
---

# ADR-001 — Host-neutral engine with use cases and host drivers

**Status:** Proposed
**Date:** 2026-10-10
**Numbering:** the v1 ADRs were removed on this branch; V2 numbering starts here. v1 ADRs remain on `main`.
**Plan:** [docs/v2/prd.md](../v2/prd.md) · epic #211, lot 0 #212

## Context

The previous V2 attempt (`integration/v2`) moved the pipeline from the 29 KB orchestrator prose into a `RunPipeline` use case
driven by a Claude Code mod and a Copilot dynamic workflow. On `integration/v2` that left
**no path under VS Code**: VS Code has neither `$.agent.spawn` nor `ctx.agent`, and the
orchestrator had become a 1.7 KB launcher with no tools, so the pipeline no longer ran there.
VS Code on Windows and macOS is the main user setting (an 8 h run on a near-empty .NET project).

Other forces measured on `main` 1.14.1 and `integration/v2`:

- Hooks: five matcher-less entries, one `node` spawn per tool call; provenance never sees a
  caller name; G3 trace inert under Claude Code; G8 blocks DELIVER under Copilot (#206); G7 parses
  POSIX shells only.
- Nested agents: the DELIVER reviewer spawns its lenses (depth 2); checks are duplicated
  between prose, `qg-verify`, lenses and briefs.
- `integration/v2` kept the v1 `src/` tree alongside the new code, including the policies
  (`session-guard-policy`, `shell-command-reading`, `handoff-policy`) whose only purpose was
  to police an LLM writing state through the shell.

`integration/v2` is therefore not kept as is: it is frozen as a code reference, and its
reusable parts (workflow and mod adapters, Canvas, `fake-host.mjs`, `review/*` domain) come back
into the new engine through acceptance tests, not by bulk copy.

## Decision

1. **One engine, host-neutral.** `plugins/skraft-framework/engine/` holds `domain/` (pure
   policies), `application/` (use cases `RunPipeline`, `Decide`, `ClosePhase`, `Observe`,
   `Init`, `Doctor`, with ports `AgentRunner`, `HumanInteraction`, `PipelineProgress`…),
   `infrastructure/` and `drivers/`. `domain` and `application` import neither Node nor `$`,
   so the mod module (no Node) and the Copilot extension (Node) can both load them. A driver
   never imports another driver.
2. **Drivers.** Primary: the Claude Code mod (`$.agent.spawn`, `$.ui.ask`, panel) and the
   GitHub Copilot dynamic workflow (`ctx.agent`, `ctx.pause`, Canvas). Under VS Code: the
   Copilot SDK runs the workflow driver; when the SDK is unavailable, the orchestrator agent
   runs the `skraft next` / `skraft record` / `skraft decide` loop (sequential lenses, same
   journal). `skraft doctor` states which one will run and why. No driver decides order,
   verdict or progress.
3. **Depth 1.** Only the driver spawns agents, lenses included (in parallel when the host
   allows). No agent spawns another agent.
4. **Controls in code.** The engine computes phase order, expected outputs (pre-created from
   templates, validated by schema, one retry then a named stop), write scope (git diff after
   each step against the agent's declared paths), gates (commands from `skraft-config.json`,
   evidence written by the engine) and the review verdict (typed findings, BLOCKER/HIGH
   refutation).
5. **Zero hooks at start.** V2 ships no hook manifest. G1/G9 are engine checks, G7 is the hash
   chain, G8 is the git-diff write scope. **Re-entry criterion:** a hook comes back only if it
   guards an irreversible action the engine cannot detect afterwards, its per-call cost is
   measured, and it works on all three hosts or documents its failure mode.
6. **Customisable workflow.** The pipeline is a DOT graph (`workflows/pipeline.skraft.dot`) the
   developer can eject and edit (agents, lenses, gates, questions); the engine validates it
   before any run (start/end present, every node reachable, `max_visits` on every loop, agents
   resolvable). DELIVER gate nodes are `locked`: removal requires `unlock="<reason>"`, which is
   journaled and shown in the run report and the PR. Engine controls (journal, write scope) are
   not nodes and cannot be removed.
7. **Tracking.** State stays in `.copilot-tracking/skraft-plans/<slug>/`; `state.json` is
   replaced by `events.jsonl`, each line carrying the hash of the previous one. State is
   derived on read; a broken chain stops the run. `.active-slug` is mandatory, never guessed.
8. **Configuration.** `skraft-config.json` lists components (root, stack, src/test paths,
   commands), across several technologies and several repositories. Base for diffs, `since`
   mutation and gates = `git merge-base HEAD main` per repository, unless overridden by
   `baseBranch` (global or per component) or `--base <ref>` at launch; the chosen base is
   journaled. Hand-edited commands win; quality thresholds are not configurable.
9. **Branches.** The v1 engine (`src/`, hooks, `state`/`artifact`/`report` CLI, generated
   `skraft-framework.config.json`) and its tests are deleted on `integration/v2-next` at lot 0.
   Agents and skills stay as content the engine launches. v1 lives on `main`;
   `eng/regression/` runs both on the same fixtures and agent suites and blocks a lot PR that
   regresses without a written reason.

## Consequences

**Positive**

- One implementation for three hosts, the VS Code path included.
- Zero per-tool-call overhead by default (NFR-3); guards are invariants of the dispatching
  code, testable with InMemory doubles and a simulated host.
- Teams can extend the pipeline without forking the plugin, without removing DELIVER gates
  silently.
- The branch contains only code written under the V2 test doctrine.

**Negative**

- Copilot dynamic workflows, extensions and Canvas are in preview; the mod runtime has no Node.
  Thin adapters, CI-pinned CLI versions and `claude plugin validate` mitigate, not remove, this.
- The VS Code fallback is slower (sequential lenses, one round trip per step) and relies on an
  agent following a loop; the engine refuses any `next` before the previous step is recorded.
- With no hooks, an agent dispatched by hand outside the engine is not stopped; misuse is
  detected afterwards (hash chain, git diff), not prevented.
- Until 2.0.0, v1 and v2 live on two branches; the regression baseline must be refreshed when
  `main` moves.

**Neutral**

- The v1 fail-closed dispatch posture survives as an engine check.
- The v1 hook packaging does not apply to V2; its record stays on `main`.

## Alternatives rejected

- **Standalone engine (server or binary, as Archon or Fabro).** Drives agents from outside the
  host, needs its own provider credentials and breaks "skraft lives in the host". Their
  modelling ideas (typed nodes, goal gates, `max_visits`, failure classes, event journal) are
  kept; their execution form is not.
- **Agent-driven loop as the primary driver.** Works everywhere but costs a round trip per step,
  serialises lenses and leaves progress to a model that can drift. Kept only as the VS Code
  fallback.
- **Keeping the hooks.** Per-call `node` cost on every host, unequal behaviour between hosts
  (#206), and checks the engine now performs from its own journal and git diff.
- **Keeping `integration/v2` as the base.** No VS Code path, and v1 policies cohabiting with
  the new code.

## Related

- v1 ADRs (result type, config cascade, fail-closed dispatch, hook packaging) remain on `main`.
- The `integration/v2` attempt, frozen as a code reference, is replaced by this decision.
