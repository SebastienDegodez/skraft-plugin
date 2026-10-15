<!-- markdownlint-disable-file -->
# Review verdict

```yaml
verdict: "REJECTED"
confidence: "high"
reviewed_at: "2026-08-17T15:05:00Z"
artefacts_reviewed:
  - ".copilot-tracking/skraft-plans/pricing/features/pricing-loyalty-discount.feature"
  - ".copilot-tracking/skraft-plans/pricing/details/2026-08-17/test-plan-discount.md"
  - ".copilot-tracking/skraft-plans/pricing/details/2026-08-17/impl-plan-discount.md"
lenses:
  traceability:
    status: "fail"
    findings:
      - "AC-4 (reduction lands on a whole cent in the customer's favour) has no scenario in the feature file."
  business-fit:
    status: "fail"
    findings:
      - "The test plan prices baskets in decimal euros, contradicting accepted ADR-001 (money is carried as integer cents). Changing that decision is a product call, not a rework."
  cold-reader:
    status: "pass"
    findings: []
synthesis:
  questions:
    completeness:
      answered_by:
        - "traceability"
      weight: "0.30"
      contribution: "0.00"
    business-fit:
      answered_by:
        - "business-fit"
      weight: "0.30"
      contribution: "0.00"
    quality:
      answered_by:
        - "cold-reader"
      weight: "0.15"
      contribution: "0.15"
    risk:
      answered_by:
        - "business-fit"
      weight: "0.25"
      contribution: "0.00"
  blocking_findings:
    - "AC-4 is untested."
    - "The plan contradicts accepted ADR-001; a human must decide whether to supersede it."
  recommendations: []
  dissent: "none"
```
