---
name: issue-triage
description: "Use when triaging GitHub issues by assigning labels, priority, effort estimates, or detecting duplicates. Covers triage methodology, label taxonomy, priority frameworks, effort sizing, and sprint proposal construction."
---

# Issue Triage

## Overview

Triage assigns structured metadata to issues so DISCUSS can refine them in priority order. Every triaged issue must have a **type**, **priority**, and **effort estimate** before it is eligible for DISCUSS.

Core principle: **triage is classification, not refinement**. You are not writing acceptance criteria here — you are labeling, prioritizing, and estimating to enable the next phase.

---

## Label Taxonomy

All GitHub issues passing through DISCOVER must receive labels from the following taxonomy.

### Type Labels

| Label | When to Apply |
|---|---|
| `type/feature` | New user-facing capability that does not currently exist |
| `type/bug` | Behavior that is incorrect relative to expected behavior |
| `type/tech-debt` | Internal quality improvement — no change in user-facing behavior |
| `type/docs` | Documentation — README, API docs, in-code comments |
| `type/question` | Needs clarification before it can be triaged properly |

### Priority Labels

| Label | Definition |
|---|---|
| `priority/P0` | Blocking users or a legal/compliance/data-loss risk. Must be addressed immediately. Requires written justification. |
| `priority/P1` | High business value. Should be in the next sprint. |
| `priority/P2` | Medium value. Target the next 2–3 sprints. |
| `priority/P3` | Nice-to-have. Not in the current roadmap. Backlog item. |

### Effort Labels

| Label | Duration |
|---|---|
| `effort/XS` | < 2 hours — a one-liner, config change, or text correction |
| `effort/S` | 2–4 hours — a small validation, DTO field, or targeted bug fix |
| `effort/M` | ~1 day — a new use case, new endpoint, or feature with 2–3 ACs |
| `effort/L` | 2–3 days — a new aggregate, complex business rule, subsystem refactor |
| `effort/XL` | > 3 days — a new bounded context or major architectural change. **Must be split before DISCUSS.** |

### Status Labels

| Label | Meaning |
|---|---|
| `status/needs-triage` | Newly created, not yet classified |
| `status/ready` | Triaged — has type, priority, and effort. Ready for DISCUSS. |
| `status/duplicate` | Confirmed duplicate of another issue. Original linked in comment. |
| `status/wontfix` | Explicitly out of scope. Decision documented. |

### Area Labels (Optional)

| Label | Coverage |
|---|---|
| `area/domain` | Domain logic — entities, value objects, domain services |
| `area/api` | API layer — controllers, DTOs, request/response contracts |
| `area/infra` | Infrastructure — persistence, external integrations |
| `area/ui` | Frontend / client-facing surfaces |

---

## Priority Framework (P0–P3)

### P0 — Critical

**Definition**: The system is broken in a way that blocks users from completing a core flow, or there is a legal, compliance, or data-loss risk.

**Qualifying criteria**:
- A user cannot complete their primary job-to-be-done (e.g., cannot submit an insurance application)
- Data loss or data corruption is occurring or imminent
- Legal or regulatory compliance is violated (e.g., GDPR, IFRS, provincial insurance regulations)
- Security vulnerability that exposes user data

**Auto-insurance examples**:
- Driver age validation is throwing an unhandled exception → application submission blocked → P0
- Eligibility calculation overcharging a protected category due to a bug → P0 (compliance)
- User session tokens not expiring → P0 (security)

**Disqualifying criteria** (NOT P0):
- Feature is missing but users can work around it
- Performance degradation (unless causing timeouts that block submission)
- A P1 feature is incomplete

**Mandatory**: Every P0 label must include a written justification in the "Notes" field:
> "P0: Driver age validation crashes — blocks all application submissions (reported by 3 users, 2026-05-14)"

---

### P1 — High Value

**Definition**: High business value. Should be in the next sprint. Does not block today's users but is on the critical path for the next release.

**Qualifying criteria**:
- Core feature required for the next milestone or sprint goal
- Bug that significantly degrades user experience without fully blocking them
- Required for a near-term compliance deadline (> 1 week away)

**Auto-insurance examples**:
- Add eligibility check for young drivers (core flow, next sprint goal)
- Fix incorrect premium calculation for multi-vehicle policies (wrong output, not crash)
- Implement secondary driver support (needed for v0.2 milestone)

**Disqualifying criteria**:
- The feature has no defined delivery target
- "Would be nice" but not on the product roadmap

---

### P2 — Medium Value

**Definition**: Meaningful improvement, but not urgent. Target the next 2–3 sprints.

**Qualifying criteria**:
- Enhances an existing feature without it being broken
- Performance improvement that is noticeable but not blocking
- Developer experience improvement

**Auto-insurance examples**:
- Add eligibility reason codes to the API response (enhancement)
- Improve error messages in the eligibility check (UX improvement)
- Add pagination to the driver list endpoint (performance improvement)

---

### P3 — Nice-to-Have

**Definition**: Low business value or unclear ROI. Not in the current product roadmap.

**Qualifying criteria**:
- Cosmetic, aesthetic, or minor convenience
- Feature requested once with no validation
- Already has an acceptable workaround

**Auto-insurance examples**:
- Add tooltips to the eligibility form
- Support dark mode in the customer portal
- Add CSV export of audit logs

**Disqualifying criteria**:
- Do NOT use P3 for things that are genuinely not worth doing — use `status/wontfix` instead

---

### Priority Decision Tree

