<!-- markdownlint-disable-file -->
# Consistency Matrix Template (Phase 9)

Used by the `solution-architect` persona at Phase 9 (RECONCILE & VERIFY).

The matrix is the supervised-execution artefact for the cross-artefact consistency gate: ADR rows define the ratified vocabulary; every other column must align. Divergences are classified by cause to decide between back-propagation and HALT.

---

## Caller-supplied slots

| Slot | Source | Notes |
|---|---|---|
| `{project-slug}` | `state.json::projectSlug` | kebab-case project identifier |
| `{date}` | persona invocation date | `YYYY-MM-DD` |
| `{story-id}` | story metadata | e.g. `story-41` |
| `{concept-name}` | persona Phase 9 PLAN step | one row per structural concept named in any ADR |
| `{adr-truth}` | ADR-{NNN} | the ratified classification (source of truth) |
| `{cell-value}` | grep result (Phase 9 EXEC step) | classification as found in that artefact |

---

## Matrix body

```markdown
<!-- markdownlint-disable-file -->
# Consistency Matrix — {story-id}

**Story:** {story-id}
**Date:** {YYYY-MM-DD}
**Source of truth:** ADR set under `.copilot-tracking/skraft-plans/{project-slug}/adrs/ADR-*.md`

## Matrix

| Concept | ADR (source of truth) | event-model-{story-id}.md | diagrams-{story-id}.md | contracts-{story-id}.md | Cause | Verdict |
|---|---|---|---|---|---|---|
| `{concept-name}` | `{adr-truth}` (ADR-{NNN}) | `{cell-value}` | `{cell-value}` | `{cell-value}` | n/a \| LABEL_DRIFT \| CLASSIFICATION_DRIFT \| STRUCTURAL_DRIFT | PASS \| FAIL |

## Back-propagation journal

| Round | Concept | Artefact rewritten | Before → After | Trigger |
|---|---|---|---|---|
| 1 | `{concept-name}` | `{artefact-path}` | `{old}` → `{new}` | LABEL_DRIFT \| CLASSIFICATION_DRIFT |

## Final verdict

- consistency-gate: PASS \| FAIL
- back-propagation rounds used: {n} (max 1 per artefact)
- blockers raised: {list of decision_drift JSON refs, if any}
```

---

## Cause classification (per divergent row)

| Cause | Definition | Action | Retry budget |
|---|---|---|---|
| `LABEL_DRIFT` | Same concept, different vocabulary (e.g. `VO` vs `Value Object` vs `ValueObject`). | Back-propagate: rewrite the upstream artefact to use the ADR's spelling. | 1 per artefact |
| `CLASSIFICATION_DRIFT` | Same concept, incompatible category (`Command` vs `Query`, `Entity` vs `Value Object`, `Aggregate` vs `Domain Service`). | Back-propagate: rewrite the upstream artefact to align on the ADR. | 1 per artefact, then HALT `decision_drift` |
| `STRUCTURAL_DRIFT` | The concept exists in one artefact and not the other (e.g. ADR mentions an aggregate the diagram never drew, or contracts define a `Repository` that no ADR ratified). | **HALT immediately. No back-propagation.** This signals a real decision gap that the architect must resolve by revisiting the ADR set or the upstream artefact, not by silent rewrite. | 0 |

---

## Normalisation table (for cause detection)

Treat as equivalent (case- and whitespace-insensitive). Differences that map across an equivalence row are NOT drift.

- `Value Object` ≡ `ValueObject` ≡ `VO`
- `Domain Service` ≡ `DomainService`
- `Aggregate Root` ≡ `AggregateRoot` ≡ `Aggregate`
- `Domain Event` ≡ `DomainEvent`
- `Read Model` ≡ `ReadModel`

Never normalise across these boundaries (always drift):

- `Command` ↔ `Query`
- `Entity` ↔ `Value Object`
- `Aggregate (Root)` ↔ `Domain Service`

---

## BLOCKER JSON shape (for `decision_drift`)

