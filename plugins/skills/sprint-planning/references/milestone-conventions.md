# Milestone Conventions

Standards for creating and managing milestones in the skraft SDLC pipeline. Milestones represent the deliverable output of one DISCUSS phase cycle.

---

## Naming Convention

```
v{major}.{minor}-{theme}
```

| Component | Rules | Examples |
|---|---|---|
| `v{major}` | Increment on breaking changes, major scope shifts, or production releases. Starts at `v0`. | `v0`, `v1`, `v2` |
| `{minor}` | Increment per sprint or feature set. Starts at `1` for each major version. | `v0.1`, `v0.2`, `v1.0` |
| `{theme}` | Lowercase kebab-case. Describes the sprint's primary deliverable in 1-3 words. | `driver-profile`, `eligibility`, `document-upload`, `payment`, `launch` |

### Naming Examples

| Milestone | Context |
|---|---|
| `v0.1-driver-profile` | First sprint: driver personal details and licence validation stories |
| `v0.2-eligibility` | Second sprint: eligibility check, rejection flows, certificate download |
| `v0.3-document-upload` | Third sprint: document submission and verification |
| `v0.4-payment` | Fourth sprint: payment processing and policy issuance |
| `v1.0-launch` | Production launch milestone: all pre-launch stories |
| `v1.1-underwriter-review` | Post-launch: manual review flow for borderline applications |

---

## Scope Definition

### What Belongs in a Milestone

A milestone contains stories that:
- Share a single coherent theme (expressible in one sentence by the whole team)
- Together deliver an independently demonstrable user journey segment
- Are estimated to fit within the sprint's sustainable capacity

### What Does NOT Belong

- Stories from a different feature theme (put them in their own milestone)
- Stories with unresolved dependencies on future milestones
- XL stories that have not been split
- Stories that failed the DoR gate

### Milestone Size Constraints

| Constraint | Rule |
|---|---|
| Story count | 3–8 stories per milestone |
| Duration | 1–2 calendar weeks |
| Team size | 1–5 engineers (larger teams need milestone sub-themes) |
| Minimum stories | < 3 stories → consider merging with adjacent milestone |
| Maximum stories | > 8 stories → split into two milestones with sub-themes |

---

## GitHub Milestone Fields

| Field | Content | Example |
|---|---|---|
| **Title** | `v{major}.{minor}-{theme}` | `v0.2-eligibility` |
| **Description** | 2–3 sentences: sprint goal, key deliverables, explicit non-goals | See template below |
| **Due date** | Confirmed sprint end date (Friday of sprint end week) | `2026-05-23` |

### Description Template

```
Sprint goal: {one sentence describing the primary user outcome delivered by this milestone}.
Key deliverables: {comma-separated list of 2-4 story titles or user capabilities}.
Out of scope: {1-2 things explicitly excluded to prevent scope creep}.
```

**Filled example:**
```
Sprint goal: A driver can check their insurance eligibility and receive an
immediate decision before starting the document upload process.
Key deliverables: driver eligibility check, rejection notices with reasons,
eligibility certificate valid for 30 days.
Out of scope: document upload, payment processing, underwriter manual review.
```

---

## When to Create a New Milestone

| Situation | Action |
|---|---|
| Previous milestone ships (all stories done) | Create the next milestone for the following sprint |
| Sprint theme shifts (new feature domain) | Create a new milestone with the new theme |
| > 2 weeks of work remain in current milestone | Split: move lower-priority stories to a new milestone |
| Stories from two unrelated themes accumulate | Split into two separate milestones |
| Hotfix needed mid-sprint | Create a `vX.Y-hotfix` milestone alongside the current one |

## When to Extend a Current Milestone

| Situation | Action |
|---|---|
| 1-2 stories slip by 1-2 days with the same theme | Extend the due date; do not create a new milestone |
| A Should-Have story is re-introduced after capacity re-assessment | Add to current milestone if capacity allows |

---

## Milestone Readiness for DESIGN

A milestone is **ready for DESIGN** when ALL of the following are true:

1. All assigned stories carry `status/ready` label
2. All assigned stories are DoR-approved by `backlog-planner-reviewer` (verdict: `approved`)
3. No story has `status/blocked` or `status/needs-refinement`
4. Dependency graph is a valid DAG (no cycles)
5. Sprint capacity check passes (total story-days ≤ sustainable capacity)
6. Milestone has a confirmed due date

When all conditions are met: trigger DESIGN phase. The solution-architect agent reads `stories-{milestone}.md` as its primary input.

---

## Milestone Template

```markdown
## Milestone: {v{major}.{minor}-{theme}}

**Sprint goal:** {one sentence}
**Due date:** {YYYY-MM-DD}
**Team:** {n} engineers

### Key Deliverables
- {story title 1}
- {story title 2}
- {story title 3}

### Out of Scope
- {explicitly excluded item 1}
- {explicitly excluded item 2}

### Stories

| ID | Title | Persona | Effort | Priority | DoR | Dependencies |
|---|---|---|---|---|---|---|
| STORY-01 | {title} | {persona} | M | Must | ✅ | None |
| STORY-02 | {title} | {persona} | S | Must | ✅ | STORY-01 |
| STORY-03 | {title} | {persona} | M | Must | ✅ | STORY-01, STORY-02 |

### Capacity Check
- Team: {n} engineers × {d} days × 0.7 = {capacity} story-days available
- Scheduled: {total} story-days
- Status: ✅ Within capacity / ⚠️ Over capacity by {x} story-days

### Dependency Graph
```
{STORY-01}
  ↓
{STORY-02} (depends on STORY-01)
  ↓
{STORY-03} (depends on STORY-01, STORY-02)
```

### Milestone Readiness for DESIGN
- [ ] All stories carry `status/ready`
- [ ] All stories approved by backlog-planner-reviewer
- [ ] No blocked stories
- [ ] Dependency DAG validated (no cycles)
- [ ] Capacity check passes
- [ ] Due date confirmed with stakeholders
```
