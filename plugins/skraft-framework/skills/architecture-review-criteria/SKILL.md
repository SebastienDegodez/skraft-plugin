---
name: architecture-review-criteria
description: Use when reviewing DESIGN artefacts (event models, ADRs, component diagrams, context maps, interface contracts) for quality, DDD compliance, and architectural correctness. Contains gate definitions and scoring rubric for the DESIGN review lenses.
---

# Architecture Review Criteria

Criteria for the DESIGN review lenses (consistency, architecture-compliance, fitness) and their
refuter. Your agent file holds your gates and their severities; this skill says how to judge
each one.

## Before judging

- **Proposed counts as Accepted.** The review runs before human ratification, so every ADR the
  DESIGN pass under review wrote is `Proposed`. Where a gate requires an `Accepted` ADR, a
  `Proposed` ADR of this pass satisfies it; where a gate forbids an `Accepted` ADR, it forbids a
  `Proposed` ADR of this pass too.
- **A finding that an ADR carries** (it states the wrong choice, or repeats one an artefact is
  faulted for) names that ADR in its suggestion: a `Proposed` ADR is rewritten in place, an
  `Accepted` one is replaced by a new ADR that supersedes it.
- **Structural scan.** G1 and G14 read the engine's `structural-scan.json` among the DESIGN
  documents (signatures: command/query bus, event store / `Apply(...Event)`, saga / process
  manager), never a hand-typed grep. When it is absent, use the grep the consistency matrix
  states. Cross-context ACLs are found by reading.
- **Not yours to report** — the engine already checks: a consistency matrix exists per story and
  reads `consistency-gate: PASS` (G10); no ADR file name carries a verdict (G14); every `**Supersedes:**` line of a new ADR has its row
  in `docs/adr/supersessions.md` (G2, G12).
  The engine also refuses version pins, a `decision` longer than one sentence, a status outside the closed set, a missing index row and an in-place edit of a published ADR: do not report them.

## Gate checks

Read [references/gate-checks.md](references/gate-checks.md) for the gates in your table before
judging: the check, a failing case and a passing case per gate.

Read [references/violations.md](references/violations.md) when a diagram or contract shows an
aggregate, a domain event, a repository, a context-map label or a use case whose placement you
must classify: each violation names the gate it is reported under.

## Fitness judgements

**G9 — every element answers a story.** Ask, and report G9 when the answer is "none" or "future
needs":

| Element | Question |
|---|---|
| Bounded context | Which story requires it to be separate? |
| Aggregate | Which invariant does it enforce, and which story produces it? |
| Event Sourcing | Which story requires an audit trail or temporal queries? |
| Saga | Which cross-aggregate workflow spans several stories? |
| ACL | Which conflicting upstream model requires translation, or is the downstream Core? |

**G11 — admissible forces** for CQRS, Event Sourcing, Saga, eventual consistency, a service split
or an ACL: read/write asymmetry (shape, scale or freshness), an audit trail or temporal query a
story requires, a cross-service boundary that cannot be one ACID transaction, a measured
contention hotspot, a regulatory separation. "Consistency with existing code" alone is not one.
The `Alternatives Rejected` section also needs a "do without the pattern" row argued on
technical merit, not a one-line dismissal.

**G15 — enforced baselines** never get their own ADR: CQS at method level (one handler interface
per command or query), Clean Architecture layer boundaries, convention-based handler
registration, the repository pattern as such. Suspect titles: `Apply CQS`, `Use layered
architecture`, `Use repositories`, `Register handlers via DI`. An ADR on a deviation from a
baseline, or an addition on top of it (CQRS with a bus, Event Sourcing, a custom DI strategy), is
valid.

**G17 — eligibility.** A library ADR is eligible only through the constraint it imposes (layer boundary, data-loading model); a body about the library's usage is G17.

**G18 — decision level.** A line that would change when the code is refactored without changing the decision belongs in the contracts or diagrams.
