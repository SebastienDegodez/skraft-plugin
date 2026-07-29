# Verdict Rubric — DISCUSS Review

Verdict derivation rules, confidence levels, dissent resolution, and three canonical example verdicts for the `backlog-planner-reviewer`.

---

## Verdict Derivation Table

| Condition | Verdict | Rationale |
|---|---|---|
| ≥1 BLOCKER finding across any lens | `rejected` | Artefact cannot be used by DESIGN as-is. Must return to DISCUSS. |
| ≥1 HIGH finding, 0 BLOCKER | `changes_requested` | Significant quality gap. Increases DESIGN risk or causes DISTILL rework. |
| MEDIUM findings only | `changes_requested` | Quality improvement needed. Proceeding adds incremental technical debt. |
| LOW findings only | `approved` | Style or consistency issue. Does not affect DESIGN. Recommendation issued. |
| No findings | `approved` | All 8 gates pass. Story ready for DESIGN. |

**Aggregate rule:** Severity findings stack. A story with 3 HIGH findings is still `changes_requested` (not escalated to `rejected`). A story with 1 BLOCKER and 5 LOW findings is `rejected` because of the BLOCKER.

**DoR aggregate rule (override):** If a single story has 2+ failing DoR items — regardless of individual severity — the verdict for that story is `rejected`. Two HIGH-severity DoR violations = `rejected`.

---

## Confidence Levels

| Level | Condition |
|---|---|
| `high` | All required artefacts present (`stories-{milestone}.md` and all `ac-draft-{story}.md`). All 4 lenses fully applied. |
| `medium` | Context artefact (`triage-{date}.md`) missing. Some inferences made about story origin or priority. Required artefacts present. |
| `low` | One or more required artefacts missing. Lenses applied on incomplete data. Findings may be incomplete. |

---

## Dissent Resolution

When two lenses produce conflicting severity assessments for the same finding:

1. The higher severity prevails
2. The conflict is documented in the `dissent` field of the verdict YAML
3. The dissent field format: `"Lens A assessed {finding} as {severity-A}; Lens B assessed same finding as {severity-B}. Higher severity {severity-max} applied per protocol."`

**Example:** The invest-lens assesses "no AC written" as HIGH (Not Testable). The dor-compliance-lens assesses the same gap as BLOCKER (DoR Item 4: no UAT scenarios). The BLOCKER prevails.

---

## Example Verdict 1: approved

All lenses pass. All stories are DoR-compliant, INVEST-valid, and antipattern-free.

```yaml
verdict: approved
confidence: high
lenses:
  invest:
    status: pass
    findings: []
  ac-quality:
    status: pass
    findings: []
  planning-coherence:
    status: pass
    findings: []
  dor-compliance:
    status: pass
    findings: []
synthesis:
  blocking_findings: []
  recommendations:
    - "STORY-03: Consider adding a Scenario Outline for parametrized accident-count cases
       in DISTILL (not required for DISCUSS approval)."
    - "Sprint capacity is at 87% of sustainable pace — monitor for overload risk if
       any story slips."
  dissent: "none"
```

**Review Summary:**
Three stories reviewed across the v0.2-eligibility milestone: STORY-01 (Driver Profile), STORY-03 (Eligibility Check), and STORY-06 (Certificate Download). All 8 gates pass on all stories. The sprint plan is a valid DAG, capacity is within sustainable bounds, and no antipatterns were detected. All stories are approved to proceed to DESIGN. One recommendation is offered for DISTILL phase only and does not affect this verdict.

---

## Example Verdict 2: changes_requested

G3 HIGH violation: AC-02 on STORY-03 contains an HTTP status code (AP-DISCUSS-03: Technical AC).

```yaml
verdict: changes_requested
confidence: high
lenses:
  invest:
    status: pass
    findings: []
  ac-quality:
    status: fail
    findings:
      - gate: G3
        severity: HIGH
        story: "STORY-03"
        ac: "AC-02"
        detail: >
          AC-02 contains 'HTTP 422' and 'JSON body { eligible: false }'. These are
          implementation prescriptions, not observable user outcomes. Violates G3
          (implementation-free ACs) and triggers AP-DISCUSS-03 (Technical AC).
          AC-02 must be rewritten in domain language: describe what the driver
          sees, not what the API returns.
  planning-coherence:
    status: pass
    findings: []
  dor-compliance:
    status: fail
    findings:
      - gate: G8
        severity: HIGH
        story: "STORY-03"
        antipattern: "AP-DISCUSS-03"
        detail: >
          AP-DISCUSS-03 (Technical AC) confirmed in AC-02. HTTP 422 and JSON body
          detected. Verdict impact: HIGH → changes_requested.
synthesis:
  blocking_findings: []
  recommendations:
    - "STORY-03 AC-02: Rewrite as 'Given a driver with 2 at-fault accidents in the
       last 3 years / When the driver requests an eligibility check / Then the driver
       receives an ineligibility notice stating the reason'. Remove all HTTP/JSON references."
    - "Review all remaining ACs for AP-DISCUSS-03 patterns before resubmitting."
  dissent: "none"
```

