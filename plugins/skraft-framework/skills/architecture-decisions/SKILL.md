---
name: architecture-decisions
description: Use when documenting architecture decisions as ADRs, evaluating trade-offs between alternatives, or managing the lifecycle of existing decisions. Covers ADR template, status transitions, consequence analysis, and quality criteria.
---

# Architecture Decisions

## Overview

Architecture Decision Records (ADRs) are lightweight documents that capture architectural decisions together with their context, alternatives considered, and consequences. They are the institutional memory of the architecture.

**Purpose:** An ADR answers the question: "Why does the architecture look the way it does?" Future readers — including future you — should be able to understand any structural decision without needing to ask the original author.

**Core rule:** One ADR per decision. A decision is a single, clear choice with trade-offs.

---

## ADR Template

Read [references/adr-template.md](references/adr-template.md) before writing or rewriting an ADR, never from memory: the Blank Template, the file naming rules, the row of the decision index, the ADR Quality Checklist and filled examples.

Every ADR opens with the YAML header of that template, before its `# ADR-{NNN}` title: `adr`, `title`, `status`, `chosen`, `decision` (one sentence), `supersedes`, `date`, `ratified_by`. Its body holds Context, Decision, Consequences and Alternatives Rejected.

---

## Status and Lifecycle

```
Proposed → Accepted   → Deprecated
        ↘ Rejected    → Superseded by ADR-{NNN}
```

- **Proposed:** Decision is drafted, committed, and awaiting human ratification
- **Accepted:** Option was evaluated and adopted — the architecture reflects it
- **Rejected:** Option was evaluated and explicitly declined — the ADR records the analysis so the debate is not re-run later without new evidence
- **Deprecated:** Decision is no longer relevant (e.g., the feature was removed), but was never superseded
- **Superseded:** Decision has been replaced by a newer one — always reference the successor

**Linking rule:** When ADR-002 supersedes ADR-001:
- ADR-001 status: `Superseded by ADR-002`
- ADR-002 context: reference ADR-001 — "This supersedes ADR-001, which prescribed X."

**No ADR is ever deleted.** The historical record of why a decision was made is as valuable as the decision itself.

### Human-in-the-loop ratification

The `Proposed → Accepted | Rejected` transition is owned by a human, not the agent. The ratification channel is supplied by the execution context (the orchestrating workflow when running in an agentic pipeline, or an in-terminal prompt when running locally) — this skill does not prescribe the channel.

**Both transitions are committed:** the `Proposed` revision AND the final `Accepted` / `Rejected` revision land in git history. The trail of "we paused here for a human" is part of the architectural record.

### Rejected ADRs

A `Rejected` ADR documents that an option was seriously evaluated and the team decided NOT to adopt it. The ADR exists so the same debate is not re-opened in six months without new evidence.

- **Filename:** named after the SUBJECT — `adr-NNN-event-sourcing.md`, NEVER `adr-NNN-event-sourcing-rejected.md`. The verdict lives in `Status:`, not in the filename.
- **Decision phrasing:** MAY start with "We will not adopt X because…" — this is precisely what a `Rejected` status means.
- **Trigger requirement:** a `Rejected` ADR is written ONLY when a story or measurable force in the current batch raised the question (see G9 traceability). A `Rejected` ADR with no triggering story is a non-decision artefact and is forbidden.
- **Alternatives Rejected section** is flipped: list what the team adopted INSTEAD (e.g., "state-based persistence with audit-log table").

---

## Decision Digest — cheap-to-read verdict surface