```
Q1: Is a user completely blocked from completing a core flow right now?
  YES → P0

Q2: Is there a legal, compliance, or data-loss risk?
  YES → P0

Q3: Is this in the sprint goal or next milestone?
  YES → P1

Q4: Is this a significant UX improvement or important enhancement?
  YES → P2

Default → P3
```

---

## Effort Estimation Heuristics

### Signals That Affect Estimation

| Signal | Implication |
|---|---|
| Number of acceptance criteria (ACs) | 1 AC = XS/S, 2-3 ACs = M, 4+ ACs = L or XL |
| Number of architecture layers touched | 1 layer = S/M, 2-3 layers = M/L, 4+ layers = L/XL |
| External dependencies changed | +1 size level per external dependency |
| New concept or aggregate introduced | +L minimum |
| Refactoring existing code | Depends on scope — targeted = S, cross-cutting = XL |

### Estimation by Label

| Label | Example tasks in auto-insurance domain |
|---|---|
| `effort/XS` | Fix a typo in a validation message, update a config value, add a missing null check |
| `effort/S` | Add a `driverAge` field validation, fix a bug in a single use case, add a DTO property |
| `effort/M` | Implement `CheckEligibilityUseCase`, add a new API endpoint with request/response, fix a multi-step bug |
| `effort/L` | Build the `DriverProfile` aggregate with value objects, refactor the eligibility module, add audit logging across the domain |
| `effort/XL` | Introduce a new bounded context (Claims), major architectural change (CQRS migration), full subsystem rebuild |

### XL Warning

Any issue estimated as `effort/XL` **must be flagged before entering DISCUSS**. XL issues are too large to write meaningful ACs for without splitting. The triage report must include a "must split" note for every XL issue.

---

## Duplicate Detection

### Similarity Levels

| Level | Title Similarity | Action |
|---|---|---|
| EXACT | > 95% | Mark the newer issue as `status/duplicate`. Add comment linking to the original. |
| NEAR | 80–95% | Recommend merge. Add `related-to:#{original}` comment on both. Flag in triage report. |
| RELATED | 40–80% | Note as related. No merge. Add in the "Duplicates" section of the triage report. |
| DIFFERENT | < 40% | Separate issues. No action needed. |

### Normalization for Comparison

Before comparing titles:
1. Lowercase all words
2. Remove stop words: `the`, `a`, `an`, `is`, `in`, `for`, `of`, `to`, `with`, `and`, `or`, `not`, `on`, `at`
3. Remove punctuation
4. Sort remaining words alphabetically
5. Compare using word overlap ratio: `|intersection| / |union|`

**Example**:
- Issue A: "Fix validation error on driver age field"
- Issue B: "Driver age field validation fails"
- Normalized A: `[age, driver, error, field, fix, validation]`
- Normalized B: `[age, driver, fail, field, validation]`
- Overlap: `{age, driver, field, validation}` = 4 words
- Union: 7 words
- Similarity: 4/7 = 57% → RELATED

### When in Doubt

Link rather than merge. Merging issues loses context. If similarity is ambiguous (50–70%), add a `related-to` comment and flag in the report — let the team decide.

---

## Triage Output Format

### Issue Triage Table

```markdown
| # | Title | Type | Priority | Effort | Notes |
|---|---|---|---|---|---|
| 42 | Add eligibility check for young drivers | feature | P1 | M | Core feature for v0.2 |
| 43 | Fix validation error on driver age field | bug | P0 | S | Blocking form submission — crashes on age < 0 |
| 58 | Driver profile missing secondary driver | feature | P1 | L | Required for multi-driver policies |
| 71 | Add pagination to driver list endpoint | feature | P2 | S | UX improvement, not blocking |
| 89 | Add tooltip to eligibility form | feature | P3 | XS | Cosmetic, low priority |
```

### Sprint Proposal Capacity Calculation

Effort-to-days conversion:
- XS = 0.25 day
- S = 0.5 day
- M = 1 day
- L = 2.5 days
- XL = excluded (must split)

Effective capacity = team-days × 0.7 (accounts for meetings, reviews, incidents)

---

## Sprint Proposal Construction

1. **Sort** all triaged issues by priority: P0 first, then P1, then P2, then P3
2. **Apply capacity constraint**: effective capacity = declared team-days × 0.7
3. **Fill greedily**: add issues until effective capacity is reached
4. **Override for P0**: all P0 issues enter the sprint regardless of capacity (mark "over capacity" if needed)
5. **Enforce XL exclusion**: no XL issue enters the sprint — must be split first
6. **Note over-capacity**: if total effort > effective capacity, mark sprint as "over capacity" with explanation

### Sprint Proposal Table

```markdown
| # | Title | Priority | Effort | Days | Justification |
|---|---|---|---|---|---|
| 43 | Fix validation error on driver age field | P0 | S | 0.5 | Blocking — must fix |
| 42 | Add eligibility check for young drivers | P1 | M | 1.0 | Sprint goal |
| 58 | Driver profile missing secondary driver | P1 | L | 2.5 | Sprint goal |
| 71 | Add pagination to driver list endpoint | P2 | S | 0.5 | Capacity available |

Total: 4.5 days | Effective capacity: 5.0 days (7 team-days × 0.7)
Status: within capacity
```

---

## References

- [label-taxonomy.md](references/label-taxonomy.md) — full label definitions, color codes, conflict rules
- [priority-criteria.md](references/priority-criteria.md) — P0–P3 decision framework with domain examples
- [triage-template.md](references/triage-template.md) — blank template and filled auto-insurance example
