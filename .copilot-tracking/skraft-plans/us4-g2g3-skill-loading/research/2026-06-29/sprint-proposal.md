<!-- markdownlint-disable-file -->
# Sprint Proposal — 2026-06-29

Capacity: 5 team-days (effective: 3.5 = 5 × 0.7)

## Recommended Sprint Placement

Issue #50 is **fully unblocked** (all declared dependencies cleared). It is ready for DISCUSS → DESIGN → DISTILL → DELIVER.

**Sprint N (current)**: Complete #49 G1 dispatch order guard (DESIGN artifacts exist at `us3-g1-dispatch-order-guard/details/2026-06-28/`). Finalize `hook.mjs` wiring for G1.

**Sprint N+1 (this proposal — #50)**: Enter #50 into DISCUSS → DELIVER pipeline.

## Sprint N+1 — Ordered Items

| # | Title | Priority | Effort | Dependency Status |
|---|---|---|---|---|
| 50 | [US] #4 G2/G3 forçage du chargement des skills + audit | P1 | L | #47 ✅ #48 ✅ |

**Total effort**: L (~2–3 days)
**Effective capacity used**: 57–86% (within 3.5-day effective window)
**Status**: Within capacity

## Dependency Order Rationale

```
#47 ✅ → #48 ✅ → [#49] → #50
```

1. **#47 (US1)** ✅ — Foundation. Delivers hexagonal skeleton, hook infrastructure (router, service-factory, entry, decision), audit writer, state reader. Without this, nothing builds.
2. **#48 (US2)** ✅ — Config generator. Delivers `framework-config-policy.mjs` and the generated `skraft-framework.config.json` with `agentSkills` populated. Issue #50's `skill-policy.mjs` reads `config.agentSkills` — this is the direct upstream data contract.
3. **#49 (US3)** — Not a formal dependency, but `hook.mjs` composition is shared. Implementing #49 first commits the G1 wiring pattern; #50 extends the same root without conflict.
4. **#50 (US4)** — G2/G3: the last guardrail pair in Phase 1 MVP. After delivery, #8 (Phase 2, G4/G5) can extend `subagent-stop-service`.

## Open Questions for DISCUSS

The following must be resolved before DESIGN can proceed:

| # | Question | Impact |
|---|---|---|
| 1 | **Transcript payload structure at SubagentStop** — does Claude Code provide transcript inline in the hook payload JSON, via a temp file path, or not at all? | Determines the entire `jsonl-transcript-reader.mjs` adapter design |
| 2 | **PostToolUse `Read` matcher scope** — filtering `SKILL.md` reads: manifest-level matcher or service-level path filter? | Architecture of post-tool-use-service and hooks.json entry |
| 3 | **Eager mode definition** — which agents / which skills trigger eager (inline) vs verify (directive only)? Per-agent config, per-skill annotation, or runtime flag? | API shape of subagent-start-service |

## Excluded

No XL issues. No P0 override. No stories requiring splitting.

## Ready for DISCUSS Checklist

- [x] Issue #50 labeled: `type/feature`, `priority/P1`, `effort/L`
- [x] Status: `status/ready`
- [x] No duplicates detected
- [x] No XL issues
- [x] Dependencies verified: #47 ✅, #48 ✅
- [x] Codebase scan complete — existing files identified, missing files enumerated
- [x] Open questions documented for DISCUSS
- [ ] Reviewer approved (pending — backlog-discoverer-reviewer)
