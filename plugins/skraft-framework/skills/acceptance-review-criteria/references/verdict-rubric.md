# Verdict Rubric

## Lenses and their gate skills (G1–G11, B1, T1–T4, E1–E2)

Every gate id is unique across the four lenses. Each lens loads `acceptance-review-criteria` and the skill of its own gates.

| Lens | Gates | Skill |
|---|---|---|
| coverage-lens | G1, G2 | `acceptance-review-coverage` |
| business-alignment-lens | G3, G4, B1 | `acceptance-review-business-alignment` |
| testability-lens | G5, G6, T2, T3, T4, T1, G11 | `acceptance-review-testability` |
| boundary-enforcement-lens | G7, G8, E1, E2, G9, G10 | `acceptance-review-boundary-enforcement` |

- A reviewer that judges another's finding loads the skill of the gate that finding cites.
- An agent that checks its own DISTILL outputs before its result loads the four skills: every gate applies to its outputs.

## Severity Definitions

| Severity | Definition | Impact |
|---|---|---|
| **BLOCKER** | Fundamental correctness violation. The artefact cannot be used by DELIVER as-is. | Always triggers `rejected` verdict. |
| **HIGH** | Significant quality gap. Increases implementation risk or causes rework in DELIVER. | Triggers `changes_requested` unless no other severity exists. |
| **MEDIUM** | Quality improvement. Can be implemented but suboptimal. | Triggers `changes_requested`. |
| **LOW** | Style or consistency issue. Does not affect DELIVER. | `approved` with recommendation. |

## Scoring Rubric (per lens)

| Score | Meaning |
|---|---|
| `pass` | All gates in this lens pass. No findings. |
| `fail` | ≥1 gate in this lens has a finding. |

## Verdict Decision Table

| Finding distribution across ALL lenses | Verdict |
|---|---|
| ≥1 BLOCKER in any lens | `rejected` |
| ≥1 HIGH, 0 BLOCKER (anywhere) | `changes_requested` |
| MEDIUM only, no HIGH, no BLOCKER | `changes_requested` |
| LOW only, or zero findings | `approved` |
| No artefacts available to review | `rejected` (with reason: "artefacts missing") |

---

## Confidence Levels

| Confidence | Condition |
|---|---|
| `high` | All required artefacts present. Findings are unambiguous. Review is complete. |
| `medium` | Some artefacts missing. Or findings require interpretation. Review covers the available scope. |
| `low` | Critical artefacts missing (e.g., no feature file, no AC source). Review is incomplete. Treat as `rejected`. |

---

## Dissent Resolution

| Situation | Action | Verdict impact |
|---|---|---|
| 3 lenses pass, 1 lens fails (BLOCKER) | Uphold minority. Document reasoning. | Verdict = `rejected` |
| 3 lenses pass, 1 lens fails (HIGH) | Uphold minority. Document reasoning. | Verdict = `changes_requested` |
| 3 lenses pass, 1 lens fails (MEDIUM) | Override minority. Document why. | Verdict = `approved` with recommendation |
| 3 lenses pass, 1 lens fails (LOW) | Override minority. Document why. | Verdict = `approved` with recommendation |

**Dissent entry format:**
```
dissent: "business-alignment-lens flagged 'driver ID' as technical (G3 HIGH).
Overridden: 'driver ID' appears in the story as a named domain concept (see AC-02).
Not a technical identifier — it is used as a business reference. Verdict: approved."
```

---

## Example Verdicts

### Example 1: Clean DISTILL output

```yaml
verdict: approved
confidence: high
lenses:
  coverage:
    status: pass
    findings: []
  business-alignment:
    status: pass
    findings: []
  testability:
    status: pass
    findings: []
  boundary-enforcement:
    status: pass
    findings: []
synthesis:
  blocking_findings: []
  recommendations:
    - "Consider naming the downstream API in the Double Type cell of S2."
  dissent: ""
```

---

### Example 2: Changes requested (missing edge case + ambiguous step)

```yaml
verdict: changes_requested
confidence: high
lenses:
  coverage:
    status: fail
    findings:
      - gate: G2
        severity: HIGH
        finding: "No edge case scenario for driver at age boundary (18 years). Domain examples in AC-01 explicitly list this case."
        location: "eligibility-check.feature"
  business-alignment:
    status: pass
    findings: []
  testability:
    status: fail
    findings:
      - gate: G5
        severity: HIGH
        finding: "Step 'Given a valid driver' is ambiguous. 'Valid' is undefined in the story vocabulary. Replace with specific attributes."
        location: "eligibility-check.feature:12"
  boundary-enforcement:
    status: pass
    findings: []
synthesis:
  blocking_findings: []
  recommendations:
    - "Add Scenario Outline for age boundary (17, 18, 19) in eligibility-check.feature."
    - "Replace 'Given a valid driver' with explicit driver attributes matching domain examples."
  dissent: ""
```

---

### Example 3: Rejected (BLOCKER — technical jargon in Gherkin)

```yaml
verdict: rejected
confidence: high
lenses:
  coverage:
    status: pass
    findings: []
  business-alignment:
    status: fail
    findings:
      - gate: G4
        severity: BLOCKER
        finding: "Step 'Then HTTP 200 is returned with body {\"eligible\": true}' exposes HTTP protocol and JSON structure. This is a BLOCKER — implementation detail in Layer 1 (Gherkin)."
        location: "eligibility-check.feature:18"
        suggestion: "Replace with: 'Then the driver is declared eligible'"
  testability:
    status: pass
    findings: []
  boundary-enforcement:
    status: fail
    findings:
      - gate: G7
        severity: BLOCKER
        finding: "Coverage matrix row 3 names 'EligibilityRepository' as the entry point. This is an Infrastructure class, not an Application use case boundary. The use case 'CheckEligibilityUseCase' should be the entry point."
        location: "test-plan-eligibility.md:row 3"
        suggestion: "Change 'Use Case Boundary' to 'CheckEligibilityUseCase' and move repository testing to Infrastructure layer."
synthesis:
  blocking_findings:
    - "G4 BLOCKER: HTTP details in Gherkin step (business-alignment-lens)"
    - "G7 BLOCKER: Infrastructure class as entry point (boundary-enforcement-lens)"
  recommendations: []
  dissent: ""
```
