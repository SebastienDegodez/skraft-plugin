---
name: sprint-planning
description: Use when planning sprint content, prioritizing stories within milestones, estimating capacity, or analyzing dependency graphs between stories. Covers MoSCoW prioritization, milestone management, velocity tracking, and dependency resolution for GitHub-based workflows.
---

# Sprint Planning

## Overview

Sprint planning decides which stories enter a milestone and in what order. Input: a list of DoR-approved stories from DISCUSS. Output: a prioritised, capacity-bounded, dependency-resolved sprint plan.

A sprint plan answers three questions:
1. **What** enters this milestone? (MoSCoW prioritization)
2. **How much** fits? (capacity check)
3. **In what order?** (dependency sequencing)

---

## MoSCoW Prioritization

Assign one MoSCoW label to every story before placing it in a milestone.

### Priority Levels

| Level | Label | Definition | Capacity rule |
|---|---|---|---|
| **Must Have** | `priority/must` | No sprint value delivered without it. Legal compliance, core user journey, removes a blocker. | Must-Haves fill ≤ 60% of sprint capacity. |
| **Should Have** | `priority/should` | High value but a workaround exists. Would significantly improve user experience. | Should-Haves fill ≤ 30% of sprint capacity. |
| **Could Have** | `priority/could` | Nice-to-have. Easy to cut without impacting the core sprint goal. | Could-Haves fill the remaining capacity. First items cut if overloaded. |
| **Won't Have** | `priority/wont` | Explicitly out of scope for this sprint. Documented to avoid re-discussion. | Not scheduled. |

### Application Steps

1. For each story, ask: "Can the sprint goal be achieved without this story?"
   - No → Must Have
   - Yes, but degraded → Should Have
   - Yes, no degradation → Could Have

2. Fill capacity: Must-Haves first, then Should-Haves, then Could-Haves.

3. If Must-Haves alone exceed 60% of capacity: escalate to product owner for scope negotiation.

### Auto-Insurance Domain Examples

| Story | MoSCoW | Reasoning |
|---|---|---|
| Driver eligibility check | Must Have | Core user journey — no application without eligibility |
| Driver profile form | Must Have | Required input for eligibility check |
| Eligibility certificate download | Should Have | Value: driver needs proof; workaround: manual email |
| Underwriter manual review flow | Should Have | Handles borderline cases; workaround: agent call |
| Dark mode for the portal | Could Have | UX improvement, no user journey impact |
| Policy cancellation flow | Won't Have | Deferred: not part of this milestone's theme |

---

## Milestone Management

### Naming Convention

```
v{major}.{minor}-{theme}
```

| Component | Rule | Example |
|---|---|---|
| `v{major}` | Increment on breaking changes or major scope shifts | `v1` = first production release |
| `{minor}` | Increment per sprint / feature set | `v0.2` = second pre-release sprint |
| `{theme}` | Lowercase kebab-case descriptor of the sprint goal | `eligibility`, `driver-profile`, `payment` |

**Examples:** `v0.1-driver-profile`, `v0.2-eligibility`, `v0.3-document-upload`, `v1.0-launch`

### Milestone Scope

A well-scoped milestone:
- Contains 3–8 stories (fewer → unclear sprint goal; more → unmanageable)
- Spans 1–2 calendar weeks
- Has a clearly named theme that the entire team can articulate in one sentence
- Has a due date confirmed with stakeholders

**When to create a new milestone vs extend current:**
- New milestone: sprint theme shifts, previous milestone ships, more than 2 weeks of work remain
- Extend current: 1-2 stories slip by one day with same theme

### GitHub Milestone Setup

Fields to populate for every milestone:

| Field | Content |
|---|---|
| Title | `v{major}.{minor}-{theme}` |
| Description | 2-3 sentences: sprint goal, key deliverables, non-goals |
| Due date | Confirmed sprint end date |

A milestone is "ready for DESIGN" when all its assigned stories are DoR-approved by the backlog-planner-reviewer and carry `status/ready`.

---

## Dependency Analysis

### Building the Dependency Graph

1. Read the `Dependencies` section of each story
2. Build a directed adjacency list: Story A → depends on → Story B means "B must complete before A starts"
3. Visualise as a DAG (Directed Acyclic Graph)

