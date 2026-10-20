<!-- markdownlint-disable-file -->
---
adr: 2
title: Copilot host driver contract — measured host facts, isolated registration, live session directory, host-confirmed human decisions
status: Proposed
chosen: every Copilot host behaviour the driver relies on is measured by eng/host-probe and pinned by a test; registration isolates each component; the session directory follows session.context_changed; nothing throws on the run path; arguments never choose what runs; a human decision recorded under Copilot needs the host's confirmation
decision: >
  The Copilot driver (drivers/copilot-workflow and its extension entry) is held to a contract.
  Host behaviours are measured, versioned and tested, not read off documentation. One file
  imports the SDK and registration is testable, each component built and joined in isolation,
  failures reported through session.log. The working directory is read from
  session.context_changed per run and per call, never captured at load. The run path returns
  an outcome for every failure. Arguments are model-written: unknown keys are refused and no
  argument selects an executable, an agent or a model outside what the engine controls. Messages
  are fixed by code. A human decision recorded from Copilot is written only after
  session.ui.confirm or select returns it, never in autopilot, with host-confirmed provenance
  the engine requires for ADR ratification. Commands are cancellable, time-bounded,
  output-bounded and end their process tree. No pre-tool hook.
date: 2026-10-20
ratified_by: null
---

# ADR-002 — Copilot host driver contract

**Status:** Proposed
**Date:** 2026-10-20
**Amends:** [ADR-001](adr-001-host-neutral-engine-with-drivers.md) decision 2 (drivers) and 5 (zero hooks), without reversing them.
**Issues:** #244 (confirmation), #245 (session directory), #246 (isolation), #247 (result), #248 (processes), #249 (arguments), #250 (messages), #251 (host verification)

## Context

The engine is tested with InMemory doubles and a simulated `ctx`. The Copilot driver above it is
347 lines and relies on host behaviours that are neither measured nor pinned by a test. No test
imports `extension.mjs`. Reading the driver on `integration/v2-next` (`d55e348`) gives:

- `extension.mjs` captures `process.cwd()` once, at load. A tool invocation carries no directory
  (SDK `ToolsExecuteRequest`), and the SDK emits `session.context_changed` when the session's
  directory moves (`/cd`, `session.metadata.setWorkingDirectory`). Whether the extension process
  keeps its first `process.cwd()` is what the probe check `cwd-after-cd` measures.
- One `joinSession({ workflows, tools })` with no `try` and no log. A definition that throws, or a
  tool the host refuses, removes both components without a word. stdout is the JSON-RPC channel.
- `skraft_decide` is an ordinary session tool: the model can call it. The `adr` node acts on its
  answer and commits `docs(adr): ratify …`. The journal records `by: 'decide'` whoever called it.
  Under Claude Code `/skraft decide` is typed by the person, so the two hosts differ.
- `runGuarded` rethrows anything but `JournalConflict`. What the host returns for a workflow
  that throws (status, result) is what the probe check `throwing-workflow` measures.
- Unknown workflow arguments are ignored; `agentIds` and `models` choose the session agent and the
  model of a step.
- `node-processes.mjs` has no cancellation, ceiling, output cap or process-group termination.
- Exception text and stderr reach the journal and later prompts.
- The SDK's `WorkflowContext` exposes `session`, and `session.ui` offers `confirm`, `select` and
  `elicitation` when the host declares `capabilities.ui.elicitation`. A human question can be asked
  inside the run, with `ctx.pause` + a tool as the fallback.

## Decision

1. **Host facts are measured.** Every host behaviour the driver relies on has a check in
   `eng/host-probe/copilot-probe.mjs` (headless SDK host, no model call). Results are recorded with
   the CLI and SDK versions in `docs/v2/host-verification.md`, with a "Not verified" section. A code
   comment that states a host behaviour names the version it was measured on. A behaviour that is
   only documented is written as such.
2. **One SDK import, testable registration.** Only the extension entry imports
   `@github/copilot-sdk/extension`. It hands `defineWorkflow` and `joinSession` to a `register`
   function that is unit-tested with a fake SDK. Each component is built in its own `try`. A
   refused join is retried without the tool; the workflow is never the one dropped. Every failure
   is reported through `session.log(…, { level: 'error' })` once joined, naming what is missing.
   Nothing is written to stdout. Nothing starts at import (no server, no process).
3. **Live session directory.** A tracker fed by `joinSession`'s `onEvent` (registered before the
   join RPC) follows `session.context_changed`; absolute paths only. The workflow reads it when
   each run starts, each tool on each call. No driver captures the directory at load.
