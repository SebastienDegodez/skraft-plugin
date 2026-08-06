<!-- markdownlint-disable-file -->
# Implementation Plan — US4 / G2+G3 Skill-Loading Guardrail (#50)

Phase: DISTILL · Date: 2026-06-30 · Project slug: us4-g2g3-skill-loading
Depth tier: comprehensive · Difficulty: medium
Source artefacts: stories-2026-06-29.md, event-model-us4-g2g3-skill-loading.md,
contracts-us4-g2g3-skill-loading.md, ADR-006, ADR-007

---

## Reconciliation note: existing implementation vs contract

The service files exist (`subagent-start-service.mjs`, `subagent-stop-service.mjs`,
`post-tool-use-service.mjs`, `skill-policy.mjs`) but their interfaces diverge from the
contracts produced in DESIGN. DELIVER must reconcile them. The RED acceptance tests
capture all divergences as business-assertion failures.

Key divergences (each is a RED case in the acceptance suite):

| AC | Divergence | RED trigger |
|---|---|---|
| AC-01 | Directive text: current `"MANDATORY SKILLS: ..."`, contract `"The following skills are MANDATORY: ..."` | Wrong text format |
| AC-02 | Block message: current `"mandatory skills not loaded: {list}"`, contract `"Mandatory skill not loaded: {first}"` | Lowercase + list vs singular |
| AC-02 | Transcript unavailable: current blocks (scans empty string → all missing), contract allows (fail-open) | Decision mismatch |
| AC-03 | Eager mode: current driven by `mode` arg in `handle()`, contract driven by `policy: 'eager'` in config | Wrong eager activation |
| AC-04 | Handle interface: current `{ toolName, toolInput.filePath }`, contract `{ agentName, toolInput.path }` | Wrong input shape → undefined return |
| AC-04 | Audit entry: current `{ event, skill, filePath, readAt }`, contract `{ eventType, agentName, skillName, path, timestamp }` | Wrong field names |
| AC-04 | Return value: current `undefined`, contract `allow()` | Wrong return shape |

---

## Coverage Matrix (test-design-mandates, Mandates 1–4)

| Scenario | Use Case Boundary | Layer | Double Type | Walking Skeleton | Priority |
|---|---|---|---|---|---|
| AC-01: backlog-planner receives mandatory skill directive | `subagentStartService.handle` | Application | In-memory `skillFileReader`, collecting `auditWriter` | A | P1 |
| AC-01: no-skill agent receives allow | `subagentStartService.handle` | Application | In-memory doubles | A | P1 |
| AC-03: acceptance-designer receives eager SKILL.md inline | `subagentStartService.handle` | Application | In-memory `skillFileReader` returning content | A | P2 |
| AC-03: eager fail-open when SKILL.md unreadable | `subagentStartService.handle` | Application | Throwing `skillFileReader`, collecting `auditWriter` | A | P2 |
| AC-02: solution-architect allowed when all skills read | `subagentStopService.handle` | Application | In-memory `transcriptReaderFactory`, collecting `auditWriter` | A | P1 |
| AC-02: backlog-planner blocked — issue-refinement missing | `subagentStopService.handle` | Application | In-memory `transcriptReaderFactory`, collecting `auditWriter` | A | P1 |
| AC-02: transcript unavailable → allow + WARN (fail-open) | `subagentStopService.handle` | Application | Throwing `transcriptReaderFactory`, collecting `auditWriter` | A | P1 |
| AC-02: no-skill agent always allowed | `subagentStopService.handle` | Application | In-memory doubles | A | P2 |
| AC-04: solution-architect reads architecture-decisions/SKILL.md → SkillRead entry | `postToolUseService.handle` | Application | Collecting `auditWriter` | A | P1 |
| AC-04: audit write failure → allow (fail-open) | `postToolUseService.handle` | Application | Throwing `auditWriter` | A | P1 |
| AC-04: non-skill read → no audit, allow | `postToolUseService.handle` | Application | Collecting `auditWriter` | A | P1 |

**Domain tests (Mandate 4 gate):**
- `skill-policy.mjs` (`mandatorySkillsFor`, `missingSkills`, `isEagerSkill`): all branches are reached
  by the acceptance scenarios above. **No new domain unit tests required** (Mandate 4 default).
  The existing `skill-policy.unit.test.mjs` covers regression for the domain functions;
  do NOT add duplicate coverage.
- `jsonl-transcript-reader.mjs`: the three branches (non-empty array, empty array, absent/null)
  are each covered by a distinct acceptance scenario. **No adapter unit test required.**