```
Example dependency graph for eligibility milestone:

STORY-01 (Personal Details)
  ↓
STORY-02 (Licence Validation) — depends on STORY-01
  ↓
STORY-03 (Eligibility Check) — depends on STORY-01, STORY-02
  ↓
STORY-04 (Document Upload) — depends on STORY-03
  ↓
STORY-05 (Payment) — depends on STORY-03, STORY-04
```

### DAG Validation

A valid dependency graph is a DAG — no cycles. Perform depth-first search. If a back-edge is found, a cycle exists.

**Cycle detection example (invalid):**
```
STORY-03 → depends on → STORY-05
STORY-05 → depends on → STORY-03
```
→ Cycle: STORY-03 ↔ STORY-05. Neither can start. Must be resolved by splitting one story or removing the circular dependency.

### Sequencing Rule

Deliver dependencies before dependents. Respect topological order when scheduling stories within a sprint:
1. Stories with no dependencies: start on day 1
2. Stories with one dependency: start after dependency is demo'd
3. Stories with multiple dependencies: start after ALL dependencies are demo'd

### Dependency Resolution

When a dependency cannot be resolved within the sprint (the dependency story is too large or not planned):
1. Split the dependent story to remove the dependency (preferred)
2. Move the dependent story to the next milestone
3. Never start a story knowing its dependency will not be available

---

## Capacity Heuristics

### Sustainable Pace Formula

```
Available sprint capacity (story-days) = team_size × sprint_duration_days × 0.7
```

The 0.7 factor accounts for: standups, PR reviews, team meetings, unplanned incidents, context switching.

**Example:**
- Team: 3 engineers
- Sprint: 5 working days (1 week)
- Raw capacity: 3 × 5 = 15 engineer-days
- Sustainable capacity: 15 × 0.7 = **10.5 story-days**

### T-Shirt to Day Mapping

| Size | Story-days |
|---|---|
| XS | 0.25 |
| S | 0.5 |
| M | 1.0 |
| L | 2.0 |
| XL | ⛔ Stop — must split before entering sprint |

### Sprint Capacity Check

```
Total scheduled story-days = Σ (story-days per story in sprint)
Sprint is valid if: total scheduled story-days ≤ sustainable capacity
```

**Example check:**
```
Sprint: v0.2-eligibility
Team: 3 engineers, 1 week → sustainable capacity: 10.5 story-days

Stories scheduled:
  STORY-01 (Personal Details) — S → 0.5 days
  STORY-02 (Licence Validation) — M → 1.0 day
  STORY-03 (Eligibility Check) — M → 1.0 day
  STORY-04 (Document Upload) — M → 1.0 day
  STORY-05 (Payment) — L → 2.0 days
  STORY-06 (Policy Confirmation) — S → 0.5 days

Total: 0.5 + 1.0 + 1.0 + 1.0 + 2.0 + 0.5 = 6.0 story-days ✅ (under 10.5)
```

### Signs of Overloaded Sprint

- Total story-days > sustainable capacity
- All stories are Must Have (no flexibility to cut)
- 2+ L-sized stories in the same sprint
- A dependency chain that occupies the full sprint duration (no parallel work possible)

**When overloaded:**
1. Cut Could-Haves first (move to next milestone)
2. Cut Should-Haves second
3. Split largest story if none of the above frees enough capacity
4. Never cut Must-Haves without product owner approval

---

## GitHub Conventions

### Labels

Apply these labels to issues corresponding to stories:

| Category | Labels |
|---|---|
| Status | `status/ready`, `status/in-progress`, `status/in-review`, `status/done`, `status/blocked` |
| Priority | `priority/must`, `priority/should`, `priority/could`, `priority/wont` |
| Effort | `effort/XS`, `effort/S`, `effort/M`, `effort/L` |
| Phase | `phase/discuss`, `phase/design`, `phase/distill`, `phase/deliver` |

### Story Decomposition

If a story is split during DISCUSS, use GitHub sub-issues:
- Parent issue: the original story (labelled `effort/L` or `effort/XL` before splitting)
- Child issues: the split stories (each labelled with their own effort and status)
- Link parent to children using "Tracked by" relationship in GitHub Issues

### Milestone Assignment

Assign each DoR-approved story's GitHub issue to the sprint milestone immediately after sprint planning. The milestone title must match the naming convention: `v{major}.{minor}-{theme}`.

---

## References

- [prioritization-matrix.md](references/prioritization-matrix.md) — MoSCoW table, value/effort matrix, scoring formula
- [milestone-conventions.md](references/milestone-conventions.md) — naming, scope, GitHub setup, readiness criteria