Emit to the orchestrator when `STRUCTURAL_DRIFT` fires, or when `CLASSIFICATION_DRIFT` survives the back-propagation retry. The orchestrator is responsible for surfacing it to a human via the available channel (GitHub issue, IDE prompt, Slack…). The persona's job is to emit a complete, actionable payload AND persist the matching blocker file (see persona Step 9.7).

The append-only constraint of HVE-Core directories (`adrs/`, `details/`, `reviews/`) means the persona MUST NOT edit a previously written blocker file to record the human's answer. Instead, the human (or orchestrator on the human's behalf) writes a sibling resolution file. The persona detects "resolved" by file presence, not by frontmatter mutation.

```json
{
  "status": "blocked",
  "type": "decision_drift",
  "story": "{story-id}",
  "concept": "{concept-name}",
  "adr_says": "{adr-truth}",
  "adr_path": ".copilot-tracking/skraft-plans/{project-slug}/adrs/ADR-{NNN}-{slug}.md",
  "artefact_says": "{cell-value}",
  "artefact_path": ".copilot-tracking/skraft-plans/{project-slug}/details/{date}/{artefact}-{story-id}.md",
  "cause": "STRUCTURAL_DRIFT | CLASSIFICATION_DRIFT (post-retry)",
  "human_action_required": "Restate the divergence as a yes/no or pick-one question. Example: 'Is `RejectionReason` a Value Object (current diagram) or a Domain Event (no ADR ratifies either)?'",
  "decision_options": [
    {"id": "A", "label": "Value Object", "consequence": "diagrams stay; write a new ADR ratifying VO."},
    {"id": "B", "label": "Domain Event", "consequence": "diagrams rewritten; write a new ADR ratifying Domain Event."},
    {"id": "C", "label": "Both — split the concept", "consequence": "new concept name needed; revisit Phase 6."}
  ],
  "resume_protocol": {
    "blocker_file": ".copilot-tracking/skraft-plans/{project-slug}/blockers/{date}/decision-drift-{story-id}-{NNN}.md",
    "human_writes_to": ".copilot-tracking/skraft-plans/{project-slug}/blockers/{date}/decision-drift-{story-id}-{NNN}-resolution.md (NEW sibling file — append-only)",
    "resolved_when": "sibling `-resolution.md` file exists with the chosen option in `## Resolution`",
    "next_step": "Persona re-invocation reads the resolution at Phase 1 step 4 and treats it as authoritative for the row."
  },
  "next_action": "Surface via the orchestrator's human-channel adapter. Do not auto-rewrite."
}
```

## Blocker file shape (`.copilot-tracking/skraft-plans/{project-slug}/blockers/{date}/decision-drift-{story-id}-{NNN}.md`)

Append-only: written once by the persona, never edited.

```markdown
<!-- markdownlint-disable-file -->
---
status: awaiting_human
story: {story-id}
concept: {concept-name}
cause: STRUCTURAL_DRIFT | CLASSIFICATION_DRIFT (post-retry)
created: {YYYY-MM-DD}
---

## BLOCKER payload

```json
{ ...the BLOCKER JSON above... }
```

## Question for the human

{One-paragraph plain-language restatement of `human_action_required`.}

## Decision options

- **A — {label}**: {consequence}
- **B — {label}**: {consequence}
- **C — {label}**: {consequence}

## How to resolve

Create a sibling file `decision-drift-{story-id}-{NNN}-resolution.md` (next to this one) with the body shown in the resolution template below. Do NOT edit this blocker file.
```

## Resolution file shape (`...-resolution.md`)

Append-only: written once by the human (or orchestrator on the human's behalf).

```markdown
<!-- markdownlint-disable-file -->
---
resolves: decision-drift-{story-id}-{NNN}.md
resolved: {YYYY-MM-DD}
---

## Resolution

chosen: A | B | C

{Free-form rationale: why this choice, any constraints or follow-up actions for the next persona invocation.}
```
