<!-- markdownlint-disable-file -->
# Interface Contracts — US4 / G2+G3 Skill-Loading Guardrail (#50)

Phase: DESIGN · Date: 2026-06-29 · Project slug: us4-g2g3-skill-loading
Conventions: hexagonal layering (ADR-002), hook decision vocabulary (`decision.mjs`),
fail-open posture (ADR-006), eager mode via `policy` field (ADR-007).
DESIGN artefact — signatures and shapes only, no implementation.

---

## Shared types and shapes

### SkillEntry (Published Language element — from #48 config, ADR-005)
```
SkillEntry {
  name   : string              // unique skill identifier (e.g. "issue-refinement")
  policy : 'verify' | 'eager'  // ADR-007: 'eager' inlines SKILL.md content; 'verify' is default
}
```

### GeneratedConfig (Published Language — read-only, from #48)
```
GeneratedConfig {
  agentSkills : { [agentName: string]: SkillEntry[] }
}
```

### HarnessDecision (hook decision vocabulary — `decision.mjs`, reused)
```
HarnessDecision =
    { decision: 'allow' }
  | { decision: 'allow', message: string }
  | { decision: 'additionalContext', context: string }
  | { decision: 'block', message: string }
```

### SkillAuditEntry (G3 audit record shape)
```
SkillAuditEntry {
  eventType  : 'SkillRead'
  agentName  : string
  skillName  : string         // capture group 1 from transcript regex
  path       : string         // full file path that matched /\/SKILL\.md$/
  timestamp  : string         // ISO-8601 UTC
}
```

### SkillComplianceAuditEntry (G2 audit record shape)
```
SkillComplianceAuditEntry {
  eventType    : 'SkillComplianceChecked'
  agentName    : string
  decision     : 'ALLOW' | 'BLOCK'
  missingSkills: string[]
  reason       : 'all_present' | 'skill_absent' | 'transcript_unavailable'
  timestamp    : string
}
```

### EagerReadFailed audit entry shape (WARN — emitted by subagent-start-service on eager read failure)
```
EagerReadFailedAuditEntry {
  eventType  : 'EagerReadFailed'
  agentName  : string
  skillName  : string
  reason     : string    // error.message from the failed filesystem read
  decision   : 'WARN'
  timestamp  : string    // ISO-8601 UTC
}
```

---

## Contract 1 — `domain/skill-policy.mjs` (Domain Service)

**Layer:** Domain — pure, no IO, zero imports from Application or Infrastructure (ADR-002).

```
// Returns the mandatory SkillEntry list for agentName.
// Returns [] when agentName not in config.agentSkills (unknown agent → no requirements).
mandatorySkillsFor(agentName: string, config: GeneratedConfig): SkillEntry[]

// Returns skill names absent from readPaths.
// A readPath covers a required skill when the path matches:
//   /(?:plugins\/skills|\.agents\/skills|\.github\/skills|\.copilot\/skills)\/([^/]+)\/SKILL\.md$/i
// and capture group 1 equals skill.name (case-insensitive). Pure set subtraction — no IO.
missingSkills(readPaths: string[], required: SkillEntry[]): string[]

// Returns true when skill.policy === 'eager' (ADR-007).
isEagerSkill(skill: SkillEntry): boolean
```

---

## Contract 2 — `ports/api/subagent-start.mjs` (port stub)

**Layer:** Ports/API (inbound port constant — mirrors the pattern of `subagent-stop.mjs`).

```
export const SUBAGENT_START_INTERFACE = 'SubagentStartInterface'
```

---

## Contract 3 — `application/subagent-start-service.mjs` (Application Service)

**Layer:** Application — orchestrates domain + driven ports.

```
createSubagentStartService({
  config          : GeneratedConfig,
  skillFileReader : { read(skillName: string): Promise<string> },
  auditWriter     : { write(entry: object): Promise<void> },
  clock           : { now(): string }
}) → { handle({ agentName: string }): Promise<HarnessDecision> }
```

**Return shape:** always `additionalContext(text: string)` — never `block()` at SubagentStart.