---

## Walking Skeleton Steps (outside-in order)

### Step 1 — Domain extension: `plugins/skraft-framework/src/domain/skill-policy.mjs`

**TDD cycle (Red → Green → Refactor):**
- **RED**: The AC-03 acceptance test calls `subagentStartService.handle({ agentName: 'acceptance-designer' })`
  with a config where `bdd-methodology` has `policy: 'eager'`. The service must call `isEagerSkill(skill)`
  to decide. The first compilation failure reveals the missing export.
- **GREEN**: Add `export const isEagerSkill = (skill) => skill?.policy === 'eager'`.
- **Refactor**: None — the function is already a one-liner with a clear contract.

**Files touched:**
- `plugins/skraft-framework/src/domain/skill-policy.mjs` — add `isEagerSkill` export

**Acceptance scenario activated:** AC-03 compilation unblocked.

---

### Step 2 — Application: `plugins/skraft-framework/src/application/subagent-start-service.mjs`

**Contract interface (from Contract 3):**
```
createSubagentStartService({ config, skillFileReader, auditWriter, clock })
  .handle({ agentName }): Promise<HarnessDecision>
```

**TDD cycle:**
- **RED**: AC-01 acceptance test fails — directive text mismatch ("MANDATORY SKILLS:" vs "The following skills are MANDATORY:").
  AC-03 acceptance test fails — eager mode not triggered by `policy: 'eager'` in config (checked via `isEagerSkill`).
- **GREEN** (synthesize in one shot, `red-synthesize-green` skill):
  1. Replace `filesystem` dependency with `skillFileReader: { read(skillName): Promise<string> }`, `auditWriter`, `clock`.
  2. Change directive text to `"The following skills are MANDATORY: {name-A}, {name-B}."`.
  3. Drive eager mode from `isEagerSkill(skill)` per `SkillEntry` in config (not from `mode` handle arg).
  4. For each eager skill: `skillFileReader.read(skill.name)`.
     On error: `auditWriter.write({ eventType: 'EagerReadFailed', agentName, skillName, reason, decision: 'WARN', timestamp: clock.now() })` + skip inline.
  5. Assemble and return `additionalContext(text)`. Never return `block()`.
- **Refactor**: Extract `buildDirective(skills)` helper if needed for clarity.

**Files touched:**
- `plugins/skraft-framework/src/application/subagent-start-service.mjs` — full rewrite to contract interface
- `plugins/skraft-framework/src/ports/api/subagent-start.mjs` — create port stub constant (`SUBAGENT_START_INTERFACE`)

**Acceptance scenarios activated:** AC-01, AC-03 (both happy-path and fail-open).

**Note:** The existing unit tests in `tests/skraft-framework/subagent-start-service.unit.test.mjs`
test the OLD interface. They will go RED when the interface changes. The engineer must update them
to reflect the new contract interface (Iron Rule: fix the implementation, not the acceptance tests).

---

### Step 3 — Application: `plugins/skraft-framework/src/application/subagent-stop-service.mjs`

**Contract interface (from Contract 4):**
```
createSubagentStopService({ config, transcriptReaderFactory, auditWriter, clock })
  .handle({ agentName, transcript }): Promise<HarnessDecision>
```

**TDD cycle:**
- **RED**: AC-02 block test — message mismatch (`"mandatory skills not loaded: ..."` vs `"Mandatory skill not loaded: issue-refinement"`).
  AC-02 transcript-unavailable test — current blocks, contract allows (fail-open).
- **GREEN** (synthesize):
  1. Accept `transcriptReaderFactory` (per-invocation factory from Contract 4 + DD-1).
  2. `const reader = transcriptReaderFactory({ transcript })`.
  3. Try `reader.read()`. Catch `TRANSCRIPT_UNAVAILABLE`:
     emit `{ eventType: 'SkillComplianceChecked', agentName, decision: 'ALLOW', missingSkills: [], reason: 'transcript_unavailable', timestamp: clock.now() }` and return `allow()`.
  4. Extract paths from transcript JSON string; call `missingSkills(foundPaths, required)`.
  5. Audit: `{ eventType: 'SkillComplianceChecked', agentName, decision, missingSkills: missing, reason, timestamp }`.
  6. Block message: `"Mandatory skill not loaded: " + missing[0]` (Contract 4: first only).
- **Refactor**: `extractPathsFromTranscript(jsonString): string[]` — pure function; extract if >3 lines.

**Files touched:**
- `plugins/skraft-framework/src/application/subagent-stop-service.mjs` — refactor to contract interface
- `plugins/skraft-framework/src/adapters/infrastructure/jsonl-transcript-reader.mjs` — create new adapter (Contract 6)