The full ADR body is the *rationale*. No reader (the orchestrator's ratification gate, the reviewer, DISTILL, the next-pass blocker re-grounding) should re-read a whole ADR body just to learn its **verdict**. The digest is the stable, cheap-to-read surface that carries only the verdict-bearing fields. It exists in two mirrored forms.

### Per-ADR decision header

Every ADR file begins with the YAML frontmatter of the Blank Template, **before** the `# ADR-{NNN}` title. A reader greps ONLY this frontmatter (the first ~10 lines) to obtain `status`, `chosen`, and the one-line `decision`. Load the prose body solely when the *rationale* is needed (e.g. re-evaluating a supersession). Keep the header free of dynamic noise — no timestamps beyond `date`, no per-run paths — so it stays a stable prefix.

### Project-global decision index — `docs/adr/decisions-index.md`

An append-only registry, sibling of `docs/adr/supersessions.md`. One row per ADR aggregates the header fields. One read of this file yields every decision in the project without opening a single ADR body.

Its header row and an example: [references/adr-template.md](references/adr-template.md).

Write rule: when an ADR is first committed (`Status: Proposed`), append its row with `Ratified by: —`. On the ratification status flip, update **only** the `Status` and `Ratified by` cells of that row in place — the row is never removed and never reordered (numbering stays monotonic, matching the supersession-registry doctrine).

### Reading the digest cheaply (S7 deterministic bridge + fallback)

The verdict read is a deterministic tool bridge, not a body load. Prefer, in order:

1. **Whole project at once** — read the index table:
   `cat docs/adr/decisions-index.md` (one small file = every decision).
2. **One ADR's verdict from the index** — `grep '^| 007 ' docs/adr/decisions-index.md`.
3. **One ADR's full header without its body** — extract only the YAML frontmatter (POSIX awk, no deps):
   ```sh
   awk '/^---$/{c++; if(c==1){f=1; next}} c==2{exit} f' docs/adr/adr-007-*.md
   ```
   (Tolerates an optional leading comment line; stops at the closing `---`, so the prose body is never read. Pipe to `grep -E '^(status|chosen|decision):'` for just the verdict fields.)

**Fallback:** if the command tool is unavailable or returns empty (file missing, malformed frontmatter), fall back to `read_file` on the first ~12 lines of the ADR — never load the whole body just to learn the verdict.

---

## Ratification Contract (single source of the human gate)

This is the canonical definition of the `Proposed -> Accepted | Rejected` gate. The orchestrating workflow and the architect persona REFERENCE this contract; they do not redefine it.

1. **Agent drafts, human decides.** The agent commits every story-triggered ADR with `Status: Proposed` and appends its digest row. The agent NEVER self-ratifies — it cannot set `Accepted` / `Rejected` on its own authority.
2. **Gate fires after quality review, not before.** Ratification is requested only once the DESIGN reviewer has APPROVED the artefacts. Asking a human to ratify a draft that may fail adversarial review wastes their attention and trains rubber-stamping.
3. **The gate is a hard pre-condition for the next phase.** No downstream phase (DISTILL) may begin while any ADR in the current pass is still `Proposed`. Advancing without the verdict is a post-hoc checkpoint — the decision would already be in effect before the human chose.
4. **The verdict surface is the digest.** The gate presents the decision index / headers (the one-line decisions), NOT the full ADR bodies. The human may open a body on demand via the link.
5. **Both revisions land in git.** The `Proposed` commit AND the final `Accepted` / `Rejected` commit are both committed — the trail of "we paused for a human here" is part of the architectural record. On the flip, set `ratified_by` in the header and update the index row.
6. **Channel is supplied by the execution context.** In the agentic pipeline the orchestrator owns the channel and the HALT; in a standalone local run, prompt the developer in-terminal. This skill prescribes the contract, not the transport.

---

## When to Write an ADR

Only for a candidate the `adr-eligibility-gate` skill finds `ELIGIBLE`: it is `NOT ELIGIBLE` until the gate proves otherwise, and zero ADRs is the normal outcome of a story. The gate holds the candidates that may pass and the Never-an-ADR list.

### When NOT to Write an ADR

Besides the gate's Never-an-ADR list:
- Implementation details (naming conventions, code formatting)
- Library version choices — unless the version has architectural impact (e.g., switching from EF Core to Dapper changes the data access strategy)
- Configuration choices (connection string format, environment variable names)

---

## Trade-off Framework

Every ADR must demonstrate genuine trade-off analysis — not a decision with only upsides.

### The 5 Universal Forces

| Force | Question |
|---|---|
| **Simplicity** | Does this make the system easier to understand and change? |
| **Consistency** | Does this fit the patterns already established in this codebase? |
| **Performance** | Does this meet the performance requirements without over-engineering? |
| **Evolvability** | Does this make future changes easier or harder? |
| **Team capability** | Can the current team maintain this without a steep learning curve? |

Read [references/decision-drivers.md](references/decision-drivers.md) for the scoring table, decision scenarios and the signs of an analysis that is not genuine. Use the table in the Context section when the decision is genuinely hard. Skip it for obvious decisions.

---

## ADR Quality Checklist

Before writing the final ADR, check it against the ADR Quality Checklist of [references/adr-template.md](references/adr-template.md).

---

## References

- [adr-template.md](references/adr-template.md) — Blank Template, file naming, decision index row, ADR Quality Checklist, filled auto-insurance examples
- [decision-drivers.md](references/decision-drivers.md) — Trade-off analysis table, decision scenarios, red flags
