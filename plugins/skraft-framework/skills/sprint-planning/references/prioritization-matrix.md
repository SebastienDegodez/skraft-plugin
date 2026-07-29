# Prioritization Matrix

Tools for deciding which stories enter a sprint and in what order.

---

## MoSCoW Classification Table

| Level | Must Have | Should Have | Could Have | Won't Have |
|---|---|---|---|---|
| **Definition** | Without it, the sprint delivers no value. Core user journey, legal compliance, or blocker removal. | High value, workaround exists. Degrades experience but does not prevent core function. | Incremental improvement. Easily deferred without impacting core journey. | Explicitly out of scope. Documented to close the conversation. |
| **Delivery impact** | Sprint fails without it | Sprint succeeds but degraded | Sprint succeeds, opportunity missed | No impact on sprint |
| **Cut threshold** | Never cut without PO approval | Cut only when Must-Haves exceed 60% capacity | First to cut when sprint is overloaded | Already excluded |
| **Capacity ceiling** | ≤ 60% of sprint capacity | ≤ 30% of sprint capacity | Remaining capacity | 0% |
| **GitHub label** | `priority/must` | `priority/should` | `priority/could` | `priority/wont` |

### MoSCoW Decision Questions

Ask these in order for each story:

1. **Can the sprint goal be delivered without this story?**
   - No → Must Have

2. **Would absence of this story significantly degrade the user experience?**
   - Yes → Should Have

3. **Is this a nice-to-have improvement with no journey impact?**
   - Yes → Could Have

4. **Should this be explicitly deferred to a future sprint?**
   - Yes → Won't Have (document the decision)

---

## Auto-Insurance Domain Examples

| Story | Priority | Reasoning |
|---|---|---|
| STORY-01: Driver enters personal details | Must Have | First step of application — nothing works without it |
| STORY-03: Driver eligibility check | Must Have | Core value proposition — drivers need to know if they qualify |
| STORY-02: Licence validation | Must Have | Required input for eligibility — eligibility fails without it |
| STORY-04: Document upload | Should Have | Required for policy but manual workaround (email) exists |
| STORY-06: Eligibility certificate download | Should Have | Proof of eligibility needed but PDF can be emailed |
| STORY-07: Underwriter manual review | Should Have | Handles borderline cases; workaround: phone call |
| STORY-09: Dark mode for web portal | Could Have | Accessibility improvement, no journey impact |
| STORY-10: Policy cancellation flow | Won't Have | Deferred — cancellation out of scope for v0.2 milestone |

---

## Value vs Effort Matrix (2×2)

Use this matrix when MoSCoW alone does not differentiate between stories at the same priority level.

```
            LOW EFFORT          HIGH EFFORT
           ┌──────────────────┬──────────────────┐
HIGH VALUE │   Quick Wins     │  Strategic Bets  │
           │  → Do first      │  → Plan carefully │
           ├──────────────────┼──────────────────┤
LOW VALUE  │   Fill-ins       │   Avoid          │
           │  → Do if capacity│  → Defer or cut  │
           └──────────────────┴──────────────────┘
```

| Quadrant | Stories | Sprint action |
|---|---|---|
| High Value / Low Effort (Quick Wins) | Driver eligibility check (M), licence validation (M) | Do first — high ROI |
| High Value / High Effort (Strategic Bets) | Full application flow (L), payment integration (L) | Plan carefully — split if possible |
| Low Value / Low Effort (Fill-ins) | Copy improvements (XS), minor UX tweaks (S) | Only if capacity remains after Quick Wins |
| Low Value / High Effort (Avoid) | Legacy COBOL integration (XL) without clear user value | Defer or cut |

---

## Priority Scoring Formula (Optional)

Use when the team needs a numeric ranking to break ties between stories at the same MoSCoW level.

```
Priority Score = (Business Value × 3 + Risk Reduction × 2) / Effort
```

| Field | Scale | Description |
|---|---|---|
| Business Value | 1-5 | 5 = core user journey, legal requirement; 1 = marginal improvement |
| Risk Reduction | 1-5 | 5 = eliminates a blocking risk; 1 = no risk impact |
| Effort | 1-5 mapped from T-shirt: XS=1, S=2, M=3, L=4, XL=5 | Higher effort = lower score |

**Example calculation:**

| Story | Business Value | Risk Reduction | Effort (T-shirt → score) | Priority Score |
|---|---|---|---|---|
| STORY-03: Eligibility Check | 5 | 4 | M → 3 | (5×3 + 4×2) / 3 = **7.67** |
| STORY-07: Manual Review Flow | 3 | 2 | L → 4 | (3×3 + 2×2) / 4 = **3.25** |
| STORY-09: Dark Mode | 1 | 1 | S → 2 | (1×3 + 1×2) / 2 = **2.50** |

Higher score = higher priority. Sort descending, fill sprint from top until capacity is reached.

**Note:** This formula is a decision aid, not a mandate. Product owner has final say on priority.

---

## GitHub Label Mapping

Apply these labels during sprint planning for each story's GitHub issue:

| Priority | GitHub label | Colour (suggestion) |
|---|---|---|
| Must Have | `priority/must` | Red `#d73a49` |
| Should Have | `priority/should` | Orange `#e36209` |
| Could Have | `priority/could` | Yellow `#f9c513` |
| Won't Have | `priority/wont` | Grey `#6a737d` |