**jsonl-transcript-reader contract:**
```
createJsonlTranscriptReader({ transcript })
  .read(): Promise<string>
// Returns JSON.stringify(transcript) when non-empty array.
// Throws new Error('TRANSCRIPT_UNAVAILABLE') when absent, null, or [].
```

**Acceptance scenarios activated:** AC-02 (block, allow, transcript-unavailable, no-skill).

---

### Step 4 — Application: `plugins/skraft-framework/src/application/post-tool-use-service.mjs`

**Contract interface (from Contract 5):**
```
createPostToolUseService({ auditWriter, clock })
  .handle({ agentName, toolInput: { path } }): Promise<HarnessDecision>
```

**TDD cycle:**
- **RED**: AC-04 tests — service returns `undefined` instead of `allow()`; audit entry fields wrong;
  `agentName` absent from entry; `path` key not recognised (service uses `filePath`/`file_path`).
- **GREEN** (synthesize):
  1. Update handle to destructure `{ agentName, toolInput }`.
  2. Use `toolInput?.path` for the file path (DD-2: service-level filter).
  3. Path regex: `/(?:plugins\/skills|\.agents\/skills|\.github\/skills|\.copilot\/skills)\/([^/]+)\/SKILL\.md$/i`.
     No match → return `allow()`.
  4. Try `auditWriter.write({ eventType: 'SkillRead', agentName, skillName: capture[1], path, timestamp: clock.now() })`.
     Catch any error: swallow, return `allow()` (ADR-006).
  5. Return `allow()` on every path (never `undefined`).
- **Refactor**: Extract `extractSkillName(path): string | null` if logic is non-trivial.

**Files touched:**
- `plugins/skraft-framework/src/application/post-tool-use-service.mjs` — update interface and return shape

**Acceptance scenarios activated:** AC-04 (happy-path, fail-open, non-skill).

---

### Step 5 — Hook wiring: `plugins/skraft-framework/src/cli/hook.mjs`

**Current state:** `createHookService()` called with no arguments → SubagentStart, SubagentStop,
PostToolUse return `undefined`.

**GREEN target:**
```js
import { createSubagentStartService } from '../application/subagent-start-service.mjs'
import { createSubagentStopService }  from '../application/subagent-stop-service.mjs'
import { createPostToolUseService }   from '../application/post-tool-use-service.mjs'
import { createJsonlTranscriptReader } from '../adapters/infrastructure/jsonl-transcript-reader.mjs'
import { createJsonlAuditWriter }     from '../adapters/infrastructure/jsonl-audit-writer.mjs'
import { generatedConfig }            from '../skraft-framework.config.json' assert { type: 'json' }

const auditWriter     = createJsonlAuditWriter()
const clock           = { now: () => new Date().toISOString() }
const skillFileReader = { read: (name) => fs.readFile(`plugins/skraft-framework/skills/${name}/SKILL.md`, 'utf8') }

const subagentStart = createSubagentStartService({ config: generatedConfig, skillFileReader, auditWriter, clock })
const subagentStop  = createSubagentStopService({ config: generatedConfig, transcriptReaderFactory: createJsonlTranscriptReader, auditWriter, clock })
const postToolUse   = createPostToolUseService({ auditWriter, clock })

const hookService = createHookService({ subagentStart, subagentStop, postToolUse, /* preToolUse stays as before */ })
```

**TDD cycle:** The acceptance tests exercise services directly with in-memory doubles. The wiring
integration is verified with a post-GREEN walk: run `node plugins/skraft-framework/src/cli/hook.mjs` with a
representative `SubagentStart` payload and confirm `{ decision: 'additionalContext', context: '...' }`
is written to stdout.

**Files touched:**
- `plugins/skraft-framework/src/cli/hook.mjs` — wire all three new service instances

---

### Step 6 — Manifest: `plugins/skraft-framework/hooks/hooks.json`

Add a second `PostToolUse` entry with `matcher: "Read"` (DD-2):

```json
{
  "type": "command",
  "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/cli/hook.mjs\" PostToolUse Read",
  "matcher": "Read"
}
```

This entry fires the hook for ALL `Read` tool events; the service-level path filter handles
the `SKILL.md` check (no change to the existing `PostToolUse Agent` entry).

**Files touched:**
- `plugins/skraft-framework/hooks/hooks.json` — append PostToolUse Read entry

---

## Per-AC TDD Cycle Summary

### AC-01 — SubagentStart directive (verify mode)