**Flow (AC-01, AC-03, ADR-006, ADR-007):**
1. `mandatorySkillsFor(agentName, config)` → `skills: SkillEntry[]`
2. Build verify directive: `"The following skills are MANDATORY: {name-A}, {name-B}."`
3. For each `skill` where `isEagerSkill(skill)`: read via `skillFileReader.read(skill.name)`.
   On error: `auditWriter.write({ eventType: 'EagerReadFailed', agentName, skillName, reason, decision: 'WARN', timestamp })` + skip inline (ADR-006 fail-open)
4. Assemble `additionalContext` text; return `additionalContext(text)`.

---

## Contract 4 — `application/subagent-stop-service.mjs` (Application Service)

**Layer:** Application — orchestrates domain + driven ports.

```
createSubagentStopService({
  config                 : GeneratedConfig,
  transcriptReaderFactory: ({ transcript: object[] | undefined }) => { read(): Promise<string> },
  auditWriter            : { write(entry: object): Promise<void> },
  clock                  : { now(): string }
}) → { handle({ agentName: string, transcript: object[] | undefined }): Promise<HarnessDecision> }
```

**Return shape:** `allow()` or `block("Mandatory skill not loaded: {skillName}")`.

**Flow (AC-02, ADR-006):**
1. `const reader = transcriptReaderFactory({ transcript })`
2. Try `reader.read()`. On `TRANSCRIPT_UNAVAILABLE`: emit WARN audit + return `allow()` (ADR-006).
3. Extract file paths from transcript JSON.
4. `missingSkills(foundPaths, required)` → `missing: string[]`
5. `auditWriter.write(SkillComplianceAuditEntry)`
6. If `missing.length > 0`: return `block("Mandatory skill not loaded: " + missing[0])`. **Note: only the FIRST missing skill is reported in the block message** (`missing[0]`). DISTILL must write Gherkin asserting one missing skill name, not a list. If `missing.length === 0`: return `allow()`.

---

## Contract 5 — `application/post-tool-use-service.mjs` (Application Service)

**Layer:** Application — orchestrates driven port only.

```
createPostToolUseService({
  auditWriter: { write(entry: object): Promise<void> },
  clock      : { now(): string }
}) → { handle({ agentName: string, toolInput: { path: string } }): Promise<HarnessDecision> }
```

**Return shape:** always `allow()` (ADR-006 fail-open on all paths).

**Flow (AC-04, DD-2, ADR-006):**
1. Check `toolInput?.path` matches `/\/SKILL\.md$/`. No match → return `allow()` immediately.
2. Extract `skillName` from path regex capture group 1.
3. Try `auditWriter.write(SkillAuditEntry)`. On any error: swallow + return `allow()`.
4. Return `allow()`.

---

## Contract 6 — `adapters/infrastructure/jsonl-transcript-reader.mjs` (Repository)

**Layer:** Infrastructure — implements the `transcript-reader` driven port.

```
createJsonlTranscriptReader({
  transcript: object[] | undefined | null
}) → { read(): Promise<string> }

// read():
//   Returns JSON.stringify(transcript) when transcript is a non-empty array.
//   Throws new Error('TRANSCRIPT_UNAVAILABLE') when transcript is absent, null, or [].
//
// Per-invocation factory (DD-1): closes over the transcript at construction time.
// read() takes no arguments. Must NOT write back to the payload (security NFR).
```

---

## Traceability

| AC | Contract(s) | Domain examples |
|---|---|---|
| AC-01 — SubagentStart directive | Contract 3 | 1 |
| AC-02 — SubagentStop block on missing skill | Contract 4 | 2, 3 |
| AC-03 — Eager mode inlines SKILL.md | Contract 3 (eager branch) + Contract 1 (`isEagerSkill`) + ADR-007 | 4 |
| AC-04 — PostToolUse Read audit (fail-open) | Contract 5 + Contract 6 | 5, 6, 8 |
| DD-1 — Transcript as payload field | Contract 4 + Contract 6 | 7 |
| DD-2 — Two-level filter | Contract 5 (path filter) | 8 |
| DD-3 — Eager via `policy` field | Contract 1 (`isEagerSkill`) + Contract 3 + ADR-007 | 4 |
