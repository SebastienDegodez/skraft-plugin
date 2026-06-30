<!-- markdownlint-disable-file -->
---
adr: 7
title: Eager mode activation via per-skill policy field extension
status: Accepted
chosen: extend existing policy field in agentSkills entries to accept 'eager'
decision: >
  We will activate eager mode (inline SKILL.md content in additionalContext) by extending the
  existing per-skill policy field in agentSkills entries from an implicit 'verify' default to
  an explicit 'verify' | 'eager' union, reusing the Published Language shape established by
  ADR-005 without adding a new config key.
supersedes: null
date: 2026-06-29
ratified_by: "sebastiendegodez (2026-06-30)"
---

# ADR-007 — Eager mode activation via per-skill `policy` field extension

**Status:** Accepted
**Date:** 2026-06-29
**Ratified by:** sebastiendegodez (2026-06-30)

## Context

AC-03 (US4 / #50) requires that agents with at least one skill declared as eager receive the full SKILL.md content inlined in their `additionalContext` at SubagentStart. The question is **where and how** the eager designation is declared.

ADR-005 established the `agentSkills` shape as the Published Language for this framework:
```
agentSkills: { [agentName]: [{ name: string, policy: string }, ...] }
```
The `policy` field already exists in this shape. Its current semantic is `'verify'` (the default). US4 DD-3 evaluated three activation mechanisms:

1. **Extend `policy` field** — add `'eager'` as a new valid value alongside `'verify'`. Reuses the existing field; no new config key; per-skill granularity preserved.
2. **Top-level `eagerMode: true/false` per agent** — simpler; but coarser (all-or-nothing per agent); adds a new config key to the Published Language.
3. **Separate `eagerSkills: [string[]]` per agent** — clearest semantic separation; but introduces a second list alongside `agentSkills` entries; risks synchronization bugs between the two lists.

## Decision

Extend the `policy` field in each `SkillEntry` to accept `'eager'` as a new valid value:

```
SkillEntry { name: string, policy: 'verify' | 'eager' }
```

- `policy: 'verify'` (default): `subagent-start-service` emits a text directive only.
- `policy: 'eager'`: `subagent-start-service` additionally reads the SKILL.md file content via the injected `skillFileReader` port and inlines it in `additionalContext`.
- The `isEagerSkill(skill: SkillEntry): boolean` pure function in `domain/skill-policy.mjs` encapsulates the check (`skill.policy === 'eager'`).
- No new config key is introduced. The `{name, policy}` shape remains the single per-skill entry format.
- Existing consumers that do not read `policy` are unaffected.

## Consequences

**Positive:**
- No config schema change: the `{name, policy}` shape is unchanged; only the valid value set expands.
- Per-skill granularity: different skills for the same agent can have different policies (`bdd-methodology: eager`, `sprint-planning: verify`).
- The Published Language extension is minimal and self-contained in the `SkillEntry` type.

**Negative / trade-offs:**
- Semantic overloading of `policy`: the field now controls two concerns — directive emission mode and file inlining behaviour. If a third policy type is introduced, `policy` becomes a multi-concern field.
- The `skillFileReader` port becomes a required dependency of `subagent-start-service`, even for agents with no eager skills (injected but may never be called).

**Neutral:**
- Config Context (#48) does not need a code change: the `policy` field is already in the generated config. The new value `'eager'` is adopted on the consuming side only.

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| `eagerMode: true/false` per agent (top-level) | Coarser granularity: cannot eager one skill and verify another for the same agent. Adds a new config key, increasing the Published Language surface. |
| `eagerSkills: string[]` per agent (separate list) | Introduces a second list parallel to `agentSkills` entries. Risks synchronization bugs. Diverges from the established `{name, policy}` entry shape. |
| Do without eager mode | AC-03 is a Must-Have requirement. Not adopting it contradicts the story scope. |
