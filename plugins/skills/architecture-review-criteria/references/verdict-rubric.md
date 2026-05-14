# Verdict Rubric — DESIGN Review

## Overview

The verdict rubric governs how the `solution-architect-reviewer` agent derives a final verdict from the findings of three independent lenses (consistency, architecture-compliance, fitness). This rubric is the single source of truth for verdict calculation.

---

## Verdict Derivation Table

| Condition | Verdict |
|---|---|
| ≥1 BLOCKER finding (any lens) | `rejected` |
| ≥1 HIGH finding, 0 BLOCKERs | `changes_requested` |
| MEDIUM findings only (0 HIGH, 0 BLOCKER) | `changes_requested` |
| LOW findings only | `approved` with notes |
| Zero findings across all lenses | `approved` |

---

## Confidence Levels

| Level | Condition |
|---|---|
| `high` | All required artefacts present (all ADRs, all diagrams, all contracts, context map). All 9 gates evaluated. No ambiguity in findings. |
| `medium` | Some artefacts missing or partially complete. Gates were evaluated on available material. Verdict may change when missing artefacts are added. |
| `low` | Critical artefacts missing (e.g., no contracts, no context map). Verdict is tentative. Review must be re-run when artefacts are complete. |

---

## Dissent Resolution Table

When lenses disagree (some pass, some fail):

| Pattern | Rule |
|---|---|
| 2 lenses pass, 1 fails with BLOCKER | Verdict = `rejected`. State explicitly: "Lens X fails. Lenses Y and Z pass. The BLOCKER in lens X is determinative." |
| 2 lenses pass, 1 fails with HIGH only | Verdict = `changes_requested`. State: "Lens X fails on HIGH finding. Lenses Y and Z pass." |
| All 3 lenses fail | Verdict = `rejected` (if BLOCKER present) or `changes_requested`. Summarise by severity, highest first. |
| 1 lens is inconclusive (missing inputs) | Note the gap. If other lenses yield BLOCKER → `rejected`. Otherwise: `changes_requested` with the caveat that the inconclusive lens must be re-run when artefacts are complete. |

**Dissent rule:** A failing lens is never silently overridden by two passing lenses. The failure is always explicit in the synthesis section of the output.

---

## Example Verdict 1: Approved (All Lenses Pass)

```yaml
verdict: approved
confidence: high
lenses:
  consistency:
    status: pass
    findings: []
  architecture-compliance:
    status: pass
    findings: []
  fitness:
    status: pass
    findings: []
synthesis:
  blocking_findings: []
  recommendations:
    - "ADR-002 could be strengthened by explicitly naming the rejected alternative (state-based persistence) with a reason tied to the audit trail requirement."
  dissent: ""
```

**Narrative:** All three lenses pass across all 9 gates. The DESIGN artefacts for the eligibility check feature are architecturally sound and ready to proceed to DISTILL. The recommendation to strengthen ADR-002 is advisory and does not block progress.

---

## Example Verdict 2: Changes Requested (G5 HIGH Violation)

```yaml
verdict: changes_requested
confidence: high
lenses:
  consistency:
    status: pass
    findings: []
  architecture-compliance:
    status: fail
    findings:
      - gate: G5
        severity: HIGH
        artefact: .skraft/sdlc/design/diagrams-eligibility.md
        description: "EligibilityAggregate contains a direct reference to PolicyAggregate (not an ID). The diagram shows 'EligibilityAggregate → PolicyAggregate root entity' inside the EligibilityContext boundary. This is a cross-aggregate invariant violation: EligibilityAggregate must reference PolicyId only."
  fitness:
    status: pass
    findings: []
synthesis:
  blocking_findings: []
  recommendations:
    - "Replace the PolicyAggregate reference in EligibilityAggregate with PolicyId (value object). If the eligibility check needs policy data, pass it as a parameter to the Check() method — loaded by the Application layer beforehand."
    - "Update diagrams-eligibility.md to show PolicyId (value object) instead of PolicyAggregate (root entity)."
  dissent: "Consistency lens and fitness lens both pass. Architecture-compliance lens fails on G5 HIGH. This is not a BLOCKER but must be resolved before DISTILL — cross-aggregate references will cause test isolation failures in the implementation."
```

**Narrative:** The consistency and fitness lenses pass. The architecture-compliance lens identifies a cross-aggregate reference in the eligibility diagram (G5 HIGH). The `EligibilityAggregate` holds a direct reference to `PolicyAggregate` rather than a `PolicyId` value object. This must be corrected before proceeding to DISTILL, as it will cause test isolation failures and prevents independent evolution of the two aggregates. The fix is straightforward: replace the aggregate reference with a value object ID.

---

## Example Verdict 3: Rejected (G2 BLOCKER — Contradicting ADRs)

```yaml
verdict: rejected
confidence: high
lenses:
  consistency:
    status: fail
    findings:
      - gate: G2
        severity: BLOCKER
        artefact:
          - .skraft/sdlc/design/adr-001-cqrs-eligibility.md
          - .skraft/sdlc/design/adr-005-unified-model-eligibility.md
        description: "ADR-001 (status: Accepted) prescribes CQRS for the eligibility check — separate command and query models. ADR-005 (status: Accepted) prescribes a single unified model for eligibility, stating that the read and write shapes are identical and CQRS is not needed. Both ADRs are status Accepted and apply to the same scope (EligibilityContext). This is a direct contradiction. The architecture cannot be implemented consistently until this is resolved."
  architecture-compliance:
    status: pass
    findings: []
  fitness:
    status: fail
    findings:
      - gate: G7
        severity: HIGH
        artefact: .skraft/sdlc/design/event-model-eligibility.md
        description: "Story US-03 (Driver renews eligibility before expiry) is listed in stories-milestone-1.md. No RenewEligibility command or EligibilityRenewed event appears in any event model or contract."
synthesis:
  blocking_findings:
    - "G2 BLOCKER: ADR-001 and ADR-005 contradict each other on the CQRS decision for EligibilityContext. One must be superseded before the architecture can be implemented."
  recommendations:
    - "Resolve the CQRS contradiction: either supersede ADR-001 in favour of ADR-005 (document why CQRS was rejected upon further analysis) or supersede ADR-005 in favour of ADR-001 (confirm that CQRS is required)."
    - "Add RenewEligibility command and EligibilityRenewed event to the event model to cover US-03."
  dissent: "Architecture-compliance lens passes. Consistency lens fails with a BLOCKER (G2). Fitness lens fails with a HIGH (G7). The BLOCKER in the consistency lens is determinative — the verdict is rejected regardless of the G7 finding, which must also be addressed before re-review."
```

**Narrative:** The architecture-compliance lens passes. However, the consistency lens identifies a BLOCKER: ADR-001 and ADR-005 are both `Accepted` and directly contradict each other on the CQRS decision for `EligibilityContext`. The architecture cannot be implemented consistently in this state. Additionally, the fitness lens identifies that story US-03 (eligibility renewal) has no corresponding commands or events in the event model. Both issues must be resolved before the DESIGN can be re-reviewed. The CQRS contradiction must be resolved first, as it affects the fundamental structure of the eligibility feature.
