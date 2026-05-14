# Decision Drivers — Trade-off Analysis Framework

## Overview

Every architectural decision involves trade-offs. There are no "obviously correct" architecture choices — only choices that are better or worse given a specific set of forces. This framework provides a structured approach to identifying forces, evaluating options, and documenting the reasoning behind a decision.

**Purpose:** Ensure that ADRs reflect genuine analysis, not post-hoc rationalisation of a choice already made.

---

## The 5 Universal Forces

| Force | Question to answer | Why it matters |
|---|---|---|
| **Simplicity** | Does this make the system easier to understand and change? | Simple systems are more maintainable and onboard new team members faster. Complexity is a form of technical debt. |
| **Consistency** | Does this fit the patterns already established in this codebase? | Inconsistent patterns force developers to context-switch and understand multiple paradigms. |
| **Performance** | Does this meet the performance requirements without over-engineering? | Under-provisioned systems fail; over-engineered systems waste resources. Both must be justified. |
| **Evolvability** | Does this make future changes easier or harder? | Architecture that resists change becomes the bottleneck. But adding flexibility for hypothetical futures is YAGNI. |
| **Team capability** | Can the current team maintain this without a steep learning curve? | The best architecture is the one the team can implement correctly. A brilliant pattern used incorrectly is worse than a simpler correct one. |

---

## Trade-off Analysis Template

Use this table in the Context section of an ADR when the decision is genuinely hard (two or more options with real merits).

```markdown
| Force | Option A: {name} | Option B: {name} | Weight |
|---|---|---|---|
| Simplicity | {High / Medium / Low} | {High / Medium / Low} | {High / Medium / Low} |
| Consistency | | | |
| Performance | | | |
| Evolvability | | | |
| Team capability | | | |
| **→ Weighted score** | | | |
```

**Scoring guide:**
- High = 3, Medium = 2, Low = 1
- Weight High = ×3, Weight Medium = ×2, Weight Low = ×1
- Sum the weighted scores for each option
- The score informs the decision — it does not make it automatically

---

## Common Architectural Decision Scenarios

### Scenario 1: CQRS vs Single Model

**Forces in tension:**

| Force | Single Model | CQRS |
|---|---|---|
| Simplicity | High — one model to maintain | Low — two separate code paths |
| Consistency | High — follows existing CRUD pattern | Medium — requires team alignment |
| Performance | Medium — read/write shapes may conflict | High — each side optimised independently |
| Evolvability | Low — adding read concerns pollutes write model | High — sides evolve independently |
| Team capability | High — familiar pattern | Medium — requires understanding of CQRS semantics |

**Decision heuristic:** Apply CQRS when the read and write shapes diverge significantly OR when read/write scalability requirements differ. Default to single model for simple features.

---

### Scenario 2: Event Sourcing vs State-Based Persistence

**Forces in tension:**

| Force | State-Based | Event Sourcing |
|---|---|---|
| Simplicity | High — direct state update | Low — event lifecycle, projections, upcasting |
| Consistency | High — standard ORM/repository pattern | Low — different paradigm for entire team |
| Performance | High — direct read | Medium — replay cost on load (mitigated by snapshots) |
| Evolvability | Low — historical queries require schema redesign | High — history is always available; projections are disposable |
| Team capability | High — universally understood | Low — significant learning investment |

**Decision heuristic:** Apply Event Sourcing only when history provides regulatory, audit, or temporal query value. Never apply speculatively.

---

### Scenario 3: Bounded Context Boundary Placement

**Forces in tension:**

| Placement option | Forces favouring it | Forces against it |
|---|---|---|
| Merge into one context | Simpler deployment; fewer integration points | Language conflict; coupled teams; model compromise |
| Split into two contexts | Independent evolution; clear language per context | Integration overhead; ACL to maintain; two models of shared concepts |
| Shared Kernel for overlap | Avoids duplication of the shared concept | High coordination cost; shared lifecycle; blocks independent deployment |

**Decision heuristic:** Where the same business term means different things, draw a boundary. Where teams have different release cadences, draw a boundary. Do not split for technical reasons alone.

---

### Scenario 4: ACL vs Conformist Relationship

**Forces in tension:**

| Force | Conformist | Anti-Corruption Layer |
|---|---|---|
| Simplicity | High — no translation code | Low — translation layer to design and maintain |
| Consistency | Low — upstream concepts invade downstream language | High — downstream language stays clean |
| Evolvability | Low — downstream changes whenever upstream changes | High — upstream changes are absorbed by the ACL |
| Team capability | High — no new pattern to learn | Medium — translation logic requires explicit design |
| Domain integrity | Low — Ubiquitous Language polluted | High — domain model protected |

**Decision heuristic:** Build an ACL when the upstream model uses conflicting terminology or is a legacy system. Accept Conformist when the upstream is a well-designed system with a language that fits the downstream's needs.

---

## Red Flags in Trade-off Analysis

The following are signs that an ADR's trade-off analysis is not genuine:

### Red Flag 1: Decision Maximises All Criteria Equally

```markdown
// Suspicious: every force scored "High" for the chosen option
| Force | Chosen option |
|---|---|
| Simplicity | High |
| Performance | High |
| Evolvability | High |
| Team capability | High |
```

If a chosen option has no downside, the analysis is incomplete. Every architectural decision has at least one trade-off.

**Fix:** Force yourself to name at least one negative consequence in the Consequences section of the ADR.

---

### Red Flag 2: Alternatives Are Strawmen

```markdown
// Suspicious: alternative rejected with a vague or trivially weak reason
| Alternative | Reason rejected |
|---|---|
| Single model | "Too complex" |
| Event Sourcing | "Overkill" |
```

Strawman rejections suggest the alternatives were never genuinely considered.

**Fix:** The rejection reason must be specific: which force does this alternative fail on, and why? "Single model rejected because the read model for the driver portal requires 5 computed fields from 3 different tables — this would force the domain aggregate to expose display-specific properties."

---

### Red Flag 3: Decision Was Made Before Analysis

If the ADR's context section was written after the decision was already implemented, the forces described will conveniently justify the chosen approach. Historical ADRs written post-hoc are less trustworthy.

**Fix:** Write ADRs during DESIGN, before implementation. If writing a post-hoc ADR, acknowledge that explicitly: "This ADR documents a decision that was implemented before being formally recorded."

---

## Minimal Viable ADR Checklist

Use this before submitting an ADR for review:

- [ ] Forces are described in the Context section — not just the decision
- [ ] The Decision starts with "We will…" — not "We should consider…"
- [ ] At least one negative consequence is listed
- [ ] Alternatives Rejected section contains ≥2 real alternatives
- [ ] Each rejected alternative has a specific reason (not "too complex" alone)
- [ ] If this supersedes another ADR, both are updated and cross-referenced