**Review Summary:**
Three stories reviewed for the v0.2-eligibility milestone. STORY-01 and STORY-06 pass all 8 gates. STORY-03 fails G3 (ac-quality-lens): AC-02 contains an HTTP 422 code and JSON body reference, which prescribes an implementation detail rather than describing an observable user outcome. The Technical AC antipattern (AP-DISCUSS-03) is confirmed. No BLOCKER findings exist; the verdict is `changes_requested`. STORY-03's AC-02 must be rewritten before the milestone can be approved for DESIGN.

---

## Example Verdict 3: rejected

G8 BLOCKER on STORY-07: Giant Stories critical antipattern (AP-DISCUSS-04) — story has 9 ACs and covers the complete insurance application flow.

```yaml
verdict: rejected
confidence: high
lenses:
  invest:
    status: fail
    findings:
      - gate: G1
        severity: BLOCKER
        story: "STORY-07"
        criterion: "Small"
        detail: >
          STORY-07 has 9 acceptance criteria and an XL effort estimate (5 days).
          The story covers personal details entry, licence validation, eligibility
          check, document upload, and payment — five distinct user journey segments.
          Violates INVEST-S (not small). AP-DISCUSS-04 (Giant Stories) confirmed.
  ac-quality:
    status: pass
    findings: []
  planning-coherence:
    status: fail
    findings:
      - gate: G5
        severity: HIGH
        detail: >
          STORY-07 scope spans the v0.2-eligibility AND v0.3-document-upload AND
          v0.4-payment milestones. It cannot be completed within the v0.2 time-box.
          G5 violation: story does not fit the milestone's stated theme.
  dor-compliance:
    status: fail
    findings:
      - gate: G7
        severity: BLOCKER
        story: "STORY-07"
        dor_item: "6 — Right-sized"
        detail: >
          Effort estimate is XL (5 days). DoR Item 6 requires XS/S/M/L. XL is an
          automatic failure. Story must be split before DoR can be claimed.
      - gate: G8
        severity: BLOCKER
        story: "STORY-07"
        antipattern: "AP-DISCUSS-04"
        detail: >
          Giant Stories antipattern confirmed: 9 ACs, XL estimate, scope covers
          5 user journey segments. CRITICAL antipattern → auto-reject.
synthesis:
  blocking_findings:
    - "STORY-07: AP-DISCUSS-04 (Giant Stories) — CRITICAL antipattern. Auto-reject."
    - "STORY-07: DoR Item 6 fails — XL estimate. Story must be split before re-submission."
    - "STORY-07: G1-S fails — XL estimate + 9 ACs + 5 user journey segments."
  recommendations:
    - "Split STORY-07 into 5 focused stories using Pattern 1 (By Workflow Step):
       STORY-01 (personal details), STORY-02 (licence validation),
       STORY-03 (eligibility check), STORY-04 (document upload), STORY-05 (payment).
       Each should be M or smaller."
    - "After splitting, re-run DoR gate on each resulting story before re-submitting
       for backlog-planner-reviewer review."
    - "Re-assign resulting stories to their respective milestones:
       v0.2-eligibility, v0.3-document-upload, v0.4-payment."
  dissent: "none"
```

**Review Summary:**
Four stories reviewed for the v0.2-eligibility milestone. STORY-01, STORY-03, and STORY-06 pass all 8 gates. STORY-07 fails with three blocking findings: AP-DISCUSS-04 (Giant Stories — CRITICAL antipattern), DoR Item 6 (XL estimate — BLOCKER), and G1-S (Not Small — BLOCKER). The overall milestone verdict is `rejected` because STORY-07 cannot proceed to DESIGN in its current form. The recommended action is to split STORY-07 into 5 focused stories (one per workflow step) and re-submit for review after verifying DoR on each resulting story.