4. **An outcome for every failure.** Nothing on the run path throws for a reason a caller should
   see. An unexpected exception becomes `{ status: 'error', code: 'unexpected', reason: <fixed> }`;
   cancellation (`ctx.signal`) is rethrown. Every outcome key is always present. The one gating
   rule for a caller: the run is `completed` and `outcome.status` is what it expects.
5. **Arguments are untrusted.** Workflow and tool arguments are written by a model that may have
   just read repository content, and extension code runs outside the host's permission prompts.
   The driver validates them itself: unknown keys are refused with a fixed message that does not
   echo the value. No argument selects an executable. An agent or a model comes from the workflow
   and `skraft-config.json` (protected by `engineFiles`); an `agentIds` entry is accepted only for
   an agent the session lists and the workflow declares.
6. **Fixed messages.** What reaches a model (journal, outcome, prompts, tool results) is chosen by
   code (`ENOENT`, `ETIMEDOUT`, signal, output too large…), never exception text or stderr. Raw
   output stays in a details file for the person. A sentinel test plants a known string in stderr
   and in thrown errors and asserts it reaches none of those outputs.
7. **Human decisions need the host.** Under Copilot, a decision is recorded only when
   `session.ui.confirm` (or `select`) returns it: a literal `true` (or one of the offered options)
   within two minutes. The driver refuses when the host does not declare elicitation, when the
   agent mode is `autopilot`, or when `rpc.mode.get` does not answer within 5 s, and points to
   `skraft decide` typed in a terminal. Requests are rate-limited per process. The dialog text is
   fixed: slug, question key, answer. The journal records `by: 'host-confirmed'` (Copilot) or
   `by: 'decide'` (typed command), and the engine refuses an ADR ratification whose provenance is
   neither. No agent, skill or prompt names `skraft_decide`; a wiring test enforces it.
8. **Bounded processes.** `CommandRunner.run` takes `signal` and `timeoutMs`. Programs start with
   stdin closed and no shell. On POSIX the child gets its own process group, ended as a whole
   (SIGTERM, SIGKILL after 1 s); groups still alive are ended when the host process exits or is
   signalled. Output is capped. On Windows only the direct child is ended unless `taskkill /T` is
   used: a written limit.
9. **No pre-tool hook.** A pre-tool hook decides before the tool runs, so an extension that does
   not answer would hold the call: extension liveness would gate every call. If a Copilot hook comes back under ADR-001's re-entry criterion,
   it is post-tool, returns `additionalContext` only (never `permissionDecision`), carries ids, not
   repository text, and bounds its own time.
10. **Canvas (lot 8).** Where the panel renders (Copilot app, CLI terminal session) is measured
    before the PRD says so (#251). Server started in `open()`, one per panel, with a per-panel token checked in constant time,
    a same-origin `Origin` on POST, `default-src 'none'` CSP, DOM built with `textContent`. Its
    actions are model-callable: read-only, except an answer button that goes through decision 7.
    An action that spends model credits states its cost before running.
11. **A check counts once seen failing.** A new probe check, gate or test is first observed failing
    on an input it must reject, and that input stays as a permanent case. A report states what it
    examined (files, mutants, commits replayed), so that "found nothing" and "could not look" never
    read the same.

## Consequences

**Positive**

- The Copilot path stops depending on unmeasured assumptions; a CLI update that changes one of
  them fails the probe or a test instead of a user's run.
- ADR ratification under Copilot needs a person, as it already does under Claude Code.
- A failure is reported, never silent: registration, run, process.

**Negative**

- The probe needs a local Copilot CLI and its SDK; it cannot run in the sandboxed CI until a
  pinned CLI is installed there.
- Under a host without elicitation, a Copilot user answers a question from a terminal.

## Alternatives rejected

- **Trust the tool description** to keep the model from calling `skraft_decide`: persuasion, not a
  control.
- **A pre-tool hook guarding `skraft_decide`**: makes extension liveness a gate (decision 9) and
  does not exist under every host.
- **Read the directory from `process.cwd()` at each call**: the extension process does not move
  with the session.

## Related

- [ADR-001](adr-001-host-neutral-engine-with-drivers.md) — engine, drivers, zero hooks.
- [docs/v2/host-verification.md](../v2/host-verification.md) — probe results.
- `eng/host-probe/` — the probe; `tests/tooling/host-probe/` — its tests on a simulated SDK.
