# User Story Template

A canonical template for writing user stories at the DISCUSS phase, followed by a filled example from the MonAssurance eligibility domain.

---

## Blank Template

```markdown
## Story: {ID} — {Short Title}

**As a** {specific persona},
**I want** {capability},
**So that** {concrete business benefit}.

### Domain Examples

1. {concrete example 1 — real names, real values, real outcome}
2. {concrete example 2 — different scenario, different outcome if applicable}
3. {concrete example 3 — edge case or boundary condition}

### Acceptance Criteria

**AC-01:** {condition name}
Given {precondition — state of the world before the action}
When {trigger — one business action only}
Then {observable outcome — visible to user or at system boundary}
And {additional observable outcome if needed}

**AC-02:** {condition name}
Given {precondition}
When {trigger}
Then {observable outcome}

**AC-03:** {condition name}
Given {precondition}
When {trigger}
Then {observable outcome}

### Technical Notes
{Known constraints, external integrations, performance requirements, or data format expectations.
Write "None identified" if no constraints are known at story time.}

### Dependencies
{List inter-story dependencies in format: STORY-{ID} — {reason this story depends on it}
Write "None" if the story is fully independent.}

### Effort
{XS | S | M | L} — {one-sentence justification}

### DoR Checklist
- [ ] Problem statement articulates a user problem (not "implement X")
- [ ] Specific persona named with a role
- [ ] 3+ domain examples with real values
- [ ] UAT scenarios written in Given/When/Then
- [ ] Each AC traces back to a UAT scenario
- [ ] Right-sized: deliverable in 1-3 days
- [ ] Technical notes added (or explicitly noted as "none")
- [ ] Dependencies listed (or explicitly noted as "none")
```

---

## Filled Example — Eligibility Check Feature

```markdown
## Story: STORY-03 — Driver Eligibility Check

**As a** first-time driver applying for personal liability coverage,
**I want** to receive an immediate eligibility decision after submitting my profile,
**So that** I know whether my profile qualifies before spending time on document upload and payment.

### Domain Examples

1. Sophie Martin, 29 years old, B licence (valid 8 years), 0 accidents, Peugeot 208 —
   expects eligibility confirmation valid for 30 days.
2. Karim Benali, 21 years old, B licence (valid 2 years), 2 at-fault accidents in the
   last 3 years — expects ineligibility notice with reason "accident threshold exceeded".
3. Isabelle Dupont, 17 years old, provisional licence — expects immediate rejection with
   reason "below minimum age (18 years)".

### Acceptance Criteria

**AC-01:** Eligible driver receives a confirmation
Given a driver aged 29 with 0 accidents in the last 5 years and a valid B licence
When the driver submits their profile for an eligibility check
Then the driver receives an eligibility confirmation
And the confirmation states it is valid for 30 days
And the driver can proceed to the document upload step

**AC-02:** Driver with excess accidents receives an ineligibility notice
Given a driver aged 21 with 2 at-fault accidents in the last 3 years
When the driver submits their profile for an eligibility check
Then the driver receives an ineligibility notice
And the notice states the reason "accident threshold exceeded (2 accidents in 3 years)"
And the driver cannot proceed to the document upload step

**AC-03:** Driver below minimum age is immediately rejected
Given a driver aged 17 with a provisional licence
When the driver submits their profile for an eligibility check
Then the driver receives a rejection notice
And the rejection notice states the reason "below minimum age (minimum: 18 years)"

### Technical Notes
- Integrates with the existing eligibility-service v2 API (endpoint TBD at DESIGN phase)
- Eligibility certificate validity period is 30 days (configurable — confirm with business)
- Response must be returned within 2 seconds (P95) — performance requirement confirmed by product owner
- The eligibility check is stateless; the result is not persisted at this stage (confirm at DESIGN)

### Dependencies
- STORY-01 (Driver Profile Form) — produces the driver profile data consumed by this story's input
- STORY-02 (Licence Validation) — confirms licence validity before eligibility is checked

### Effort
M — 3 ACs, integration with one external service (first-time integration), 2 rejection paths.

### DoR Checklist
- [x] Problem statement articulates a user problem (not "implement X")
- [x] Specific persona named with a role (first-time driver applying for personal liability coverage)
- [x] 3+ domain examples with real values (3 examples with age, accident count, licence type, expected outcome)
- [x] UAT scenarios written in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces back to a domain example
- [x] Right-sized: 1-2 days estimated — M size is appropriate
- [x] Technical notes added (API version, performance requirement, stateless behaviour)
- [x] Dependencies listed (STORY-01 and STORY-02)
```
