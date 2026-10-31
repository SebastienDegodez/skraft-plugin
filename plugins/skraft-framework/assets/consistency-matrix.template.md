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
| `{bounded-context}` | context map | kebab-case bounded context name |
| `{story-id}` | story metadata | e.g. `story-41` |
| `{concept-name}` | persona Phase 9 PLAN step | one row per structural concept named in any ADR |
| `{adr-truth}` | ADR-{NNN} | the ratified classification (source of truth) |
| `{cell-value}` | grep result (Phase 9 EXEC step) | classification as found in that artefact |

---

## Shared Artifact Registry

Before building the matrix body, declare the ownership graph of every artefact under design so the matrix has typed coordinates and downstream phases (DISTILL, DELIVER) can ask "which artefact is the source of truth for X?" without re-deriving the answer. The registry is a YAML block emitted once per story at the top of the matrix file, above the Matrix table.

Schema (one entry per descriptive or normative artefact for this story):

```yaml
shared_artifact_registry:
  {artifact_name}:           # e.g. "event-model", "diagrams", "contracts", "ADR-007"
    source_of_truth: {path}  # the file that ratifies this artefact's classifications
    consumers: [{phase}, ...] # downstream phases that read it: DISTILL | DELIVER
    owner: {agent-id}        # the agent allowed to write to source_of_truth (e.g. solution-architect)
    integration_risk: low | medium | high  # how badly drift here would corrupt downstream phases
    validation: {gate-id}    # which Phase 9 gate cell verifies this artefact (e.g. G10, G12)
```

Worked example for one story:

```yaml
shared_artifact_registry:
  ADR-007:
    source_of_truth: docs/adr/adr-007-eligibility-cqrs.md
    consumers: [DISTILL, DELIVER]
    owner: solution-architect
    integration_risk: high
    validation: G2
  event-model:
    source_of_truth: docs/domain/event-model/{bounded-context}.md
    consumers: [DISTILL]
    owner: solution-architect
    integration_risk: medium
    validation: G10
  diagrams:
    source_of_truth: docs/architecture/{bounded-context}.md
    consumers: [DELIVER]
    owner: solution-architect
    integration_risk: medium
    validation: G10
  contracts:
    source_of_truth: .copilot-tracking/skraft-plans/{project-slug}/details/{date}/contracts-{story-id}.md
    consumers: [DISTILL, DELIVER]
    owner: solution-architect
    integration_risk: high
    validation: G10
```

Reviewer use: G10 reads the registry to know which artefacts are in scope for this story's matrix. G12 reads the registry to know which artefacts must be `grep`'d for stale supersession citations.

---

## Matrix body

```markdown
<!-- markdownlint-disable-file -->
# Consistency Matrix — {story-id}

**Story:** {story-id}
**Date:** {YYYY-MM-DD}
**Source of truth:** ADR set under `docs/adr/adr-*.md`

## Matrix

| Concept | ADR (source of truth) | event-model | diagrams | contracts | Cause | Verdict |
|---|---|---|---|---|---|---|
| `{concept-name}` | `{adr-truth}` (ADR-{NNN}) | `{cell-value}` | `{cell-value}` | `{cell-value}` | n/a \| LABEL_DRIFT \| CLASSIFICATION_DRIFT \| STRUCTURAL_DRIFT | PASS \| FAIL |

## Back-propagation journal

| Round | Concept | Artefact rewritten | Before → After | Trigger |
|---|---|---|---|---|
| 1 | `{concept-name}` | `{artefact-path}` | `{old}` → `{new}` | LABEL_DRIFT \| CLASSIFICATION_DRIFT |

## Final verdict

- docs-relied-on: {docs/ files the story relies on, comma separated; each exists in the working copy}
- consistency-gate: PASS \| FAIL
- back-propagation rounds used: {n} (max 1 per artefact)
```

---

## Cause classification (per divergent row)

| Cause | Definition | Action | Retry budget |
|---|---|---|---|
| `LABEL_DRIFT` | Same concept, different vocabulary (e.g. `VO` vs `Value Object` vs `ValueObject`). | Back-propagate: rewrite the upstream artefact to use the ADR's spelling. | 1 per artefact |
| `CLASSIFICATION_DRIFT` | Same concept, incompatible category (`Command` vs `Query`, `Entity` vs `Value Object`, `Aggregate` vs `Domain Service`). | Back-propagate: rewrite the upstream artefact to align on the ADR. | 1 per artefact, then blocked |
| `STRUCTURAL_DRIFT` | The concept exists in one artefact and not the other (e.g. ADR mentions an aggregate the diagram never drew, or contracts define a `Repository` that no ADR ratified). | **No back-propagation.** A real decision gap: rewrite a `Proposed` ADR or the artefact in place, supersede an `Accepted` ADR, else blocked (below). | 0 |

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

## A drift no rewrite settles

When `STRUCTURAL_DRIFT` fires, or `CLASSIFICATION_DRIFT` survives its rewrite, and no in-place rewrite of a `Proposed` ADR or of the artefact settles it, the architect returns a blocked result whose summary holds one pick-one question and options A, B and C with their consequence. The skraft engine asks the human and runs the architect again with the answer. No blocker or resolution file is written.
