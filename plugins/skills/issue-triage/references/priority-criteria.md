# Priority Criteria — P0 to P3

Formal definitions and decision guidance for assigning priority labels to GitHub issues during DISCOVER triage.

---

## Overview

Priority reflects **urgency + business impact**. It is not a measure of effort or complexity.

| Priority | Label | One-liner |
|---|---|---|
| P0 | `priority/P0` | Blocking users or a compliance/data-loss risk right now |
| P1 | `priority/P1` | High business value — next sprint |
| P2 | `priority/P2` | Meaningful improvement — next 2–3 sprints |
| P3 | `priority/P3` | Nice-to-have — backlog |

---

## P0 — Critical

### Definition

The issue represents a condition that is actively blocking users from completing a core task, or it poses an immediate legal, regulatory compliance, or data integrity risk.

P0 issues must be addressed before any other work can proceed.

### Qualifying Criteria

| Criterion | Examples from auto-insurance domain |
|---|---|
| Core user flow is completely broken | Driver age validation crashes — users cannot submit applications |
| Data loss or corruption is occurring | Eligibility results being saved to wrong user profile |
| Legal or compliance requirement violated | Eligibility algorithm discriminates against a protected category |
| Security vulnerability exposing user data | Session tokens do not expire; sensitive fields returned in API logs |
| Blocking downstream teams or systems | EligibilityUseCase returns null → Quote service cannot run |

### Disqualifying Criteria

These conditions do NOT make an issue P0:
- A feature is missing but users can complete the flow via a workaround
- Performance is degraded but not causing timeouts or errors
- A future compliance deadline (> 1 week away) — make it P1
- Cosmetic defect that does not affect functionality

### Mandatory Justification

Every issue labeled `priority/P0` **must include a written justification** in the triage Notes field:

**Format**: `"P0: {reason} — {impact evidence}"`

**Examples**:
- `"P0: Driver age validation throws NullReferenceException — blocks all application submissions"`
- `"P0: Premium calculation overcharges drivers under 25 — compliance violation (provincial regulations)"`
- `"P0: User data visible in error logs — security risk, 3 affected sessions identified"`

### Auto-Insurance P0 Examples

| Issue | Justification |
|---|---|
| Driver age field throws unhandled exception | Blocks form submission — core flow broken |
| Eligibility check returns `null` instead of result | Downstream quote service crashes |
| Age under 18 not blocked at any layer | Legal compliance — minors cannot hold policies |
| Insurance application data stored without encryption | Data security regulation (Bill 64) |

---

## P1 — High Value

### Definition

High business value. The issue is not blocking today's users, but it is on the critical path for the next sprint or release milestone. Shipping this issue moves the product forward meaningfully.

### Qualifying Criteria

| Criterion | Examples |
|---|---|
| Core feature required for next sprint goal | Add eligibility check for young drivers (v0.2 sprint goal) |
| Bug that significantly degrades UX without fully blocking | Premium calculation returns incorrect amount — users see wrong price |
| Near-term compliance requirement (1–7 days away) | — |
| Feature explicitly in the next milestone | Implement secondary driver support for v0.2 milestone |
| High user-reported impact (multiple users affected) | — |

### Disqualifying Criteria

- The feature has no defined sprint or milestone target → P2
- Affects edge case users only (< 5% of user base) → P2
- Would be nice but no product commitment → P2 or P3

### Auto-Insurance P1 Examples

| Issue | Why P1 |
|---|---|
| Add eligibility check for young drivers | Core product flow, sprint goal |
| Fix incorrect premium for multi-vehicle policies | Wrong output impacts user decisions |
| Implement secondary driver profile support | Required for v0.2 milestone |
| Return eligibility rejection reasons in API response | Partner integration depends on this |

---

## P2 — Medium Value

### Definition

Meaningful improvement that enhances an existing feature or resolves a non-critical defect. Target the next 2–3 sprints. The product works correctly without this, but users would benefit from it.

### Qualifying Criteria

| Criterion | Examples |
|---|---|
| Enhancement to an existing feature | Add reason codes to eligibility API response |
| Performance improvement (noticeable but not blocking) | Driver list endpoint slow on large datasets |
| Developer experience improvement | Add better error messages to use case validation |
| Non-critical bug affecting a minority of users | Certain combinations of form values produce UI glitch |

### Auto-Insurance P2 Examples

| Issue | Why P2 |
|---|---|
| Add eligibility reason codes to API response | Enhancement — works without it |
| Improve validation error messages | UX improvement — not blocking |
| Add pagination to driver list endpoint | Performance improvement |
| Cache eligibility results for 5 minutes | Performance optimization |

---

## P3 — Nice-to-Have

### Definition

Low business value or unclear ROI. Not in the current product roadmap. The product is complete and functional without this. A reasonable user could not justify prioritizing this over P0–P2 work.

### Qualifying Criteria

| Criterion | Examples |
|---|---|
| Cosmetic or aesthetic improvement | Add tooltips to the eligibility form |
| Feature requested by a single stakeholder with no validation | Add dark mode support |
| Exists a fully acceptable workaround | CSV export when API is already available |
| Long-term quality improvement with no near-term impact | Add JSDoc comments to all use cases |

### Disqualifying Criteria

Do NOT use P3 for things that are genuinely not worth doing — use `status/wontfix` instead.

### Auto-Insurance P3 Examples

| Issue | Why P3 |
|---|---|
| Add tooltips to eligibility form fields | Cosmetic — form is usable without them |
| Support dark mode in customer portal | Low demand, no product commitment |
| Add CSV export of audit logs | API export already exists; CSV is convenience |
| Allow users to save partial application drafts | Edge case, workaround exists (browser refresh) |

---

## Priority Decision Tree

Use this tree when unsure which priority to assign:

```
START HERE
│
├─ Is a user completely blocked from completing a core flow right now?
│  YES → P0 (document: which flow? what error?)
│  NO ↓
│
├─ Is there a legal, compliance, security, or data-loss risk?
│  YES → P0 (document: which regulation? what risk?)
│  NO ↓
│
├─ Is this issue in the declared sprint goal or next milestone?
│  YES → P1
│  NO ↓
│
├─ Does this issue directly impact a significant portion of users (>20%)?
│  YES → P1
│  NO ↓
│
├─ Is this a meaningful improvement that a typical user would notice?
│  YES → P2
│  NO ↓
│
└─ Everything else → P3
   (If you can't articulate the user value → P3 or wontfix)
```

---

## Priority Escalation Rules

| Condition | Action |
|---|---|
| A P1 issue becomes a blocker (core flow breaks) | Escalate to P0, update justification |
| A P2 issue appears in next milestone planning | Escalate to P1 |
| A P0 issue is resolved or has a workaround | Re-triage — may drop to P1 if workaround fully covers users |
| A P3 issue is explicitly added to the roadmap | Escalate to P2 |

---

## Common Mistakes

| Mistake | Correct behavior |
|---|---|
| Labeling every bug as P0 | P0 requires blocking behavior or compliance risk — be strict |
| Labeling every feature request as P1 | P1 requires a sprint/milestone commitment |
| Using priority to express urgency to the current developer | Priority is product-level, not personal urgency |
| Skipping justification on P0 | Mandatory — no exceptions |
| Inflating priority to get attention | Inflated priorities dilute the signal for reviewers |
