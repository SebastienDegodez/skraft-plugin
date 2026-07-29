# Triage Report Template

Blank template and a filled auto-insurance example for the DISCOVER phase triage output.

---

## Blank Template

```markdown
# Triage Report — {YYYY-MM-DD}

## Discovery Mode
{user-assigned | artifact-driven | search-based}

Query used: `{query string}`
Issues found: {N}
Issues triaged: {N}
Run timestamp: {ISO-8601}

---

## Triaged Issues

| # | Title | Type | Priority | Effort | Notes |
|---|---|---|---|---|---|
| {id} | {title} | {feature\|bug\|tech-debt\|docs\|question} | {P0\|P1\|P2\|P3} | {XS\|S\|M\|L\|XL} | {notes — include P0 justification here} |

---

## Duplicates Detected

| Issue | Similar To | Similarity | Recommendation |
|---|---|---|---|
| #{id} | #{id} | {xx%} | {merge \| link \| keep separate} |

*If no duplicates detected: "No duplicates detected in this triage run."*

---

## XL Issues — Must Split Before DISCUSS

| # | Title | Why XL | Split suggestion |
|---|---|---|---|
| {id} | {title} | {reason} | {proposed sub-issues} |

*If no XL issues: "No XL issues identified."*

---

## Sprint Proposal (capacity: {N} team-days)

Effective capacity: {N × 0.7} days

| # | Title | Priority | Effort | Days | Justification |
|---|---|---|---|---|---|
| {id} | {title} | {priority} | {effort} | {days} | {why in sprint} |

**Total effort**: {sum} days
**Effective capacity**: {available} days
**Sprint status**: {within capacity | over capacity — P0 override}

---

## Over-Capacity Items (P0 override)

| # | Title | Priority | Effort | Days |
|---|---|---|---|---|
| {id} | {title} | P0 | {effort} | {days} |

*If not over capacity: omit this section.*

---

## Ready for DISCUSS

- [ ] All issues labeled (type + priority + effort + status)
- [ ] P0 issues have written justification in Notes
- [ ] Duplicates detected and handled
- [ ] XL issues flagged and excluded from sprint
- [ ] Sprint proposal within capacity (P0 overrides documented)
- [ ] Reviewer (backlog-discoverer-reviewer) approved
```

---

## Filled Example — MonAssurance Auto-Insurance

```markdown
# Triage Report — 2026-05-14

## Discovery Mode
user-assigned

Query used: `assignee:@me is:open is:issue sort:updated-desc -label:wontfix`
Issues found: 8
Issues triaged: 8
Run timestamp: 2026-05-14T10:30:00Z

---

## Triaged Issues

| # | Title | Type | Priority | Effort | Notes |
|---|---|---|---|---|---|
| 43 | Fix validation error on driver age field | bug | P0 | S | P0: Age < 0 throws NullReferenceException — blocks all application submissions |
| 42 | Add eligibility check for young drivers | feature | P1 | M | Core flow for v0.2 sprint goal |
| 58 | Driver profile missing secondary driver support | feature | P1 | L | Required for multi-driver policies in v0.2 milestone |
| 67 | Premium calculation incorrect for multi-vehicle policies | bug | P1 | M | Returns wrong amount — impacts user decisions |
| 71 | Add pagination to driver list endpoint | feature | P2 | S | Performance improvement — list is slow beyond 50 drivers |
| 75 | Add reason codes to eligibility API response | feature | P2 | S | Enhancement for partner integrations |
| 82 | Improve validation error messages on eligibility form | feature | P2 | XS | UX improvement — currently too generic |
| 89 | Add tooltip to eligibility form fields | feature | P3 | XS | Cosmetic — form is usable without tooltips |

---

## Duplicates Detected

| Issue | Similar To | Similarity | Recommendation |
|---|---|---|---|
| #75 | #42 | 45% | Related (both touch eligibility API) — keep separate, different scope |

*Issues #75 and #42 are related but distinct: #42 adds the check, #75 adds reason codes to the response.*

---

## XL Issues — Must Split Before DISCUSS

No XL issues identified in this triage run.

---

## Sprint Proposal (capacity: 7 team-days)

Effective capacity: 7 × 0.7 = 4.9 days

| # | Title | Priority | Effort | Days | Justification |
|---|---|---|---|---|---|
| 43 | Fix validation error on driver age field | P0 | S | 0.5 | Blocking — must fix immediately |
| 42 | Add eligibility check for young drivers | P1 | M | 1.0 | Sprint goal |
| 67 | Premium calculation incorrect for multi-vehicle | P1 | M | 1.0 | Wrong output impacts user decisions |
| 58 | Driver profile missing secondary driver support | P1 | L | 2.5 | Required for v0.2 milestone |

**Total effort**: 5.0 days
**Effective capacity**: 4.9 days
**Sprint status**: over capacity — P0 override (issue #43 included despite tight capacity)

---

## Over-Capacity Items (P0 override)

| # | Title | Priority | Effort | Days |
|---|---|---|---|---|
| 43 | Fix validation error on driver age field | P0 | S | 0.5 |

*Issue #43 enters sprint despite capacity being at 4.9 days. P0 override applied.*

---

## Ready for DISCUSS

- [x] All issues labeled (type + priority + effort + status)
- [x] P0 issues have written justification in Notes (#43)
- [x] Duplicates detected and handled (#75 related to #42, documented)
- [x] XL issues flagged and excluded from sprint (none this run)
- [x] Sprint proposal within capacity (P0 override documented)
- [ ] Reviewer (backlog-discoverer-reviewer) approved
```

---

## Template Notes

### P0 Justification Format

Always write P0 notes in this format:
> `"P0: {what is broken} — {who is impacted / what is the risk}"`

Examples:
- `"P0: NullReferenceException on age < 0 — blocks all application submissions"`
- `"P0: Premium overcharged for protected category — provincial compliance violation"`

### Effort-to-Days Conversion

| Effort | Days |
|---|---|
| XS | 0.25 |
| S | 0.5 |
| M | 1.0 |
| L | 2.5 |
| XL | excluded |

### Capacity Formula

```
effective_capacity = declared_team_days × 0.7
```

The 0.7 factor accounts for meetings, code reviews, incident response, and context-switching.
