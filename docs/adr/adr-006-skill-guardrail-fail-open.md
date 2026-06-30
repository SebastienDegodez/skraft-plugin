<!-- markdownlint-disable-file -->
---
adr: 6
title: Fail-open posture for skill-loading monitoring services
status: Accepted
chosen: fail-open on all three monitoring error paths
decision: >
  All three skill-loading services (subagent-start, subagent-stop, post-tool-use) are fail-open
  on their respective error paths because these services are monitoring layers, not routing
  controls, and blocking agents due to monitoring infrastructure failures causes operational
  disruption without a corresponding safety benefit.
supersedes: null
date: 2026-06-29
ratified_by: "sebastiendegodez (2026-06-30)"
---

# ADR-006 — Fail-open posture for skill-loading monitoring services

**Status:** Accepted
**Date:** 2026-06-29
**Ratified by:** sebastiendegodez (2026-06-30)

## Context

ADR-004 established **fail-closed** for the dispatch gate: when the routing decision input is absent or corrupt, the pipeline is blocked. This is correct for a **routing control** — a wrong dispatch silently corrupts pipeline state with no recovery path.

The skill-loading guardrail (US4 / #50) introduces three new application services:

| Service | Hook | Error path |
|---|---|---|
| `subagent-start-service` | SubagentStart | Eager SKILL.md file cannot be read |
| `subagent-stop-service` | SubagentStop | `payload.transcript` absent or empty (DD-1) |
| `post-tool-use-service` | PostToolUse Read | JSONL audit write fails (I/O error) |

These services are **monitoring and observability** layers. The question is: what should happen when the monitoring infrastructure fails?

**Force 1 — Operational resilience:** A well-behaved agent that loaded all mandatory skills correctly must not be blocked because the audit writer's filesystem is temporarily unavailable, the Claude Code runtime omitted the transcript, or a skill file is temporarily unreadable.

**Force 2 — Compliance strictness:** A fail-closed posture would guarantee that no agent runs without a compliance check. However, transcript absence is a runtime constraint (DD-1: the runtime does not guarantee transcript presence), not a compliance signal. Blocking on a runtime limitation is not equivalent to blocking on proven non-compliance.

**Force 3 — Asymmetry with ADR-004:** The dispatch gate blocks on uncertainty because the cost of a wrong dispatch (corrupted pipeline) exceeds the cost of the block (operator intervention). The audit gate does not have this asymmetry: the cost of a missed audit entry is a bounded observability gap; the cost of blocking a correct agent is always higher.

## Decision

All three skill-loading services are **fail-open** on their respective error paths:

1. **Transcript unavailable** (`subagent-stop-service`): catch `TRANSCRIPT_UNAVAILABLE`, emit a WARN audit entry (`reason: 'transcript_unavailable'`), return `allow()`.
2. **Audit write failure** (`post-tool-use-service`): swallow the exception, return `allow()`.
3. **Eager read failure** (`subagent-start-service`): catch the error, emit a WARN audit entry (`reason: 'eager_read_failed'`), fall back to the verify directive, return `additionalContext`.

In all three paths the service returns a valid `HarnessDecision` (never throws, never returns `undefined`). The monitoring failure is surfaced as a WARN audit entry.

## Consequences

**Positive:**
- A well-behaved agent that loaded all skills is never penalised by monitoring infrastructure failures.
- WARN audit entries make monitoring failures visible without causing pipeline disruption.
- The fail-open design is testable with in-memory doubles at each error path.

**Negative / trade-offs:**
- When the transcript is absent, a skill-drifted agent may complete its session undetected for that invocation.
- A persistent audit write failure generates WARN entries silently; the operator must monitor WARN events.
- The asymmetry between ADR-004 (fail-closed) and ADR-006 (fail-open) requires explicit documentation so future contributors do not inadvertently "fix" the guardrail to fail-closed.

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Full fail-closed (block on any error for all three services) | Blocks well-behaved agents when monitoring infrastructure fails. Transcript absence is not a compliance signal — it is a runtime limitation. |
| Fail-closed on transcript absence, fail-open on audit failure | Inconsistent: transcript absence is a runtime constraint (DD-1), not evidence of non-compliance. |
| Do without (remove the pattern) | Without a documented posture, implementers default to rethrowing, which causes agent-blocking failures in production. |