1. **Outer RED**: acceptance test asserts `context.includes('The following skills are MANDATORY: issue-refinement, sprint-planning')` — fails on text format.
2. **Inner loop**: Step 2 (subagent-start-service refactor). Engineer writes directive builder,
   runs acceptance test → GREEN.
3. **Commit**: `feat(skill-loading): inject mandatory-skill directive at SubagentStart (AC-01)`.

### AC-02 — SubagentStop block (missing skill)

1. **Outer RED (block)**: acceptance test asserts `result.message === 'Mandatory skill not loaded: issue-refinement'` — fails (wrong case, list vs singular).
2. **Outer RED (transcript unavailable)**: acceptance test asserts `result.decision === 'allow'` — fails (blocks instead).
3. **Inner loop**: Step 3 (subagent-stop-service + jsonl-transcript-reader). Block message fix + fail-open path.
4. **Commit**: `feat(skill-loading): block agent when mandatory skill absent; fail-open on missing transcript (AC-02)`.

### AC-03 — Eager mode (SubagentStart)

1. **Outer RED**: acceptance test asserts `context.includes(SKILL_CONTENT)` — fails (no inline content).
2. **Outer RED (eager fail-open)**: asserts `auditEntries[0].eventType === 'EagerReadFailed'` — fails.
3. **Inner loop**: Step 1 (isEagerSkill) + Step 2 completion (eager branch).
4. **Commit**: `feat(skill-loading): inline eager SKILL.md content at SubagentStart (AC-03)`.

### AC-04 — PostToolUse SKILL.md audit (G3)

1. **Outer RED (happy-path)**: returns `undefined`, audit empty → fails on `audit.entries.length === 1`.
2. **Outer RED (fail-open)**: returns `undefined` → fails on `result.decision === 'allow'`.
3. **Outer RED (non-skill)**: returns `undefined` → fails on `result.decision === 'allow'`.
4. **Inner loop**: Step 4 (post-tool-use-service interface + return shape fix).
5. **Commit**: `feat(skill-loading): audit every SKILL.md read as SkillRead entry; fail-open (AC-04)`.

---

## Mutation Testing Targets (comprehensive depth tier, ADR-002)

All modules in Domain and Application layers receive Stryker mutation testing.
Target: **100% mutation score** on business logic; only equivalent mutants accepted as survivors.

| Module | Mutant targets | Threshold |
|---|---|---|
| `domain/skill-policy.mjs` | `mandatorySkillsFor` (null-guard, map), `missingSkills` (set subtraction, filter), `isEagerSkill` (equality check) | 100% |
| `application/subagent-start-service.mjs` | Eager branch (isEagerSkill gate), fail-open catch, directive assembly | 100% |
| `application/subagent-stop-service.mjs` | Block vs allow branch (missing.length > 0), first-only indexing ([0]), fail-open catch, TRANSCRIPT_UNAVAILABLE catch | 100% |
| `application/post-tool-use-service.mjs` | Path-match gate, allow() vs undefined return, fail-open catch | 100% |
| `adapters/infrastructure/jsonl-transcript-reader.mjs` | Empty-array gate, null/undefined guard | 100% |

**Run command** (resolved from `plugins/skraft-framework/src/package.json` `test:mutation` script):
```
cd plugins/skraft-framework/src && node node_modules/.bin/stryker run stryker.config.mjs
```

Survivors requiring justification: regex capture-group index (equivalent — changing [0] to [1] on
a known-single-group regex produces equivalent behavior). Document in a `// mutant-survivor:` comment.

---

## Unit test update obligations (DELIVER)

These existing tests test the OLD interface and will go RED when the services are refactored.
The engineer MUST update them to align with the new contract (Iron Rule: fix the implementation,
not the acceptance tests):

| File | Reason for update |
|---|---|
| `tests/skraft-framework/subagent-start-service.unit.test.mjs` | `filesystem` → `skillFileReader`; `mode` arg → config `policy`; directive text format |
| `tests/skraft-framework/subagent-stop-service.unit.test.mjs` | Block message format (first only); audit entry fields (`eventType`, `missingSkills`, `reason`, `timestamp`) |
| `tests/skraft-framework/post-tool-use-service.unit.test.mjs` | Handle interface (`{ agentName, toolInput.path }`); return shape (`allow()` not `undefined`); audit fields |

The acceptance tests in `plugins/tests/acceptance/skill-loading/SkillLoadingAcceptanceTests.test.mjs`
are the OUTER loop — they encode the AC values verbatim and MUST NOT be modified to make them pass.
