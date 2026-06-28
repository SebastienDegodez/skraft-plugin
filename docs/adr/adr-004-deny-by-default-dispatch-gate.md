<!-- markdownlint-disable-file -->
---
adr: 4
title: Deny-by-default (fail-closed) posture for the dispatch gate
status: Accepted
chosen: fail-closed deny-by-default, realised by a type:command preToolUse(Agent) hook
decision: >
  We will make the dispatch gate deny-by-default and realise it as a type:command preToolUse hook
  matched on the Agent (equivalently task) tool, because preToolUse is the only documented hook event
  that is both pre-execution and able to deny a tool call, and only a command (not http) preToolUse
  hook fails closed.
supersedes: null
date: 2026-06-28
ratified_by: sebastiendegodez (human ratification, 2026-06-28)
---

# ADR-004 — Deny-by-default (fail-closed) posture for the dispatch gate

**Date:** 2026-06-28
**Status:** Accepted
**Deciders:** Solution Architect (US3)

## Context
The guard is a security control: a wrong dispatch burns tokens on garbage artefacts and the failure
is invisible until a human notices the drift. AC-04 requires that when the decision input is absent
or corrupt (missing/truncated/unparseable `state.json`), the dispatch is **blocked**, never allowed.
AC-01 row g requires retry-budget exhaustion to block and signal escalation. The default outcome of
*any* uncertainty must therefore be denial, not continuation.

**Interception point (grounded in the GitHub Copilot hooks reference — hook-events).** A sub-agent
dispatch is the runtime `task` tool. Per the documented runtime → Claude tool-name table, `task`
maps to the Claude tool name **`Agent`** (the literal `Task` is also accepted). The guard therefore
intercepts at the **`preToolUse`** event with matcher **`Agent`** (equivalently **`task`**).
`preToolUse` is the **only** documented event that is BOTH pre-execution AND able to deny a tool
call — the reference states: *"Use preToolUse to make permission decisions."* The alternatives cannot
satisfy AC-02/AC-04:
- `subagentStart` fires before the sub-agent runs but, verbatim, **"cannot block creation"** — it can
  only prepend `additionalContext`. It cannot deny a dispatch.
- `subagentStop` / `agentStop` are decision-control hooks but fire **after** the agent finishes a turn
  — too late for "block before execution".

**Fail-closed depends on the hook *type* (load-bearing for AC-04).** The platform makes **command**
preToolUse hooks **fail-closed** — *"a crash or non-zero exit denies the tool call"* — whereas
**http** preToolUse hooks are **fail-open** — *"a network error, timeout, or non-2xx response falls
through"*. AC-04 (fail-closed) therefore holds **only** if the hook entry is `type: command`. An
`http` entry would silently re-open the exact security hole #49 exists to close.

## Decision
We will make the gate **deny-by-default**, realised as a **`type: command` `preToolUse` hook matched
on `Agent` (equivalently `task`)**. The application service treats the policy `Result` as the sole
authority to proceed — `Ok` → `allow()`; `Err` → a blocked harness decision; and it wraps the entire
evaluation so that any thrown error (state-reader failure, schema failure, unexpected exception) also
resolves to a blocked decision. Mapping onto the existing `decision.mjs` vocabulary: ordinary policy
denial (`OUT_OF_ORDER`) → `deny(reason)`; security/escalation causes (`UNREADABLE_STATE`,
`INVALID_STATE`, `RETRY_EXHAUSTED`) → `block(reason)`. There is **no code path that defaults to
allow**, and the hook entry is pinned to `type: command` so that a crash or non-zero exit denies the
dispatch by construction. An `http` hook entry is forbidden for this gate.

## Consequences
**Positive:**
- Absence of a valid decision input denies — the AC-04 security property holds by construction.
- `type: command` makes a crash / non-zero exit a **deny**, so the fail-closed posture is enforced by
  the platform, not merely by application code.
- No silent wrong/skipped dispatch can occur; failures are loud (blocked + audited).
- The gate runs pre-execution at the one event (`preToolUse`) that can actually deny (AC-02).

**Negative / trade-offs:**
- A corrupt or malformed `state.json` halts the pipeline until the operator repairs it (conservative).
- Over-blocking is possible if the recorded state legitimately drifts from the policy's expectations.
- Pinning `type: command` forecloses an `http`/remote-service hook implementation — the gate must run
  as a local command process.

**Neutral:**
- Every evaluation — allow or block — emits exactly one `DispatchEvaluated` audit entry (AC-03).

## Alternatives rejected

| Alternative | Reason rejected |
|---|---|
| Default-allow when state cannot be read | Directly violates AC-04; turns the guard into a security hole — the exact failure #49 exists to prevent |
| Warn-and-continue on policy denial | Defeats the gate: the agent still runs and produces drifted artefacts before the human sees the warning |
| Treat retry exhaustion as ALLOW (let it run again) | Removes the escalation backstop (AC-01 g); a CHANGES_REQUESTED loop would burn tokens indefinitely |
| Realise the hook as `type: http` | http preToolUse is **fail-open** — a network error, timeout, or non-2xx response falls through and the dispatch runs; silently violates AC-04 |
| Intercept at `subagentStart` instead of `preToolUse` | `subagentStart` "cannot block creation" — it can only prepend `additionalContext`; it cannot deny (fails AC-02/AC-04) |
| Intercept at `subagentStop` / `agentStop` | These fire after the agent finishes its turn — too late to block before execution (fails AC-02) |
