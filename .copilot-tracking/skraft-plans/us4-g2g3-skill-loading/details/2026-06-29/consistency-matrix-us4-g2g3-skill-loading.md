<!-- markdownlint-disable-file -->
# Consistency Matrix — US4 / G2+G3 Skill-Loading Guardrail (#50)

Phase: DESIGN · Date: 2026-06-29 · Project slug: us4-g2g3-skill-loading
Source of truth: ADR set under `docs/adr/adr-*.md`

---

## Shared artifact registry

| Artefact | Source | Consumers | Owner |
|---|---|---|---|
| ADR-006 | `docs/adr/adr-006-skill-guardrail-fail-open.md` | DISTILL, DELIVER | solution-architect |
| ADR-007 | `docs/adr/adr-007-eager-mode-policy-field.md` | DISTILL, DELIVER | solution-architect |
| event-model | `details/2026-06-29/event-model-us4-g2g3-skill-loading.md` | DISTILL | solution-architect |
| contracts | `details/2026-06-29/contracts-us4-g2g3-skill-loading.md` | DISTILL, DELIVER | solution-architect |

---

## Canonical label table

| Concept | Canonical label | Notes |
|---|---|---|
| `InjectSkillDirective` | Command | SubagentStart trigger |
| `VerifySkillCompliance` | Command | SubagentStop trigger |
| `AuditSkillRead` | Command | PostToolUse(Read) trigger |
| `skill-policy` | Domain Service | `skill-policy.mjs` in filenames |
| `jsonl-transcript-reader` | Repository | `jsonl-transcript-reader.mjs` in filenames |
| `SkillDirectiveInjected` | Domain Event | — |
| `SkillComplianceVerified` | Domain Event | — |
| `SkillComplianceFailed` | Domain Event | — |
| `SkillTranscriptUnavailable` | Domain Event | — |
| `SkillRead` | Domain Event | — |
| `AgentSkillContext` | Read Model | additionalContext output |
| `SkillComplianceResult` | Read Model | allow/block output |
| `SkillAuditEntry` | Read Model | G3 JSONL row |

---

## Consistency matrix

| Concept | ADR (source of truth) | event-model | contracts | Verdict |
|---|---|---|---|---|
| `InjectSkillDirective` | Command (Slice A, Phase 4) | Command | Command (Contract 3 entry) | PASS |
| `VerifySkillCompliance` | Command (Slice B, Phase 4) | Command | Command (Contract 4 entry) | PASS |
| `AuditSkillRead` | Command (Slice C, Phase 4) | Command | Command (Contract 5 entry) | PASS |
| `skill-policy` | Domain Service (ADR-002 hexagonal baseline) | Domain Service | Domain Service (Contract 1) | PASS |
| `jsonl-transcript-reader` | Repository (ADR-002 hexagonal baseline) | Repository | Repository (Contract 6) | PASS |
| `SkillDirectiveInjected` | Domain Event (Slice A) | Domain Event | Referenced in Contract 3 flow | PASS |
| `SkillComplianceVerified` | Domain Event (Slice B allow path) | Domain Event | `SkillComplianceAuditEntry` (reason: all_present) | PASS |
| `SkillComplianceFailed` | Domain Event (Slice B block path) | Domain Event | Contract 4 block return | PASS |
| `SkillTranscriptUnavailable` | Domain Event (ADR-006 fail-open WARN path) | Domain Event | Contract 4 WARN audit shape | PASS |
| `SkillRead` | Domain Event (Slice C; ADR-006 governs write failure) | Domain Event | SkillAuditEntry shape (Contract 5) | PASS |
| `AgentSkillContext` | Read Model (Slice A output) | Read Model | Contract 3 return: additionalContext | PASS |
| `SkillComplianceResult` | Read Model (Slice B output) | Read Model | Contract 4 return: allow/block | PASS |
| `SkillAuditEntry` | Read Model (Slice C output; shared type) | Read Model | Shared types + Contract 5 | PASS |

---

## Back-propagation journal

No back-propagation rounds required. All artefacts written with consistent canonical labels.

| Round | Concept | Artefact | Before → After | Trigger |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Consistency-gate verdict

- **consistency-gate: PASS**
- Back-propagation rounds used: 0 (max 1 per artefact)
- Blockers raised: none
- Open blockers: 0
